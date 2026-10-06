"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { disconnectConversationSockets } from "@/lib/chat-admin";
import { chooseChatIdentity } from "@/lib/chat-identity";
import { loadLiveChatProfessional } from "@/lib/chat-professional-session";
import { needLabels } from "@/lib/constants";
import { TRASH_GRACE_MS } from "@/lib/conversation-purge";
import { newId, nowIso } from "@/lib/ids";
import {
  conversationUrl,
  notifyAdminWaitlistEntry,
  notifyConversationDeleted,
  notifyConversationReopened,
  notifyWaitlistConfirmation,
} from "@/lib/notifications";
import { getRequesterHash } from "@/lib/requester-hash";
import {
  createSeekerAccessLink,
  SEEKER_SESSION_TTL_MS,
} from "@/lib/seeker-access";
import {
  mintProfessionalInboxToken,
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
  verifySeekerToken,
} from "@/lib/seeker-token";
import { waitlistChatSignupSchema } from "@/lib/validation";
import { waitlistSourceLabels } from "@/lib/waitlist";
import { storeWaitlistEntry } from "@/lib/waitlist-store";

const TTL_MS = 72 * 60 * 60 * 1000; // 72h, igual que el token del seeker.

/**
 * Resuelve la identidad del actor de una acción sobre la sala con la MISMA
 * prelación que la página y el WebSocket (src/lib/chat-identity.ts): el
 * profesional con sesión vigente gana por defecto; el seeker solo si no
 * hay credencial profesional o si el profesional pide actuar como la persona
 * (`asPersona`, desde su vista de persona). Devuelve null si no hay ninguna.
 */
async function resolveActor(
  conversation: typeof conversations.$inferSelect,
  asPersona: boolean,
): Promise<{
  role: "seeker" | "professional";
  actorEmail: string | null;
  professionalId: string | null;
  userId: string | null;
  authSessionId: string | null;
  expiresAt: number;
  seekerSid: string | null;
} | null> {
  if (
    conversation.anonymizedAt ||
    !["open", "closed"].includes(conversation.status)
  )
    return null;
  const cookieStore = await cookies();

  // El actor profesional exige la sesión autenticada vigente en DB.
  const liveProfessional = await loadLiveChatProfessional(
    conversation.professionalId,
  );
  const isProfessional = !!liveProfessional;
  const actorEmail = liveProfessional?.professional.email ?? null;
  const professionalUserId = liveProfessional?.userId ?? null;

  // Persona (seeker): la sesión puede ser la original o una del enlace mágico
  // (/acceso). Cualquier fila vigente de ESTA conversación vale — es la misma
  // regla que la vista (`chat-view.ts`), el WebSocket (`auth-gate.ts`) y
  // `renewSeekerChatToken`. (Antes se exigía el sid original y el enlace del
  // correo abría la sala sin poder reabrir/borrar.)
  let seekerSid: string | null = null;
  let seekerExpiresAt = 0;
  const raw = cookieStore.get(SEEKER_COOKIE)?.value;
  if (raw) {
    const payload = verifySeekerToken(raw, getAuthSecret(), Date.now());
    if (payload && payload.conversationId === conversation.id) {
      const sessionRow = await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, payload.sid),
      });
      const valid =
        !!sessionRow &&
        sessionRow.conversationId === conversation.id &&
        sessionRow.role === "seeker" &&
        !sessionRow.revokedAt &&
        sessionRow.expiresAt.getTime() > Date.now();
      if (valid) {
        seekerSid = payload.sid;
        seekerExpiresAt = Math.min(payload.exp, sessionRow.expiresAt.getTime());
      }
    }
  }

  const identity = chooseChatIdentity(
    { professional: isProfessional, seeker: seekerSid !== null },
    asPersona,
  );
  if (!identity) return null;
  return identity === "professional"
    ? {
        role: "professional",
        actorEmail,
        professionalId: conversation.professionalId,
        userId: professionalUserId,
        authSessionId: liveProfessional?.authSessionId ?? null,
        expiresAt: liveProfessional?.expiresAt ?? 0,
        seekerSid: null,
      }
    : {
        role: "seeker",
        actorEmail: null,
        professionalId: null,
        userId: null,
        authSessionId: null,
        expiresAt: seekerExpiresAt,
        seekerSid,
      };
}

