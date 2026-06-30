import "server-only";

import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  conversations,
  helpRequests,
  seekerSessions,
} from "@/db/schema";
import { releaseAssignmentsForRequest } from "@/lib/assignment";
import { purgeConversationMessages } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSE_AFTER_MS = 30 * DAY_MS;
const ANONYMIZE_AFTER_MS = 90 * DAY_MS;

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
      .set({ status: "closed", anonymizedAt: timestamp, updatedAt: timestamp })
      .where(eq(conversations.helpRequestId, requestId));
  }

  await db
    .update(helpRequests)
    .set({
      // Token aleatorio: sin enlace residual al id de la solicitud original.
      email: `anon-${newId("anon")}@nido.local`,
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
 * Retención automática prometida en la política de privacidad: cierra solicitudes
 * inactivas > 30 días y anonimiza > 90 días. La dispara el cron de Cloudflare
 * (ver custom-worker.ts `scheduled()` -> /api/internal/retention). Idempotente.
 */
export async function runRetention(now: number = Date.now()) {
  const closeCutoff = new Date(now - CLOSE_AFTER_MS).toISOString();
  const anonymizeCutoff = new Date(now - ANONYMIZE_AFTER_MS).toISOString();

  // 1) Anonimiza solicitudes inactivas > 90 días aún no anonimizadas.
  const toAnonymize = await db
    .select({ id: helpRequests.id })
    .from(helpRequests)
    .where(
      and(
        isNull(helpRequests.anonymizedAt),
        lt(helpRequests.updatedAt, anonymizeCutoff),
      ),
    );
  let anonymized = 0;
  for (const request of toAnonymize) {
    const result = await anonymizeHelpRequest(request.id, null);
    if (result.ok) anonymized += 1;
  }

  // 2) Cierra solicitudes inactivas > 30 días aún abiertas (y no anonimizadas).
  const toClose = await db
    .select({ id: helpRequests.id })
    .from(helpRequests)
    .where(
      and(
        isNull(helpRequests.anonymizedAt),
        ne(helpRequests.status, "closed"),
        lt(helpRequests.updatedAt, closeCutoff),
      ),
    );
  for (const request of toClose) {
    await releaseAssignmentsForRequest(request.id);
    await db
      .update(helpRequests)
      .set({ status: "closed", updatedAt: nowIso() })
      .where(eq(helpRequests.id, request.id));
  }

  return { anonymized, closed: toClose.length };
}
