import "server-only";

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
} from "@/db/schema";
import { disconnectConversationSockets } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";

// Estados de asignación que consumen cupo del profesional. "accepted" lo crea el
// flujo de ofertas (offers.ts); "assigned" lo crea la asignación del admin. Las
// rutinas de liberación DEBEN contemplar ambos o el cupo se queda pegado.
const ACTIVE_ASSIGNMENT_STATES = ["assigned", "accepted"] as const;

// IMPORTANTE (Cloudflare D1): D1 NO soporta `BEGIN/COMMIT` por sentencia
// preparada (responde "please use the storage.transaction() API instead"), así
// que `db.transaction()` del sqlite-proxy LANZA en producción. Estos flujos se
// escriben como sentencias secuenciales: la reserva de cupo es un UPDATE…WHERE
// guardado (atómico por sentencia, evita sobre-reservar) y se compensa a mano si
// un paso posterior falla.

/**
 * Cierra las conversaciones ABIERTAS indicadas y revoca la sesión del seeker
 * (kill-switch real: corta también el acceso por WebSocket, que solo mira el
 * token HMAC). Devuelve cuántas conversaciones cerró.
 */
async function closeConversations(
  rows: Array<{ id: string }>,
  timestamp: string,
  revokedAt: Date,
) {
  for (const conversation of rows) {
    await db
      .update(conversations)
      .set({ status: "closed", closedAt: timestamp, updatedAt: timestamp })
      .where(eq(conversations.id, conversation.id));
    await db
      .update(seekerSessions)
      .set({ revokedAt })
      .where(eq(seekerSessions.conversationId, conversation.id));
    // Corta el WebSocket vivo en el Durable Object. El kill-switch de D1 solo se
    // evalúa al CONECTAR y, con hibernación, un socket ya abierto sobrevivía a
    // cerrar/suspender (seguía pudiendo chatear). Best-effort (no rompe el cierre
    // en local/sin binding del DO).
    await disconnectConversationSockets(conversation.id);
  }
  return rows.length;
}

export async function assignRequestToProfessional(input: {
  helpRequestId: string;
  professionalId: string;
  actorEmail: string;
}) {
  const existing = await db.query.assignments.findFirst({
    where: and(
      eq(assignments.helpRequestId, input.helpRequestId),
      eq(assignments.professionalId, input.professionalId),
    ),
  });
  if (existing) {
    return { ok: false as const, reason: "duplicate" as const };
  }

  // Reserva de cupo: única sentencia atómica. Solo incrementa si el profesional
  // sigue elegible y por debajo del máximo.
  const updated = await db
    .update(professionals)
    .set({
      currentActiveRequests: sql`${professionals.currentActiveRequests} + 1`,
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(professionals.id, input.professionalId),
        eq(professionals.status, "approved"),
        eq(professionals.acceptingRequests, true),
        eq(professionals.remoteAvailable, true),
        gt(
          professionals.maxActiveRequests,
          sql`${professionals.currentActiveRequests}`,
        ),
      ),
    )
    .returning({ id: professionals.id });

  if (updated.length === 0) {
    return { ok: false as const, reason: "capacity_or_status" as const };
  }

  const timestamp = nowIso();
  // El índice único (helpRequestId, professionalId) es la red de seguridad ante
  // carreras: si ya existía, no insertamos y compensamos el cupo reservado.
  const inserted = await db
    .insert(assignments)
    .values({
      id: newId("asg"),
      helpRequestId: input.helpRequestId,
      professionalId: input.professionalId,
      status: "assigned",
      source: "admin",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()
    .returning({ id: assignments.id });

  if (inserted.length === 0) {
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, input.professionalId));
    return { ok: false as const, reason: "duplicate" as const };
  }

  // BUG-B: reclama la solicitud de forma atómica. Solo "gana" si sigue
  // reclamable (new/offered). Si otro flujo (una oferta ya aceptada) la tomó,
  // deshacemos la asignación y el cupo: nunca dos profesionales en una solicitud.
  const claimedRequest = await db
    .update(helpRequests)
    .set({ status: "assigned", updatedAt: timestamp })
    .where(
      and(
        eq(helpRequests.id, input.helpRequestId),
        inArray(helpRequests.status, ["new", "offered"]),
      ),
    )
    .returning({ id: helpRequests.id });

  if (claimedRequest.length === 0) {
    await db
      .update(assignments)
      .set({ status: "closed", updatedAt: nowIso() })
      .where(eq(assignments.id, inserted[0].id));
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, input.professionalId));
    return { ok: false as const, reason: "already_assigned" as const };
  }

  // Con la solicitud ya asignada, cierra cualquier oferta hermana pendiente para
  // que nadie más pueda aceptarla (cierra el doble binding admin vs oferta).
  await db
    .update(assignments)
    .set({ status: "closed", updatedAt: timestamp })
    .where(
      and(
        eq(assignments.helpRequestId, input.helpRequestId),
        eq(assignments.status, "offered"),
      ),
    );

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: input.actorEmail,
    action: "request_assignment",
    entityType: "help_request",
    entityId: input.helpRequestId,
    metadata: JSON.stringify({ professionalId: input.professionalId }),
    createdAt: timestamp,
  });

  return { ok: true as const };
}

