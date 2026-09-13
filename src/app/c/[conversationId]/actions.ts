"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { disconnectConversationSockets } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";
import {
  conversationUrl,
  notifyConversationReopened,
} from "@/lib/notifications";
import {
  createSeekerAccessLink,
  SEEKER_SESSION_TTL_MS,
} from "@/lib/seeker-access";
import {
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  SEEKER_COOKIE,
  verifySeekerToken,
} from "@/lib/seeker-token";

const TTL_MS = 72 * 60 * 60 * 1000; // 72h, igual que el token del seeker.

/**
 * El profesional ya entró con Google. Al abrir /c/<id> verificamos que la
 * conversación es suya y le minteamos un PRO_COOKIE (HMAC) para que el
 * onBeforeConnect del Worker autorice su WebSocket sin volver a llamar a
 * better-auth dentro del Worker. Idempotente.
 */
export async function ensureProChatToken(
  conversationId: string,
): Promise<{ ok: boolean }> {
  const session = await getServerSession();
  if (!session?.user?.id) return { ok: false };

  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });
  if (!pro) return { ok: false };

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation || conversation.professionalId !== pro.id) {
    return { ok: false };
  }

  // Marca de lectura: al abrir la sala se limpia el "nuevo" de su bandeja.
  await db
    .update(conversations)
    .set({ proLastReadAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const now = Date.now();
  const token = mintProfessionalToken(
    {
      professionalId: pro.id,
      conversationId,
      role: "professional",
      iat: now,
      exp: now + TTL_MS,
    },
    getAuthSecret(),
  );

  const cookieStore = await cookies();
  cookieStore.set(PRO_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Path "/" para que viaje también al upgrade WebSocket en /parties/*.
    path: "/",
    maxAge: TTL_MS / 1000,
  });
  return { ok: true };
}

/**
 * Sesión DESLIZANTE del seeker: mientras la conversación siga viva (no
 * anonimizada) y su sesión no esté revocada, cada visita dentro de la sala
 * renueva cookie + fila de `seeker_sessions` hasta 90 días. Así el chat se puede
 * retomar durante la ventana de retención sin pedir otro enlace; tras una
 * ausencia mayor, el enlace mágico de /acceso devuelve el acceso.
 *
 * No bloquea la conexión si falla: el token vigente puede seguir valiendo.
 */
export async function renewSeekerChatToken(
  conversationId: string,
): Promise<{ ok: boolean }> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SEEKER_COOKIE)?.value;
  if (!raw) return { ok: false };

  const payload = verifySeekerToken(raw, getAuthSecret(), Date.now());
  if (!payload || payload.conversationId !== conversationId) {
    return { ok: false };
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation || conversation.anonymizedAt) return { ok: false };

  const session = await db.query.seekerSessions.findFirst({
    where: eq(seekerSessions.sid, payload.sid),
  });
  if (
    !session ||
    session.revokedAt ||
    session.conversationId !== conversationId
  ) {
    return { ok: false };
  }

  const now = Date.now();
  const expiresAt = now + SEEKER_SESSION_TTL_MS;
  await db
    .update(seekerSessions)
    .set({ expiresAt: new Date(expiresAt), lastSeenAt: new Date(now) })
    .where(eq(seekerSessions.sid, payload.sid));

  const token = mintSeekerToken(
    {
      sid: payload.sid,
      conversationId,
      helpRequestId: payload.helpRequestId,
      role: "seeker",
      iat: now,
      exp: expiresAt,
    },
    getAuthSecret(),
  );
  cookieStore.set(SEEKER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEEKER_SESSION_TTL_MS / 1000,
  });
  return { ok: true };
}

export type ReopenResult =
  | { ok: true; role: "seeker" | "professional" }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_authorized"
        | "anonymized"
        | "not_closed"
        | "no_capacity"
        | "unavailable";
    };

/**
 * Reabre la MISMA conversación cerrada (mismo hilo, sin crear otra) dentro de la
 * ventana de retención. Puede hacerlo la persona (cookie de sala vigente) o el
 * profesional dueño. Re-reserva cupo atómicamente: sin cupo no se reabre. Al
 * reabrir se reencola el caso (solicitud + asignación) y se cortan los sockets
 * para que reconecten con permiso de escritura.
 */