// Se repite dentro de la escritura: un permiso leído antes de otro await no
// autoriza una operación si la cuenta, la sesión o el dueño ya cambió.
function actorPermission(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>,
  conversationId: string,
) {
  if (actor.role === "professional") {
    return sql`EXISTS(SELECT 1 FROM conversations owned JOIN professionals p ON p.id=owned.professional_id
      WHERE owned.id=${conversationId} AND p.id=${actor.professionalId} AND p.status='approved'
        AND p.user_id=${actor.userId}
        AND EXISTS(SELECT 1 FROM session a WHERE a.id=${actor.authSessionId}
          AND a.user_id=p.user_id AND a.expires_at > (cast(unixepoch('subsecond') * 1000 as integer))))`;
  }
  return sql`EXISTS(SELECT 1 FROM seeker_sessions s WHERE s.sid=${actor.seekerSid}
    AND s.conversation_id=${conversationId} AND s.role='seeker' AND s.revoked_at IS NULL
    AND s.expires_at > (cast(unixepoch('subsecond') * 1000 as integer)))`;
}

/** Guard fresco para revelar/exportar/restaurar E2EE en ESTA sala y rol. */
export async function verifyConversationE2eeActor(
  conversationId: string,
  role: "professional" | "seeker",
  expectedProfessionalId?: string,
): Promise<{ ok: boolean; expiresAt?: number }> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation || conversation.deletedAt || conversation.anonymizedAt)
    return { ok: false };
  const actor = await resolveActor(conversation, role === "seeker");
  if (!actor || actor.role !== role || actor.expiresAt <= Date.now())
    return { ok: false };
  if (
    role === "professional" &&
    actor.professionalId !== expectedProfessionalId
  )
    return { ok: false };
  const rows =
    await db.all(sql`SELECT id FROM conversations WHERE id=${conversationId}
    AND deleted_at IS NULL AND anonymized_at IS NULL AND status IN ('open','closed')
    AND ${actorPermission(actor, conversationId)} LIMIT 1`);
  return rows.length && actor.expiresAt > Date.now()
    ? { ok: true, expiresAt: actor.expiresAt }
    : { ok: false };
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
  const live = await loadLiveChatProfessional();
  if (!live) return { ok: false };
  const pro = live.professional;

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (
    !conversation ||
    conversation.professionalId !== pro.id ||
    conversation.anonymizedAt ||
    conversation.deletedAt ||
    !["open", "closed"].includes(conversation.status)
  ) {
    return { ok: false };
  }

  const now = Date.now();
  const token = mintProfessionalToken(
    {
      professionalId: pro.id,
      authSessionId: live.authSessionId,
      userId: live.userId,
      conversationId,
      role: "professional",
      iat: now,
      exp: Math.min(now + TTL_MS, live.expiresAt),
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

/** El timestamp corresponde al mensaje visible y descifrado, nunca a abrir la sala. */
export async function markProfessionalChatRead(
  conversationId: string,
  messageTimestamp: number,
): Promise<{ ok: boolean; retryable?: boolean }> {
  if (
    !Number.isSafeInteger(messageTimestamp) ||
    messageTimestamp <= 0 ||
    messageTimestamp > Date.now()
  )
    return { ok: false };
  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
    if (!conversation || conversation.deletedAt || conversation.anonymizedAt)
      return { ok: false };
    const actor = await resolveActor(conversation, false);
    if (actor?.role !== "professional") return { ok: false };
    // El DO entrega el mensaje antes de que su espejo de metadatos alcance D1.
    // Si todavía va detrás, conservar la lectura pendiente evita confirmar una
    // marca menor que luego convertiría el mensaje ya leído en no leído.
    const rows = await db.all(sql`UPDATE conversations
      SET pro_last_read_at=max(coalesce(pro_last_read_at,0),${messageTimestamp})
      WHERE id=${conversationId} AND last_message_at IS NOT NULL AND deleted_at IS NULL AND anonymized_at IS NULL
        AND last_message_at >= ${messageTimestamp} AND status IN ('open','closed')
        AND ${actorPermission(actor, conversationId)} RETURNING id`);
    if (rows.length > 0) return { ok: true };
    // Sólo el retraso comprobado de metadatos permite un reintento automático.
    // Volvemos a verificar permisos y estado para no reintentar una revocación.
    const lagging = await db.all(sql`SELECT id FROM conversations
      WHERE id=${conversationId} AND deleted_at IS NULL AND anonymized_at IS NULL
        AND status IN ('open','closed')
        AND (last_message_at IS NULL OR last_message_at < ${messageTimestamp})
        AND ${actorPermission(actor, conversationId)} LIMIT 1`);
    return lagging.length > 0 ? { ok: false, retryable: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Token de AVISOS del profesional (cookie httpOnly, sin sala concreta): autoriza
 * las conexiones de SOLO LECTURA que la lista de conversaciones del chat abre a
 * sus salas para avisar al instante de mensajes nuevos. El Worker comprueba en
 * D1 que cada sala pedida es suya; aquí solo se verifica que quien lo pide tiene
 * sesión y ficha de profesional activa. Idempotente.
 */
export async function ensureProInboxToken(): Promise<{ ok: boolean }> {
  const live = await loadLiveChatProfessional();
  if (!live) return { ok: false };
  const pro = live.professional;

  const now = Date.now();
  const token = mintProfessionalInboxToken(
    {
      professionalId: pro.id,
      authSessionId: live.authSessionId,
      userId: live.userId,
      role: "inbox",
      iat: now,
      exp: Math.min(now + 15 * 60 * 1000, live.expiresAt),
    },
    getAuthSecret(),
  );

  const cookieStore = await cookies();
  cookieStore.set(PRO_INBOX_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
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
  if (
    !conversation ||
    conversation.anonymizedAt ||
    conversation.deletedAt ||
    !["open", "closed"].includes(conversation.status)
  )
    return { ok: false };

  const session = await db.query.seekerSessions.findFirst({
    where: eq(seekerSessions.sid, payload.sid),
  });
  if (
    !session ||
    session.revokedAt ||
    session.role !== "seeker" ||
    session.expiresAt.getTime() <= Date.now() ||
    session.conversationId !== conversationId
  ) {
    return { ok: false };
  }

  const now = Date.now();
  const expiresAt = now + SEEKER_SESSION_TTL_MS;
  const renewed = await db
    .update(seekerSessions)
    .set({ expiresAt: new Date(expiresAt), lastSeenAt: new Date(now) })
    .where(
      and(
        eq(seekerSessions.sid, payload.sid),
        eq(seekerSessions.conversationId, conversationId),
        eq(seekerSessions.role, "seeker"),
        isNull(seekerSessions.revokedAt),
        sql`${seekerSessions.expiresAt} > (cast(unixepoch('subsecond') * 1000 as integer))`,
        sql`EXISTS(SELECT 1 FROM conversations c WHERE c.id=${conversationId} AND c.anonymized_at IS NULL AND c.deleted_at IS NULL AND c.status IN ('open','closed'))`,
      ),
    )
    .returning({ sid: seekerSessions.sid });
  if (!renewed.length) return { ok: false };

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
  if (conversation.deletedAt || conversation.status !== "closed") {
    return { ok: false, reason: "not_closed" };
  }

  // ¿Quién reabre? Misma prelación que la vista y el WebSocket: profesional por
  // defecto, o como la persona si el profesional pidió su vista (`asPersona`).
  const actor = await resolveActor(conversation, asPersona);
  if (!actor) return { ok: false, reason: "not_authorized" };
  const { role, actorEmail } = actor;

  const timestamp = nowIso();
  const logId = newId("log");
  let results: unknown[][];
  try {
    results = await db.batch([
      db.all(sql`UPDATE professionals SET current_active_requests=current_active_requests+1,updated_at=${timestamp}
        WHERE id=${conversation.professionalId} AND status='approved' AND current_active_requests < max_active_requests
          AND ${actorPermission(actor, conversationId)}
          AND EXISTS(SELECT 1 FROM conversations c WHERE c.id=${conversationId} AND c.professional_id=professionals.id
            AND c.status='closed' AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
            AND (c.help_request_id IS NULL OR EXISTS(SELECT 1 FROM help_requests h WHERE h.id=c.help_request_id
              AND h.status IN ('closed','new','offered') AND h.anonymized_at IS NULL))) RETURNING id`),
      db.all(sql`UPDATE conversations SET status='open',closed_at=NULL,closed_reason=NULL,reopened_at=${Date.now()},quota_released_at=NULL,updated_at=${timestamp}
        WHERE id=${conversationId} AND status='closed' AND changes()=1 RETURNING id`),
      db.all(sql`INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,metadata,created_at)
        SELECT ${logId},${actorEmail},'conversation_reopened','conversation',${conversationId},${JSON.stringify({ role })},${timestamp} WHERE changes()=1 RETURNING id`),
      db.all(sql`UPDATE help_requests SET status='assigned',updated_at=${timestamp}
        WHERE id=${conversation.helpRequestId} AND EXISTS(SELECT 1 FROM audit_logs WHERE id=${logId})`),
      db.all(sql`UPDATE assignments SET status='missed',updated_at=${timestamp}
        WHERE help_request_id=${conversation.helpRequestId} AND status='offered' AND EXISTS(SELECT 1 FROM audit_logs WHERE id=${logId})`),
      db.all(sql`UPDATE assignments SET status=CASE WHEN source='seeker' THEN 'accepted' ELSE 'assigned' END,updated_at=${timestamp}
        WHERE help_request_id=${conversation.helpRequestId} AND professional_id=${conversation.professionalId} AND status='closed'
          AND EXISTS(SELECT 1 FROM audit_logs WHERE id=${logId})`),
    ]);
  } catch {
    // Todo el batch revierte: no se compensa sólo el contador de un hilo abierto.
    return { ok: false, reason: "unavailable" };
  }
  if (!results[0].length || !results[1].length) {
    const current = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
    if (
      !current ||
      current.deletedAt ||
      current.anonymizedAt ||
      current.status !== "closed"
    )
      return { ok: false, reason: "not_closed" };
    if (!(await resolveActor(current, asPersona)))
      return { ok: false, reason: "not_authorized" };
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, current.professionalId),
    });
    if (
      pro?.status !== "approved" ||
      pro.currentActiveRequests >= pro.maxActiveRequests
    )
      return { ok: false, reason: "no_capacity" };
    return { ok: false, reason: "unavailable" };
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
  | { ok: true; role: "seeker" | "professional"; purgeAfter: string }
  | { ok: false; message: string };

/**
 * PAPELERA con deshacer (7 días): borra para las dos partes, pero el contenido
 * (ya cifrado de extremo a extremo) se conserva cifrado hasta que vence
 * `purgeAfter`; entonces el cron lo purga de verdad. Cualquiera de las dos
 * partes puede restaurarla desde el enlace o la propia sala. Así un borrado
 * accidental no destruye el historial y el borrado definitivo sigue siendo real.
 *
 * Puede borrar la persona (cookie de sala vigente) o el profesional dueño. Se
 * avisa a la contraparte por correo (sin contenido) con enlace para recuperar.
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
  if (conversation.deletedAt) {
    return {
      ok: false,
      message:
        "Esta conversación ya está en la papelera. Usa el enlace del correo para recuperarla.",
    };
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

  const timestamp = nowIso();
  const purgeAfter = new Date(Date.now() + TRASH_GRACE_MS);

  const results = await db.batch([
    db
      .update(conversations)
      .set({
        deletedAt: new Date(),
        purgeAfter,
        deletedByRole: role,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          isNull(conversations.deletedAt),
          isNull(conversations.anonymizedAt),
          actorPermission(actor, conversationId),
        ),
      )
      .returning({ id: conversations.id }),
    db.all(sql`INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,metadata,created_at)
      SELECT ${newId("log")},${actorEmail},'conversation_deleted','conversation',${conversationId},${JSON.stringify({ role, trash: true, purgeAfter: purgeAfter.toISOString() })},${timestamp} WHERE changes()=1`),
  ]);
  if (!results[0].length)
    return {
      ok: false,
      message:
        "La conversación ya cambió. Actualiza la página antes de borrarla.",
    };
  await disconnectConversationSockets(conversationId);

  // Avisa a la CONTRAPARTE (best-effort: un fallo de correo no rompe el borrado)
  // para que no se sorprenda y pueda recuperarla durante la ventana.
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
        await notifyConversationDeleted({
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
        await notifyConversationDeleted({
          email: pro.email,
          audience: "professional",
          url: conversationUrl(conversationId),
        });
      }
    }
  } catch {
    // best-effort
  }

  return { ok: true, role, purgeAfter: purgeAfter.toISOString() };
}

export type RestoreConversationResult =
  | { ok: true; role: "seeker" | "professional" }
  | { ok: false; message: string };

/**
 * Saca la conversación de la papelera (mismo hilo, mismo historial cifrado).
 * Cualquiera de las dos partes puede hacerlo mientras no venza `purgeAfter`.
 */
export async function restoreConversation(
  conversationId: string,
  asPersona = false,
): Promise<RestoreConversationResult> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) {
    return { ok: false, message: "Esta conversación ya no existe." };
  }
  const actor = await resolveActor(conversation, asPersona);
  if (!actor) {
    return {
      ok: false,
      message: "No pudimos verificar que seas parte de esta conversación.",
    };
  }
  if (!conversation.deletedAt) {
    return { ok: true, role: actor.role };
  }
  if (
    conversation.purgeAfter &&
    conversation.purgeAfter.getTime() <= Date.now()
  ) {
    return {
      ok: false,
      message:
        "Pasó el plazo de recuperación: la conversación se eliminó para siempre.",
    };
  }

  const timestamp = nowIso();
  const results = await db.batch([
    db
      .update(conversations)
      .set({
        deletedAt: null,
        purgeAfter: null,
        deletedByRole: null,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.deletedAt, conversation.deletedAt),
          isNull(conversations.anonymizedAt),
          sql`${conversations.purgeAfter} > ${Date.now()}`,
          actorPermission(actor, conversationId),
        ),
      )
      .returning({ id: conversations.id }),
    db.all(sql`INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,metadata,created_at)
      SELECT ${newId("log")},${actor.actorEmail},'conversation_restored','conversation',${conversationId},${JSON.stringify({ role: actor.role })},${timestamp} WHERE changes()=1`),
  ]);
  if (!results[0].length)
    return {
      ok: false,
      message:
        "El plazo o el acceso a esta conversación ya cambió. Actualiza la página.",
    };

  return { ok: true, role: actor.role };
}

export type JoinWaitlistState =
  | { ok: true; email: string }
  | { ok: false; message: string }
  | null;

/**
 * La PERSONA deja su correo desde la tarjeta de lista de espera del chat.
 *
 * Solo puede hacerlo la persona de la conversación (cookie de sala vigente y
 * misma prelación de identidad que la vista/WebSocket): el profesional dueño
 * que esté viendo la sala como la persona también puede, porque actúa con su
 * credencial. El correo NUNCA viaja por el chat: va por HTTPS a D1 con el mismo
 * límite antiabuso del formulario público. El título y la descripción los
 * deriva el servidor de la conversación (área del caso y profesional), nunca
 * se aceptan del cliente.
 */
export async function joinWaitlistFromChat(
  _previous: JoinWaitlistState,
  formData: FormData,
): Promise<JoinWaitlistState> {
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  if (!conversationId) {
    return { ok: false, message: "No pudimos identificar la conversación." };
  }

  const parsed = waitlistChatSignupSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Revisa tu correo e inténtalo de nuevo.",
    };
  }
  const email = parsed.data.email;

  try {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
    if (!conversation || conversation.deletedAt || conversation.anonymizedAt) {
      return {
        ok: false,
        message: "Esta conversación ya no está disponible para anotarte.",
      };
    }

    const asPersona = String(formData.get("asPersona") ?? "") === "1";
    const actor = await resolveActor(conversation, asPersona);
    if (actor?.role !== "seeker") {
      return {
        ok: false,
        message: "Solo la persona de esta conversación puede anotar su correo.",
      };
    }

    if (formData.get("generalReason") !== "1")
      return {
        ok: false,
        message:
          "Confirma que esta solicitud es por un motivo ajeno al terremoto.",
      };
    const authorization = sql`${actorPermission(actor, conversationId)} AND EXISTS(
      SELECT 1 FROM conversations c WHERE c.id=${conversationId}
        AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
    )`;
    // Contexto para la ficha del admin: área del caso y nombre del profesional.
    const [request, pro] = await Promise.all([
      conversation.helpRequestId
        ? db.query.helpRequests.findFirst({
            where: eq(helpRequests.id, conversation.helpRequestId),
            columns: { needCategory: true },
          })
        : null,
      db.query.professionals.findFirst({
        where: eq(professionals.id, conversation.professionalId),
        columns: { displayName: true, fullName: true },
      }),
    ]);
    const needCategory = request?.needCategory as
      | keyof typeof needLabels
      | undefined;
    const needLabel = needCategory ? needLabels[needCategory] : undefined;
    const proName =
      pro?.displayName || pro?.fullName || "un profesional voluntario";

    const requesterHash = await getRequesterHash("waitlist_entry");
    const stored = await storeWaitlistEntry({
      email,
      title: needLabel ?? "Apoyo psicológico (desde el chat)",
      description: `Anotación creada desde la tarjeta de lista de espera del chat con ${proName}. La persona busca apoyo por un motivo ajeno al terremoto y quiere que le avisemos cuando haya disponibilidad.`,
      source: "chat",
      conversationId,
      requesterHash,
      authorization,
    });
    if (!stored.ok) {
      return {
        ok: false,
        message:
          stored.reason === "rate_limited"
            ? "Ya te anotamos hace poco. Espera un rato antes de intentarlo de nuevo."
            : "No pudimos guardar tu anotación. Inténtalo de nuevo en unos minutos.",
      };
    }

    // Un chat directo puede no tener correo (p. ej. sin solicitud de /ayuda):
    // guardarlo habilita los avisos por correo y el enlace mágico de /acceso.
    // Nunca sobreescribimos un correo ya existente con uno nuevo.
    if (!conversation.seekerEmail) {
      await db
        .update(conversations)
        .set({ seekerEmail: email, updatedAt: nowIso() })
        .where(
          and(
            eq(conversations.id, conversationId),
            sql`seeker_email IS NULL`,
            authorization,
          ),
        );
    }

    // Solo la PRIMERA anotación dispara correos (actualizar no reenvía avisos).
    if (stored.created) {
      await notifyAdminWaitlistEntry({
        sourceLabel: waitlistSourceLabels.chat,
      }).catch(() => undefined);
      await notifyWaitlistConfirmation({ email }).catch(() => undefined);
    }

    return { ok: true, email };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos guardar tu anotación. Inténtalo de nuevo en unos minutos.",
    };
  }
}