/**
 * Cierra las asignaciones activas de una solicitud y libera capacidad del
 * profesional (currentActiveRequests, con piso en 0). Idempotente. Contempla los
 * estados "assigned" Y "accepted". Cierra además la conversación abierta y revoca
 * la sesión del seeker. Se invoca al cerrar/anonimizar.
 */
export async function releaseAssignmentsForRequest(helpRequestId: string) {
  const active = await db.query.assignments.findMany({
    where: and(
      eq(assignments.helpRequestId, helpRequestId),
      inArray(assignments.status, [...ACTIVE_ASSIGNMENT_STATES]),
    ),
  });

  const timestamp = nowIso();
  for (const assignment of active) {
    // Cierra la asignación SOLO si sigue activa, y libera cupo SOLO si este
    // llamador la cerró de verdad: evita el doble decremento de cupo cuando dos
    // liberaciones concurrentes (p.ej. cerrar + anonimizar) pisan la misma fila.
    const closed = await db
      .update(assignments)
      .set({ status: "closed", updatedAt: timestamp })
      .where(
        and(
          eq(assignments.id, assignment.id),
          inArray(assignments.status, [...ACTIVE_ASSIGNMENT_STATES]),
        ),
      )
      .returning({ id: assignments.id });
    if (closed.length > 0) {
      await db
        .update(professionals)
        .set({
          currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
          updatedAt: timestamp,
        })
        .where(eq(professionals.id, assignment.professionalId));
    }
  }

  const openConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.helpRequestId, helpRequestId),
        eq(conversations.status, "open"),
      ),
    );
  await closeConversations(openConversations, timestamp, new Date());

  return active.length;
}

/**
 * Al suspender/rechazar a un profesional: cierra sus asignaciones activas
 * ("assigned" y "accepted"), devuelve esas solicitudes a "new" para reasignar,
 * cierra sus conversaciones abiertas (revocando al seeker) y pone su capacidad a
 * 0. Evita que personas queden silenciosamente huérfanas.
 */
export async function releaseProfessionalAssignments(professionalId: string) {
  const active = await db.query.assignments.findMany({
    where: and(
      eq(assignments.professionalId, professionalId),
      inArray(assignments.status, [...ACTIVE_ASSIGNMENT_STATES]),
    ),
  });

  const timestamp = nowIso();
  for (const assignment of active) {
    await db
      .update(assignments)
      .set({ status: "closed", updatedAt: timestamp })
      .where(eq(assignments.id, assignment.id));
    await db
      .update(helpRequests)
      .set({ status: "new", updatedAt: timestamp })
      .where(
        and(
          eq(helpRequests.id, assignment.helpRequestId),
          eq(helpRequests.status, "assigned"),
        ),
      );
  }

  const openConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.professionalId, professionalId),
        eq(conversations.status, "open"),
      ),
    );
  await closeConversations(openConversations, timestamp, new Date());

  await db
    .update(professionals)
    .set({ currentActiveRequests: 0, updatedAt: timestamp })
    .where(eq(professionals.id, professionalId));

  return active.length;
}
