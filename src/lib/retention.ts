import "server-only";

import { and, eq, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accessRequests,
  auditLogs,
  conversations,
  helpRequests,
  payments,
  professionals,
  waitlistEntries,
} from "@/db/schema";
import { releaseAssignmentsForRequest } from "@/lib/assignment";
import { finalizeConversationPurge } from "@/lib/conversation-purge";
import { newId, nowIso } from "@/lib/ids";
import { WAITLIST_ANONYMIZE_AFTER_MS } from "@/lib/waitlist";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSE_AFTER_MS = 90 * DAY_MS;
const ANONYMIZE_AFTER_MS = 180 * DAY_MS;
// La tabla del enlace mágico es desechable: solo sirve para limitar abuso.
const ACCESS_REQUESTS_TTL_MS = 7 * DAY_MS;
// Un chat sin actividad deja de ocupar cupo a los 30 días, pero NUNCA se borra
// ni se cierra: el link vive para siempre hasta que una de las dos partes lo
// borre desde su lado (ver src/app/c/[conversationId]/actions.ts).
const QUOTA_IDLE_MS = 30 * DAY_MS;
// Un pago que quedó "pending" más de 48h ya no puede completarse (Stripe expira
// las sesiones de Checkout a las 24h). Si el webhook no llegó, lo cerramos aquí
// para que no queden filas colgadas y la contabilidad refleje la realidad.
const PAYMENT_PENDING_TTL_MS = 48 * 60 * 60 * 1000;

function isoMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Anonimización de una solicitud: libera asignaciones y borra los datos de la
 * fila help_requests. Desde la política de chats eternos NO toca las
 * conversaciones: el hilo (y su link) solo desaparece cuando el profesional o
 * la persona lo borran explícitamente. La actividad del chat (lastMessageAt)
 * sigue contando como actividad para no anonimizar un caso vivo.
 */
