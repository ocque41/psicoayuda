import "server-only";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
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
// un paso posterior falla. La liberación de solicitudes usa db.batch() para
// confirmar el cierre de cada relación y su descuento de cupo juntos.

/**
 * Cierre interno de filas seleccionadas por un caller autorizado. Confirma el
 * estado y la pertenencia leídos aquí; un ID solo no conserva la versión de la
 * selección previa del caller. Cierre y revocación son atómicos por sala.
 * Devuelve las transiciones ganadas; no reescribe cierres ya confirmados.
 */
export async function closeConversations(
  rows: Array<{ id: string }>,
  timestamp: string,
  revokedAt: Date,
  reason = "case_closed",
) {
  let count = 0;
  for (const row of rows) {
    const current = await db.query.conversations.findFirst({
      where: eq(conversations.id, row.id),
    });
    if (current?.status !== "open") continue;

    // El caller puede haber creado timestamp antes de la última actividad.
    // La versión del cierre avanza siempre respecto a la que se reclama.
    const closedAt = new Date(
      Math.max(Date.parse(timestamp), Date.parse(current.updatedAt) + 1),
    ).toISOString();
    const close = db
      .update(conversations)
      .set({
        status: "closed",
        closedAt,
        closedReason: reason,
        updatedAt: closedAt,
      })
      .where(
        and(
          eq(conversations.id, current.id),
          eq(conversations.status, "open"),
          eq(conversations.updatedAt, current.updatedAt),
          eq(conversations.professionalId, current.professionalId),
          eq(conversations.seekerSid, current.seekerSid),
          current.helpRequestId === null
            ? isNull(conversations.helpRequestId)
            : eq(conversations.helpRequestId, current.helpRequestId),
          current.deletedAt === null
            ? isNull(conversations.deletedAt)
            : eq(conversations.deletedAt, current.deletedAt),
          current.anonymizedAt === null
            ? isNull(conversations.anonymizedAt)
            : eq(conversations.anonymizedAt, current.anonymizedAt),
        ),
      )
      .returning({ id: conversations.id });
    // La inactividad permite leer/reabrir con el permiso existente. Los cierres
    // de caso/cuenta revocan todos los grants de la sala, incluido su enlace.
    const [closed] =
      reason === "inactivity"
        ? await db.batch([close])
        : await db.batch([
            close,
            db
              .update(seekerSessions)
              .set({ revokedAt })
              .where(
                and(
                  eq(seekerSessions.conversationId, current.id),
                  isNull(seekerSessions.revokedAt),
                  sql`changes()=1`,
                ),
              ),
          ]);
    if (!closed.length) {
      const latest = await db.query.conversations.findFirst({
        where: eq(conversations.id, current.id),
      });
      // Otro cierre o borrado ya resolvió la sala. Si sigue abierta con otra
      // versión/parte, no dar el cierre por terminado ni revocar sus permisos.
      if (latest?.status === "open")
        throw new Error(
          "El chat cambió mientras se cerraba. Vuelve a intentarlo.",
        );
      continue;
    }
    count += closed.length;
    // El corte del DO es posterior al commit y best-effort; no borra mensajes.
    // Los gates de D1 también comprueban permiso/estado en cada frame.
    await disconnectConversationSockets(current.id);
  }
  return count;
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

  // Con la solicitud ya asignada, marca "missed" cualquier oferta hermana
  // pendiente: nadie más puede aceptarla (cierra el doble binding admin vs
  // oferta) y esos profesionales la ven en su panel como "ya la tomó otro".
  await db
    .update(assignments)
    .set({ status: "missed", updatedAt: timestamp })
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
 * estados "assigned" Y "accepted". Por defecto cierra además la conversación
 * abierta y revoca la sesión del seeker; con `closeConversations: false` (lo usa
 * la retención/anonimización) el hilo queda intacto: los chats son eternos y
 * solo se borran con la acción explícita de una de las partes.
 */
export async function releaseAssignmentsForRequest(
  helpRequestId: string,
  reason = "case_closed",
  options: { closeConversations?: boolean } = {},
) {
  const active = await db.query.assignments.findMany({
    where: and(
      eq(assignments.helpRequestId, helpRequestId),
      inArray(assignments.status, [...ACTIVE_ASSIGNMENT_STATES]),
    ),
  });

  const timestamp = nowIso();
  let released = 0;
  for (const assignment of active) {
    // Cierre y descuento van juntos: si falla el contador, la relación sigue
    // activa y un reintento puede reclamarla, incluso con la solicitud cerrada.
    // changes() se evalúa dentro del batch; sólo el ganador del CAS descuenta.
    const [closed] = await db.batch([
      db
        .update(assignments)
        .set({ status: "closed", updatedAt: timestamp })
        .where(
          and(
            eq(assignments.id, assignment.id),
            eq(assignments.helpRequestId, helpRequestId),
            eq(assignments.professionalId, assignment.professionalId),
            inArray(assignments.status, [...ACTIVE_ASSIGNMENT_STATES]),
          ),
        )
        .returning({ id: assignments.id }),
      db
        .update(professionals)
        .set({
          currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(professionals.id, assignment.professionalId),
            sql`changes()=1`,
          ),
        ),
    ]);
    released += closed.length;
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
  if (options.closeConversations !== false) {
    await closeConversations(openConversations, timestamp, new Date(), reason);
  }

  return released;
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
