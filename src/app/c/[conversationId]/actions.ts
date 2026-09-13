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
  responseSamples,
  seekerSessions,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import {
  disconnectConversationSockets,
  purgeConversationMessagesDetailed,
} from "@/lib/chat-admin";
import { chooseChatIdentity } from "@/lib/chat-identity";
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
  verifyProfessionalToken,
  verifySeekerToken,
} from "@/lib/seeker-token";

const TTL_MS = 72 * 60 * 60 * 1000; // 72h, igual que el token del seeker.

/**
 * Resuelve la identidad del actor de una acción sobre la sala con la MISMA
 * prelación que la página y el WebSocket (src/lib/chat-identity.ts): el
 * profesional (sesión o cookie de sala) gana por defecto; el seeker solo si no
 * hay credencial profesional o si el profesional pide actuar como la persona
 * (`asPersona`, desde su vista de persona). Devuelve null si no hay ninguna.
 */
async function resolveActor(
  conversation: typeof conversations.$inferSelect,
  asPersona: boolean,
): Promise<{
  role: "seeker" | "professional";
  actorEmail: string | null;
} | null> {
  const cookieStore = await cookies();

  // Profesional dueño: sesión better-auth o cookie HMAC de la sala (72 h).
  let isProfessional = false;
  let actorEmail: string | null = null;
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
      isProfessional = true;
      actorEmail = session.user.email ?? null;
    }
  }
  if (!isProfessional) {
    const proRaw = cookieStore.get(PRO_COOKIE)?.value;
    if (proRaw) {
      const pro = verifyProfessionalToken(proRaw, getAuthSecret(), Date.now());
      if (
        pro &&
        pro.conversationId === conversation.id &&
        pro.professionalId === conversation.professionalId
      ) {
        const row = await db.query.professionals.findFirst({
          where: eq(professionals.id, conversation.professionalId),
        });
        if (row && row.status !== "suspended") {
          isProfessional = true;
          actorEmail = row.email;
        }
      }
    }
  }

  // Persona (seeker).
  let seekerSid: string | null = null;
  const raw = cookieStore.get(SEEKER_COOKIE)?.value;
  if (raw) {
    const payload = verifySeekerToken(raw, getAuthSecret(), Date.now());
    if (
      payload &&
      payload.conversationId === conversation.id &&
      payload.sid === conversation.seekerSid
    ) {
      const sessionRow = await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, payload.sid),
      });
      const valid =
        !!sessionRow &&
        !sessionRow.revokedAt &&
        sessionRow.expiresAt.getTime() > Date.now();
      if (valid) seekerSid = payload.sid;
    }
  }

  const identity = chooseChatIdentity(
    { professional: isProfessional, seeker: seekerSid !== null },
    asPersona,
  );
  if (!identity) return null;
  return identity === "professional"
    ? { role: "professional", actorEmail }
    : { role: "seeker", actorEmail: null };
}

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
  asPersona = false,
): Promise<ReopenResult> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) return { ok: false, reason: "not_found" };
  if (conversation.anonymizedAt) return { ok: false, reason: "anonymized" };
  if (conversation.status !== "closed") {
    return { ok: false, reason: "not_closed" };
  }

  // ¿Quién reabre? Misma prelación que la vista y el WebSocket: profesional por
  // defecto, o como la persona si el profesional pidió su vista (`asPersona`).
  const actor = await resolveActor(conversation, asPersona);
  if (!actor) return { ok: false, reason: "not_authorized" };
  const { role, actorEmail } = actor;

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
        // Reabrir re-ocupa un cupo: la marca de "cupo liberado" deja de aplicar.
        quotaReleasedAt: null,
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

export type DeleteConversationResult =
  | { ok: true; role: "seeker" | "professional" }
  | { ok: false; message: string };

/**
 * Borrado DEFINITIVO de una conversación. Puede hacerlo la persona (cookie de
 * sala vigente) o el profesional dueño. Borra el transcript del Durable Object,
 * las sesiones y las filas del espejo en D1: no hay vuelta atrás y el link deja
 * de existir. Hasta este momento el link era eterno. Queda auditado.
 *
 * Si el hilo venía de una solicitud (/ayuda): al borrar el profesional, el caso
 * vuelve a la cola para que otra persona pueda acompañar ("new"); si borra la
 * persona, el caso se cierra y no se reencola a nadie.
 */