export async function anonymizeHelpRequest(
  requestId: string,
  actorEmail: string | null,
) {
  const timestamp = nowIso();

  // Cierra y libera la capacidad de cualquier asignación activa, pero conserva
  // las conversaciones: son eternas y solo se borran con la acción explícita.
  await releaseAssignmentsForRequest(requestId, "case_closed", {
    closeConversations: false,
  });

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
 * Anonimización de una anotación de la lista de espera: borra los datos
 * personales (correo, título y descripción) y cierra la fila. El actor queda en
 * la auditoría (null = cron). Idempotente vía `anonymized_at`.
 */
export async function anonymizeWaitlistEntry(
  entryId: string,
  actorEmail: string | null,
) {
  const timestamp = nowIso();

  await db
    .update(waitlistEntries)
    .set({
      // Token aleatorio: sin enlace residual al correo original.
      email: `anon-${newId("waitlist")}@nido.local`,
      title: "Anotación anonimizada",
      description: "Contenido eliminado por la política de retención.",
      // También se rompe el vínculo con la conversación de origen.
      conversationId: null,
      requesterHash: null,
      status: "closed",
      anonymizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(waitlistEntries.id, entryId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail,
    action: "data_anonymization",
    entityType: "waitlist_entry",
    entityId: entryId,
    createdAt: timestamp,
  });

  return { ok: true as const };
}

/**
 * Retención automática de lo que NO es el chat: las solicitudes de ayuda se
 * cierran a los 90 días y se anonimizan a los 180 (con la actividad del chat
 * como reloj), y la tabla desechable del enlace mágico se purga a los 7 días.
 * Las conversaciones son ETERNAS: no se cierran ni se anonimizan aquí. Lo único
 * que se libera es su cupo tras 30 días sin actividad, para que el profesional
 * pueda acompañar a más personas sin perder ningún hilo.
 *
 * La dispara el cron de Cloudflare (ver custom-worker.ts `scheduled()` ->
 * /api/internal/retention). Idempotente.
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
  for (const request of toAnonymize) {
    const lastActivity = Math.max(
      isoMs(request.updatedAt),
      activityByRequest.get(request.id) ?? 0,
    );
    if (now - lastActivity < ANONYMIZE_AFTER_MS) continue;
    const result = await anonymizeHelpRequest(request.id, null);
    if (result.ok) anonymized += 1;
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
    const lastActivity = Math.max(
      isoMs(request.updatedAt),
      activityByRequest.get(request.id) ?? 0,
    );
    if (now - lastActivity < CLOSE_AFTER_MS) continue;
    // Cierra la asignación y libera cupo, pero NO el chat: el hilo sigue vivo.
    await releaseAssignmentsForRequest(request.id, "inactivity", {
      closeConversations: false,
    });
    // Sin bumpear updatedAt: el cierre no debe correr el reloj de inactividad
    // (si lo hiciera, la anonimización se retrasaría otros 180 días).
    await db
      .update(helpRequests)
      .set({ status: "closed" })
      .where(eq(helpRequests.id, request.id));
    closed += 1;
  }

  // 3) Libera cupo de los chats DIRECTOS sin actividad > 30 días (el hilo sigue
  // abierto y accesible: solo deja de ocupar plaza). La marca
  // `quota_released_at` hace el descuento idempotente: si el UPDATE guardado no
  // reclama la fila, nadie más descuenta ese cupo.
  const directActivity = sql`max(coalesce(${conversations.lastMessageAt}, 0), coalesce(${conversations.reopenedAt}, 0), cast(strftime('%s', ${conversations.createdAt}) as integer) * 1000)`;
  const stale = await db
    .select({
      id: conversations.id,
      professionalId: conversations.professionalId,
    })
    .from(conversations)
    .where(
      and(
        isNull(conversations.helpRequestId),
        eq(conversations.status, "open"),
        isNull(conversations.quotaReleasedAt),
        sql`${directActivity} < ${now - QUOTA_IDLE_MS}`,
      ),
    );

  const releasedPerProfessional = new Map<string, number>();
  const timestamp = nowIso();
  for (const conversation of stale) {
    const claimed = await db
      .update(conversations)
      .set({ quotaReleasedAt: new Date(now) })
      .where(
        and(
          eq(conversations.id, conversation.id),
          isNull(conversations.quotaReleasedAt),
        ),
      )
      .returning({ id: conversations.id });
    if (claimed.length === 0) continue;
    releasedPerProfessional.set(
      conversation.professionalId,
      (releasedPerProfessional.get(conversation.professionalId) ?? 0) + 1,
    );
    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: null,
      action: "conversation_quota_released",
      entityType: "conversation",
      entityId: conversation.id,
      createdAt: timestamp,
    });
  }
  for (const [professionalId, count] of releasedPerProfessional) {
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - ${count})`,
        updatedAt: timestamp,
      })
      .where(eq(professionals.id, professionalId));
  }

  // 4) Cierra los pagos que quedaron pendientes > 48h (la sesión de Stripe ya
  // expiró): evita filas colgadas si el webhook de expiración no llegó.
  const expiredPayments = await db
    .update(payments)
    .set({ status: "expired", updatedAt: timestamp })
    .where(
      and(
        eq(payments.status, "pending"),
        lt(
          payments.createdAt,
          new Date(now - PAYMENT_PENDING_TTL_MS).toISOString(),
        ),
      ),
    )
    .returning({ id: payments.id });

  // 5) Purga la tabla desechable del enlace mágico (>7 días).
  await db
    .delete(accessRequests)
    .where(
      lt(accessRequests.createdAt, new Date(now - ACCESS_REQUESTS_TTL_MS)),
    );

  // 6) Purga DEFINITIVA de la papelera vencida: el borrado con deshacer dura 7
  // días; al vencer, el contenido (cifrado de extremo a extremo) se borra del
  // DO y las filas del espejo D1. Si la purga del DO falla, la fila se queda y
  // se reintenta en la siguiente pasada (nunca se dejan transcripciones
  // huérfanas sin fila que las reintente).
  const expiredTrash = await db
    .select({
      id: conversations.id,
      professionalId: conversations.professionalId,
      helpRequestId: conversations.helpRequestId,
      quotaReleasedAt: conversations.quotaReleasedAt,
      deletedByRole: conversations.deletedByRole,
    })
    .from(conversations)
    .where(
      and(
        isNotNull(conversations.deletedAt),
        isNotNull(conversations.purgeAfter),
        lte(conversations.purgeAfter, new Date(now)),
      ),
    );
  let purgedTrash = 0;
  let purgeFailed = 0;
  for (const conversation of expiredTrash) {
    const result = await finalizeConversationPurge(conversation, null);
    if (result === "purged") purgedTrash += 1;
    else if (result === "do_failed") purgeFailed += 1;
  }

  // 7) Anonimiza las anotaciones de la lista de espera sin actividad > 12 meses
  // (apoyo por motivos ajenos al terremoto): se borran correo, título y
  // descripción y la fila queda cerrada. Antes de anonimizar comprobamos que la
  // fila sigue vencida para evitar carreras con una anotación recién actualizada.
  const waitlistCutoff = new Date(
    now - WAITLIST_ANONYMIZE_AFTER_MS,
  ).toISOString();
  const staleWaitlist = await db
    .select({ id: waitlistEntries.id, updatedAt: waitlistEntries.updatedAt })
    .from(waitlistEntries)
    .where(
      and(
        isNull(waitlistEntries.anonymizedAt),
        lt(waitlistEntries.updatedAt, waitlistCutoff),
      ),
    );
  let waitlistAnonymized = 0;
  for (const entry of staleWaitlist) {
    if (isoMs(entry.updatedAt) >= now - WAITLIST_ANONYMIZE_AFTER_MS) continue;
    await anonymizeWaitlistEntry(entry.id, null);
    waitlistAnonymized += 1;
  }

  return {
    anonymized,
    closed,
    quotaReleased: [...releasedPerProfessional.values()].reduce(
      (sum, n) => sum + n,
      0,
    ),
    paymentsExpired: expiredPayments.length,
    purgedTrash,
    purgeFailed,
    waitlistAnonymized,
  };
}