export async function reopenConversation(
  conversationId: string,
): Promise<ReopenResult> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) return { ok: false, reason: "not_found" };
  if (conversation.anonymizedAt) return { ok: false, reason: "anonymized" };
  if (conversation.status !== "closed") {
    return { ok: false, reason: "not_closed" };
  }

  // ¿Quién reabre? Seeker (cookie HMAC + sesión vigente de ESTA sala) o el
  // profesional dueño (better-auth). Cualquier otro: no autorizado.
  let role: "seeker" | "professional" | null = null;
  let actorEmail: string | null = null;

  const cookieStore = await cookies();
  const raw = cookieStore.get(SEEKER_COOKIE)?.value;
  if (raw) {
    const payload = verifySeekerToken(raw, getAuthSecret(), Date.now());
    if (
      payload &&
      payload.conversationId === conversationId &&
      payload.sid === conversation.seekerSid
    ) {
      const session = await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, payload.sid),
      });
      const valid =
        !!session &&
        !session.revokedAt &&
        session.expiresAt.getTime() > Date.now();
      if (valid) role = "seeker";
    }
  }

  if (!role) {
    const session = await getServerSession();
    if (session?.user?.id) {
      const pro = await db.query.professionals.findFirst({
        where: eq(professionals.userId, session.user.id),
      });
      if (
        pro &&
        pro.id === conversation.professionalId &&
        pro.status !== "suspended"
      ) {
        role = "professional";
        actorEmail = session.user.email ?? null;
      }
    }
  }

  if (!role) return { ok: false, reason: "not_authorized" };

  // Re-reserva de cupo (una sola sentencia atómica; guardas de estado y tope).
  const reserved = await db
    .update(professionals)
    .set({
      currentActiveRequests: sql`${professionals.currentActiveRequests} + 1`,
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(professionals.id, conversation.professionalId),
        eq(professionals.status, "approved"),
        sql`${professionals.currentActiveRequests} < ${professionals.maxActiveRequests}`,
      ),
    )
    .returning({ id: professionals.id });
  if (reserved.length === 0) {
    return { ok: false, reason: "no_capacity" };
  }

  const timestamp = nowIso();
  try {
    // Solo reabre si sigue cerrada: dos reaperturas simultáneas no duplican cupo.
    const reopened = await db
      .update(conversations)
      .set({
        status: "open",
        closedAt: null,
        closedReason: null,
        reopenedAt: new Date(),
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.status, "closed"),
        ),
      )
      .returning({ id: conversations.id });
    if (reopened.length === 0) {
      await db
        .update(professionals)
        .set({
          currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
          updatedAt: nowIso(),
        })
        .where(eq(professionals.id, conversation.professionalId));
      return { ok: false, reason: "not_closed" };
    }

    // Rearma el caso si la conversación venía de una solicitud. El reclamo es
    // ATÓMICO y amplía los estados reclamables (closed/new/offered): si el caso
    // quedó reencolado (p. ej. por una suspensión) y otra persona lo tomó,
    // `assigned` ya no es reclamable y no reabrimos para no duplicar atención.
    if (conversation.helpRequestId) {
      const claimedRequest = await db
        .update(helpRequests)
        .set({ status: "assigned", updatedAt: timestamp })
        .where(
          and(
            eq(helpRequests.id, conversation.helpRequestId),
            inArray(helpRequests.status, ["closed", "new", "offered"]),
          ),
        )
        .returning({ id: helpRequests.id });
      if (claimedRequest.length === 0) {
        // Alguien más está atendiendo este caso: deshacemos conversación y cupo.
        await db
          .update(conversations)
          .set({
            status: "closed",
            closedAt: timestamp,
            closedReason: conversation.closedReason,
            reopenedAt: conversation.reopenedAt,
            updatedAt: timestamp,
          })
          .where(eq(conversations.id, conversationId));
        await db
          .update(professionals)
          .set({
            currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
            updatedAt: nowIso(),
          })
          .where(eq(professionals.id, conversation.professionalId));
        return { ok: false, reason: "unavailable" };
      }

      // Cierra ofertas hermanas pendientes: nadie más puede tomarla ahora.
      await db
        .update(assignments)
        .set({ status: "missed", updatedAt: timestamp })
        .where(
          and(
            eq(assignments.helpRequestId, conversation.helpRequestId),
            eq(assignments.status, "offered"),
          ),
        );

      const assignment = await db.query.assignments.findFirst({
        where: and(
          eq(assignments.helpRequestId, conversation.helpRequestId),
          eq(assignments.professionalId, conversation.professionalId),
        ),
      });
      if (assignment && assignment.status === "closed") {
        await db
          .update(assignments)
          .set({
            status: assignment.source === "seeker" ? "accepted" : "assigned",
            updatedAt: timestamp,
          })
          .where(eq(assignments.id, assignment.id));
      }
    }

    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail,
      action: "conversation_reopened",
      entityType: "conversation",
      entityId: conversationId,
      metadata: JSON.stringify({ role }),
      createdAt: timestamp,
    });
  } catch (error) {
    // Compensa el cupo si algo falló tras reservarlo.
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, conversation.professionalId));
    throw error;
  }

  // Los sockets vivos siguen con canSend=false de cuando se cerró: se cortan y
  // reconectan evaluando el estado nuevo (ya abierto).
  await disconnectConversationSockets(conversationId);

  // Avisa a la contraparte (best-effort: un fallo de correo no rompe la reapertura).
  try {
    if (role === "professional") {
      const request = conversation.helpRequestId
        ? await db.query.helpRequests.findFirst({
            where: eq(helpRequests.id, conversation.helpRequestId),
          })
        : null;
      const seekerEmail = conversation.seekerEmail ?? request?.email ?? null;
      if (seekerEmail) {
        const link = await createSeekerAccessLink({
          conversationId,
          helpRequestId: conversation.helpRequestId,
        });
        await notifyConversationReopened({
          email: seekerEmail,
          audience: "seeker",
          url: link.url,
        });
      }
    } else {
      const pro = await db.query.professionals.findFirst({
        where: eq(professionals.id, conversation.professionalId),
      });
      if (pro?.email) {
        await notifyConversationReopened({
          email: pro.email,
          audience: "professional",
          url: conversationUrl(conversationId),
        });
      }
    }
  } catch {
    // best-effort
  }

  return { ok: true, role };
}
