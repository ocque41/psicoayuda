import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  patientConversationLinks,
  patientSessionRequests,
  practicePatients,
  professionals,
  responseSamples,
  seekerSessions,
} from "@/db/schema";
import { purgeConversationMessagesDetailed } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";

/** Días de papelera con deshacer antes del borrado definitivo. */
export const TRASH_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type PurgeableConversation = {
  id: string;
  professionalId: string;
  helpRequestId: string | null;
  quotaReleasedAt: Date | null;
  deletedByRole: string | null;
};

export type FinalizePurgeResult = "purged" | "do_failed" | "gone";

/**
 * Cierre REAL de una conversación (fin de la papelera o borrado de cuenta):
 * purga el SQLite del Durable Object, resuelve el cupo/caso y borra las filas
 * del espejo en D1. El contenido se borra primero: si el DO falla, NO se borran
 * las filas (quedarían transcripciones huérfanas sin forma de reintentar).
 *
 * - `purged`: quedó todo borrado.
 * - `do_failed`: la purga del DO falló; la fila sigue viva para reintentar.
 * - `gone`: ya no existía (idempotente).
 *
 * En local (sin binding del DO) la purga es "unavailable": se procede, porque
 * nunca hubo contenido real que borrar.
 */
export async function finalizeConversationPurge(
  conversation: PurgeableConversation,
  actorEmail: string | null,
): Promise<FinalizePurgeResult> {
  const purge = await purgeConversationMessagesDetailed(conversation.id);
  if (purge === "failed") return "do_failed";

  const role =
    conversation.deletedByRole === "professional" ||
    conversation.deletedByRole === "seeker"
      ? conversation.deletedByRole
      : null;

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
  }

  // Hijos primero, en la misma transacción que el padre: el proxy local puede
  // ejecutar con foreign_keys=OFF y un fallo no debe dejar limpieza parcial.
  const [, , , , , , , deleted] = await db.batch([
    // CAS contra el estado actual. changes() solo puede liberar el cupo cuando
    // esta transacción lo reclama; reintentos y llamadas simultáneas no restan.
    db
      .update(conversations)
      .set({ quotaReleasedAt: new Date(timestamp), updatedAt: timestamp })
      .where(
        and(
          eq(conversations.id, conversation.id),
          eq(conversations.professionalId, conversation.professionalId),
          isNull(conversations.helpRequestId),
          isNull(conversations.quotaReleasedAt),
          conversation.helpRequestId === null ? undefined : sql`0 = 1`,
        ),
      ),
    db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(professionals.id, conversation.professionalId),
          sql`changes() = 1`,
        ),
      ),
    db
      .delete(patientSessionRequests)
      .where(eq(patientSessionRequests.conversationId, conversation.id)),
    db
      .delete(patientConversationLinks)
      .where(eq(patientConversationLinks.conversationId, conversation.id)),
    db
      .delete(seekerSessions)
      .where(eq(seekerSessions.conversationId, conversation.id)),
    db
      .delete(responseSamples)
      .where(eq(responseSamples.conversationId, conversation.id)),
    db
      .update(practicePatients)
      .set({ conversationId: null })
      .where(eq(practicePatients.conversationId, conversation.id)),
    db
      .delete(conversations)
      .where(eq(conversations.id, conversation.id))
      .returning({ id: conversations.id }),
  ]);
  if (deleted.length === 0) return "gone";

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail,
    action: "conversation_purged",
    entityType: "conversation",
    entityId: conversation.id,
    metadata: JSON.stringify({ role, requeued }),
    createdAt: timestamp,
  });

  return "purged";
}
