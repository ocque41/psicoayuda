import "server-only";

import { and, eq, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessRequests,
  auditLogs,
  conversations,
  helpRequests,
  seekerSessions,
} from "@/db/schema";
import {
  closeConversations,
  releaseAssignmentsForRequest,
} from "@/lib/assignment";
import { purgeConversationMessages } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSE_AFTER_MS = 90 * DAY_MS;
const ANONYMIZE_AFTER_MS = 180 * DAY_MS;
// La tabla del enlace mágico es desechable: solo sirve para limitar abuso.
const ACCESS_REQUESTS_TTL_MS = 7 * DAY_MS;

function isoMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Anonimización END-TO-END de una solicitud, reutilizada por la acción admin y
 * por el cron de retención. Cierra/libera asignaciones, borra el transcript del
 * chat en el Durable Object (el PII más sensible, que solo vive ahí), marca las
 * conversaciones como anonimizadas, limpia el hash de IP de las sesiones del
 * seeker y borra los datos de la fila help_requests.
 */
export async function anonymizeHelpRequest(
  requestId: string,
  actorEmail: string | null,
) {
  const timestamp = nowIso();

  // Cierra y libera la capacidad de cualquier asignación activa (esto además
  // cierra las conversaciones y revoca las sesiones del seeker).
  await releaseAssignmentsForRequest(requestId);

  // Borrado real del contenido del chat: vacía cada Durable Object y rompe el
  // hash de IP de la sesión del seeker (que sobrevivía a la anonimización).
  const convs = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.helpRequestId, requestId));
  let allPurged = true;
  for (const conversation of convs) {
    const purged = await purgeConversationMessages(conversation.id);
    if (!purged) allPurged = false;
    await db
      .update(seekerSessions)
      .set({ requesterHash: null, revokedAt: new Date() })
      .where(eq(seekerSessions.conversationId, conversation.id));
  }

  // BUG-D: si el transcript del DO (el PII más sensible, que SOLO vive ahí) no se
  // pudo borrar, NO marcamos nada como anonimizado ni tocamos
  // help_requests.updatedAt — así el cron (isNull(anonymizedAt) + updatedAt
  // antiguo) lo reintenta en la próxima pasada en vez de abandonar el transcript
  // para siempre mientras afirma que se anonimizó. Dejamos rastro del fallo.
  if (!allPurged) {
    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail,
      action: "data_anonymization_failed",
      entityType: "help_request",
      entityId: requestId,
      createdAt: timestamp,
    });
    return { ok: false as const };
  }

  if (convs.length > 0) {
    await db
      .update(conversations)
      .set({
        status: "closed",
        seekerName: null,
        seekerEmail: null,
        anonymizedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(conversations.helpRequestId, requestId));
  }

  await db
    .update(helpRequests)
    .set({
      // Token aleatorio: sin enlace residual al id de la solicitud original.
      email: `anon-${newId("anon")}@nido.local`,
      seekerName: null,
      country: null,
      state: null,
      city: null,
      lat: null,
      lng: null,
      locationConsent: false,
      consentContact: false,
      requesterHash: null,
      status: "closed",
      anonymizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(helpRequests.id, requestId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail,
    action: "data_anonymization",
    entityType: "help_request",
    entityId: requestId,
    createdAt: timestamp,
  });

  return { ok: true as const };
}

/**
 * Retención automática prometida en la política de privacidad: cierra lo
 * inactivo > 90 días y anonimiza > 180 días. La actividad en el chat (espejo
 * `last_message_at` del DO) renueva el reloj, también para los chats directos
 * sin solicitud. La dispara el cron de Cloudflare (ver custom-worker.ts
 * `scheduled()` -> /api/internal/retention). Idempotente.
 */
export async function runRetention(now: number = Date.now()) {
  const closeCutoff = new Date(now - CLOSE_AFTER_MS).toISOString();
  const anonymizeCutoff = new Date(now - ANONYMIZE_AFTER_MS).toISOString();

  // Reloj real por solicitud: el último mensaje del chat cuenta como actividad
  // aunque `help_requests.updatedAt` no se toque (el espejo DO→D1 escribe en
  // `conversations`). Solo se leen timestamps; jamás contenido.
  const activityRows = await db
    .select({
      helpRequestId: conversations.helpRequestId,
      lastMs: sql<
        number | null
      >`max(coalesce(${conversations.lastMessageAt}, cast(strftime('%s', ${conversations.updatedAt}) as integer) * 1000))`,
    })
    .from(conversations)
    .where(isNotNull(conversations.helpRequestId))
    .groupBy(conversations.helpRequestId);
  const activityByRequest = new Map(
    activityRows.map((row) => [row.helpRequestId, Number(row.lastMs ?? 0)]),
  );

  // 1) Anonimiza solicitudes inactivas > 180 días aún no anonimizadas.
  const toAnonymize = await db
    .select({ id: helpRequests.id, updatedAt: helpRequests.updatedAt })
    .from(helpRequests)
    .where(
      and(
        isNull(helpRequests.anonymizedAt),
        lt(helpRequests.updatedAt, anonymizeCutoff),
      ),
    );
  let anonymized = 0;
  const anonymizeFailed = new Set<string>();
  for (const request of toAnonymize) {
    const lastActivity = Math.max(
      isoMs(request.updatedAt),
      activityByRequest.get(request.id) ?? 0,
    );
    if (now - lastActivity < ANONYMIZE_AFTER_MS) continue;
    const result = await anonymizeHelpRequest(request.id, null);
    if (result.ok) {
      anonymized += 1;
    } else {
      anonymizeFailed.add(request.id);
    }
  }

  // 2) Cierra solicitudes inactivas > 90 días aún abiertas (y no anonimizadas).
  const toClose = await db
    .select({ id: helpRequests.id, updatedAt: helpRequests.updatedAt })
    .from(helpRequests)
    .where(
      and(
        isNull(helpRequests.anonymizedAt),
        ne(helpRequests.status, "closed"),
        lt(helpRequests.updatedAt, closeCutoff),
      ),
    );
  let closed = 0;
  for (const request of toClose) {
    // No cierres (ni bumpees updatedAt de) una solicitud cuya anonimización
    // acaba de fallar en el paso 1: déjala intacta para que el paso 1 la
    // reintente en la próxima pasada. Si la cerráramos aquí, su updatedAt nuevo
    // la sacaría ~180 días de la ventana de anonimización (el transcript del DO
    // sobreviviría todo ese tiempo mientras decimos que se anonimizó).
    if (anonymizeFailed.has(request.id)) continue;
    const lastActivity = Math.max(
      isoMs(request.updatedAt),
      activityByRequest.get(request.id) ?? 0,
    );
    if (now - lastActivity < CLOSE_AFTER_MS) continue;
    await releaseAssignmentsForRequest(request.id, "inactivity");
    // Sin bumpear updatedAt: el cierre no debe correr el reloj de inactividad
    // (si lo hiciera, la anonimización se retrasaría otros 180 días).
    await db
      .update(helpRequests)
      .set({ status: "closed" })
      .where(eq(helpRequests.id, request.id));
    closed += 1;
  }

  // 3) Chats DIRECTOS (sin solicitud): mismo ciclo 90/180. Antes quedaban fuera
  // del cron para siempre (ni se cerraban ni se purgaban). El reloj es el último
  // mensaje, la reapertura o la creación — nunca `updated_at`, que el cierre
  // bumpea y retrasaría la purga.
  const directActivity = sql`max(coalesce(${conversations.lastMessageAt}, 0), coalesce(${conversations.reopenedAt}, 0), cast(strftime('%s', ${conversations.createdAt}) as integer) * 1000)`;

  const directToAnonymize = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        isNull(conversations.helpRequestId),
        isNull(conversations.anonymizedAt),
        sql`${directActivity} < ${now - ANONYMIZE_AFTER_MS}`,
      ),
    );
  let directAnonymized = 0;
  for (const conversation of directToAnonymize) {
    const purged = await purgeConversationMessages(conversation.id);
    const timestamp = nowIso();
    if (!purged) {
      // Misma disciplina que BUG-D: sin purga real no se marca anonimizado, y
      // se deja rastro para reintentar en la próxima pasada.
      await db.insert(auditLogs).values({
        id: newId("log"),
        actorEmail: null,
        action: "conversation_anonymization_failed",
        entityType: "conversation",
        entityId: conversation.id,
        createdAt: timestamp,
      });
      continue;
    }
    await db
      .update(seekerSessions)
      .set({ requesterHash: null, revokedAt: new Date(now) })
      .where(eq(seekerSessions.conversationId, conversation.id));
    await db
      .update(conversations)
      .set({
        status: "closed",
        closedAt: timestamp,
        closedReason: "inactivity",
        seekerName: null,
        seekerEmail: null,
        anonymizedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(conversations.id, conversation.id));
    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: null,
      action: "conversation_anonymization",
      entityType: "conversation",
      entityId: conversation.id,
      createdAt: timestamp,
    });
    directAnonymized += 1;
  }

  // 4) Cierra (sin purgar) los chats directos inactivos que siguen abiertos.
  const directToClose = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        isNull(conversations.helpRequestId),
        eq(conversations.status, "open"),
        sql`${directActivity} < ${now - CLOSE_AFTER_MS}`,
      ),
    );
  await closeConversations(
    directToClose,
    nowIso(),
    new Date(now),
    "inactivity",
  );

  // 5) Purga la tabla desechable del enlace mágico (>7 días).
  await db
    .delete(accessRequests)
    .where(
      lt(accessRequests.createdAt, new Date(now - ACCESS_REQUESTS_TTL_MS)),
    );

  return {
    anonymized,
    closed,
    directClosed: directToClose.length,
    directAnonymized,
  };
}