export async function deleteConversation(
  conversationId: string,
  asPersona = false,
): Promise<DeleteConversationResult> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) {
    return { ok: false, message: "Esta conversación ya no existe." };
  }

  // ¿Quién borra? Misma prelación que la vista y el WebSocket: profesional por
  // defecto, o como la persona si el profesional pidió su vista (`asPersona`).
  const actor = await resolveActor(conversation, asPersona);
  if (!actor) {
    return {
      ok: false,
      message: "No pudimos verificar que seas parte de esta conversación.",
    };
  }
  const { role, actorEmail } = actor;

  // Primero el contenido: si en producción la purga del DO falla, NO borramos
  // las filas (quedarían transcripciones huérfanas sin forma de reintentar).
  // En local (sin binding del DO) la purga es "unavailable" y se procede: nunca
  // hubo contenido real que borrar.
  const purge = await purgeConversationMessagesDetailed(conversationId);
  if (purge === "failed") {
    // En `next dev` el binding del DO existe pero el runtime no lo sirve (el
    // propio workerd avisa "no such actor class"): ahí no hay contenido real que
    // perder y bloqueamos el flujo para poder probarlo en local. En producción
    // (build de OpenNext) un fallo de purga SÍ bloquea el borrado: nunca dejamos
    // transcripciones huérfanas sin fila D1 que las reintente.
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      await db.insert(auditLogs).values({
        id: newId("log"),
        actorEmail,
        action: "conversation_delete_purge_skipped_dev",
        entityType: "conversation",
        entityId: conversationId,
        metadata: JSON.stringify({ role }),
        createdAt: nowIso(),
      });
    } else {
      await db.insert(auditLogs).values({
        id: newId("log"),
        actorEmail,
        action: "conversation_delete_failed",
        entityType: "conversation",
        entityId: conversationId,
        metadata: JSON.stringify({ role }),
        createdAt: nowIso(),
      });
      return {
        ok: false,
        message:
          "No pudimos borrar la conversación en este momento. Inténtalo de nuevo en unos minutos.",
      };
    }
  }

  const timestamp = nowIso();
  let requeued = false;

  if (conversation.helpRequestId) {
    const assignment = await db.query.assignments.findFirst({
      where: and(
        eq(assignments.helpRequestId, conversation.helpRequestId),
        eq(assignments.professionalId, conversation.professionalId),
      ),
    });
    const activeAssignment =
      assignment &&
      (assignment.status === "assigned" || assignment.status === "accepted");
    if (assignment && activeAssignment) {
      const closedAssignment = await db
        .update(assignments)
        .set({ status: "closed", updatedAt: timestamp })
        .where(
          and(
            eq(assignments.id, assignment.id),
            inArray(assignments.status, ["assigned", "accepted"]),
          ),
        )
        .returning({ id: assignments.id });
      if (closedAssignment.length > 0) {
        await db
          .update(professionals)
          .set({
            currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
            updatedAt: timestamp,
          })
          .where(eq(professionals.id, conversation.professionalId));

        if (role === "professional") {
          // El profesional deja el caso: vuelve a la cola para que otra persona
          // pueda acompañar. (Mismo criterio que la suspensión de perfil.)
          const requeuedRequest = await db
            .update(helpRequests)
            .set({ status: "new", updatedAt: timestamp })
            .where(
              and(
                eq(helpRequests.id, conversation.helpRequestId),
                eq(helpRequests.status, "assigned"),
              ),
            )
            .returning({ id: helpRequests.id });
          requeued = requeuedRequest.length > 0;
        } else {
          // La persona cierra su propio caso: no se reencola a nadie.
          await db
            .update(helpRequests)
            .set({ status: "closed", updatedAt: timestamp })
            .where(
              and(
                eq(helpRequests.id, conversation.helpRequestId),
                eq(helpRequests.status, "assigned"),
              ),
            );
        }
      }
    }
  } else if (!conversation.quotaReleasedAt) {
    // Chat directo que aún ocupaba cupo: se libera al borrarlo.
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: timestamp,
      })
      .where(eq(professionals.id, conversation.professionalId));
  }

  await db.batch([
    db
      .delete(seekerSessions)
      .where(eq(seekerSessions.conversationId, conversationId)),
    db
      .delete(responseSamples)
      .where(eq(responseSamples.conversationId, conversationId)),
    db.delete(conversations).where(eq(conversations.id, conversationId)),
  ]);

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail,
    action: "conversation_deleted",
    entityType: "conversation",
    entityId: conversationId,
    metadata: JSON.stringify({ role, requeued }),
    createdAt: timestamp,
  });

  return { ok: true, role };
}
