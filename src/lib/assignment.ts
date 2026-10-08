import "server-only";

import { and, eq, gt, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  practiceCredentials,
  professionals,
  seekerSessions,
  session,
  user,
} from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { currentWaitlistAdmin } from "@/lib/admin-waitlist/access";
import type { WaitlistAdmin } from "@/lib/admin-waitlist/types";
import { disconnectConversationSockets } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";

// Estados de asignación que consumen cupo del profesional. "accepted" lo crea el
// flujo de ofertas (offers.ts); "assigned" lo crea la asignación del admin. Las
// rutinas de liberación DEBEN contemplar ambos o el cupo se queda pegado.
const ACTIVE_ASSIGNMENT_STATES = ["assigned", "accepted"] as const;

export type RoomSnapshot = typeof conversations.$inferSelect & {
  reopeningId: string | null;
};
// La reapertura real confirma esta auditoría en el mismo batch. Su ID distingue
// generaciones aun si el reloj reutiliza updatedAt Y reopenedAt. Se lee en la
// misma sentencia que la sala, nunca después sobre una versión nueva.
function reopeningVersion() {
  // La referencia cualificada evita que extras de Drizzle elimine la tabla y
  // resuelva accidentalmente «id» contra audit_logs dentro de la subconsulta.
  return sql<
    string | null
  >`(SELECT id FROM audit_logs WHERE action='conversation_reopened'
    AND entity_type='conversation' AND entity_id="conversations"."id" ORDER BY rowid DESC LIMIT 1)`;
}

function roomVersion(room: RoomSnapshot) {
  return and(
    eq(conversations.id, room.id),
    eq(conversations.status, "open"),
    eq(conversations.updatedAt, room.updatedAt),
    sql`${reopeningVersion()} IS ${room.reopeningId}`,
    eq(conversations.professionalId, room.professionalId),
    eq(conversations.seekerSid, room.seekerSid),
    room.helpRequestId === null
      ? isNull(conversations.helpRequestId)
      : eq(conversations.helpRequestId, room.helpRequestId),
    room.deletedAt === null
      ? isNull(conversations.deletedAt)
      : eq(conversations.deletedAt, room.deletedAt),
    room.anonymizedAt === null
      ? isNull(conversations.anonymizedAt)
      : eq(conversations.anonymizedAt, room.anonymizedAt),
    room.reopenedAt === null
      ? isNull(conversations.reopenedAt)
      : eq(conversations.reopenedAt, room.reopenedAt),
  );
}

// Una lista parametrizada evita superar los 100 bindings por sentencia de D1
// cuando un profesional conserva muchas salas. Sólo versiones/IDs/estados;
// nunca se persiste este snapshot ni contiene mensajes o claves.
function snapshotMatches(
  table: SQLiteTable,
  columns: (SQLiteColumn | SQL)[],
  rows: (string | number | boolean | Date | null)[][],
) {
  const snapshot = JSON.stringify(
    rows.map((row) =>
      row.map((value) => (value instanceof Date ? value.getTime() : value)),
    ),
  );
  const fields = columns.map(
    (column, index) =>
      sql`${column} IS json_extract(snapshot.value, ${sql.raw(`'$[${index}]'`)})`,
  );
  return sql`NOT EXISTS (SELECT 1 FROM json_each(${snapshot}) snapshot WHERE NOT EXISTS
    (SELECT 1 FROM ${table} WHERE ${sql.join(fields, sql` AND `)}))`;
}

/**
 * La decisión administrativa y su revocación son un único intento. La auditoría
 * reclama TODAS las versiones y la sesión vigente antes de escribir; su ID
 * nuevo guarda cada sentencia del mismo batch D1/libSQL. Un conflicto no
 * confirma ninguna escritura propia. No se relee/reautoriza automáticamente.
 * Retención conserva su contrato independiente; cuenta exige intención de baja.
 */
export type ProfessionalClosureSnapshot = Pick<
  typeof professionals.$inferSelect,
  "id" | "status" | "userId" | "updatedAt" | "currentActiveRequests"
>;
type ClinicalClosureSnapshot = ProfessionalClosureSnapshot &
  Pick<
    typeof professionals.$inferSelect,
    "nonClinicalHelper" | "credentialConfirmed"
  >;

// Mismo scope que requirePracticeStaff("credentials"): admin O lista de
// revisores, nunca soporte/Admisión por inferencia. La identidad y SID vivos
// se repiten dentro de SQL; no se cambia la política compartida de otros flujos.
function currentCredentialReviewer(actor: WaitlistAdmin) {
  const allowed = (process.env.CREDENTIAL_REVIEWER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    !actor.sessionId ||
    !(isAdminEmail(actor.email) || allowed.includes(actor.email))
  )
    return sql`0`;
  return sql`EXISTS (SELECT 1 FROM user account JOIN session live_session ON live_session.user_id=account.id
    WHERE account.id=${actor.userId} AND lower(account.email)=${actor.email}
      AND account.email_verified=1 AND live_session.id=${actor.sessionId}
      AND live_session.expires_at > cast(unixepoch('subsecond') * 1000 as integer))`;
}

// La baja propia no exige verificación ni scope de staff. La baja administrativa
// conserva requireAdmin y la protección de cuentas admin, repetidos con el SID
// real y el correo actual dentro de SQL antes de cada fase local.
export type AccountDeletionActor = {
  kind: "self" | "admin";
  userId: string;
  email: string;
  sessionId: string;
};
export type AccountDeletionIntent = {
  actor: AccountDeletionActor;
  targetUserId: string;
  targetEmail: string;
  auditId: string;
};
export function accountDeletionAuthority(
  actor: AccountDeletionActor,
  targetUserId: string,
  targetEmail: string,
) {
  if (
    !actor.sessionId ||
    !actor.userId ||
    !actor.email ||
    (actor.kind !== "self" && actor.kind !== "admin")
  )
    return sql`0`;
  if (actor.kind === "self" && actor.userId !== targetUserId) return sql`0`;
  if (
    actor.kind === "admin" &&
    (!isAdminEmail(actor.email) || isAdminEmail(targetEmail))
  )
    return sql`0`;
  return and(
    sql`EXISTS (SELECT 1 FROM ${user} JOIN ${session} ON ${session.userId}=${user.id}
      WHERE ${user.id}=${actor.userId} AND lower(${user.email})=${actor.email}
        AND ${session.id}=${actor.sessionId}
        AND ${session.expiresAt} > cast(unixepoch('subsecond') * 1000 as integer)
        AND ${actor.kind === "admin" ? sql`${user.emailVerified}=1` : sql`1`})`,
    sql`EXISTS (SELECT 1 FROM ${user} WHERE ${user.id}=${targetUserId} AND lower(${user.email})=${targetEmail})`,
  );
}
export function accountDeletionIntentGuard(intent: AccountDeletionIntent) {
  return and(
    accountDeletionAuthority(
      intent.actor,
      intent.targetUserId,
      intent.targetEmail,
    ),
    sql`EXISTS (SELECT 1 FROM ${auditLogs} WHERE ${auditLogs.id}=${intent.auditId}
      AND ${auditLogs.action}='account_deletion_started' AND ${auditLogs.entityType}='user'
      AND ${auditLogs.entityId}=${intent.targetUserId} AND ${auditLogs.actorEmail}=${intent.actor.email})`,
  );
}
export async function accountRoomsSnapshot(professionalId: string) {
  return db.query.conversations.findMany({
    where: eq(conversations.professionalId, professionalId),
    extras: { reopeningId: reopeningVersion().as("reopening_id") },
  });
}
export function accountRoomsMatch(
  professionalId: string,
  rooms: RoomSnapshot[],
) {
  return and(
    sql`(SELECT count(*) FROM ${conversations} WHERE ${conversations.professionalId}=${professionalId})=${rooms.length}`,
    snapshotMatches(
      conversations,
      [
        conversations.id,
        conversations.status,
        conversations.updatedAt,
        conversations.professionalId,
        conversations.seekerSid,
        conversations.helpRequestId,
        conversations.deletedAt,
        conversations.anonymizedAt,
        conversations.reopenedAt,
        reopeningVersion(),
      ],
      rooms.map((room) => [
        room.id,
        room.status,
        room.updatedAt,
        room.professionalId,
        room.seekerSid,
        room.helpRequestId,
        room.deletedAt,
        room.anonymizedAt,
        room.reopenedAt,
        room.reopeningId,
      ]),
    ),
  );
}

// Wrapper de intención propia/admin: permite deleting sólo para la cuenta
// reclamada. No usa ni amplía los permisos de decisiones administrativas.
export async function closeAccountAssignments(input: {
  id: string;
  expected: ProfessionalClosureSnapshot;
  intent: AccountDeletionIntent;
}) {
  if (
    input.expected.status !== "deleting" ||
    input.expected.userId !== input.intent.targetUserId
  ) {
    throw new Error("La cuenta cambió. Vuelve a intentar la eliminación.");
  }
  return closeAssignments({
    ...input,
    kind: "account",
    actor: input.intent.actor,
  });
}

type AdministrativeClosureInput = { actor: WaitlistAdmin } & (
  | { kind: "request"; id: string }
  | {
      kind: "professional";
      id: string;
      status: "suspended" | "rejected";
      expected: ProfessionalClosureSnapshot;
    }
  | {
      kind: "credential_review";
      id: string;
      status: "suspended" | "rejected" | "pending_verification";
      reference: string;
      expected: ClinicalClosureSnapshot;
    }
  | {
      kind: "professional_kind";
      id: string;
      expected: ClinicalClosureSnapshot;
    }
);
export async function closeAdministrativeAssignments(
  input: AdministrativeClosureInput,
) {
  return closeAssignments(input);
}
async function closeAssignments(
  input:
    | AdministrativeClosureInput
    | {
        kind: "account";
        id: string;
        actor: AccountDeletionActor;
        expected: ProfessionalClosureSnapshot;
        intent: AccountDeletionIntent;
      },
) {
  const scope =
    input.kind === "request"
      ? eq(assignments.helpRequestId, input.id)
      : eq(assignments.professionalId, input.id);
  const active = await db.query.assignments.findMany({
    where: and(
      scope,
      inArray(assignments.status, [...ACTIVE_ASSIGNMENT_STATES]),
    ),
  });
  const requestIds = [
    ...new Set([
      ...(input.kind === "request" ? [input.id] : []),
      ...active.map((row) => row.helpRequestId),
    ]),
  ];
  const proIds = [
    ...new Set([
      ...(input.kind !== "request" ? [input.id] : []),
      ...active.map((row) => row.professionalId),
    ]),
  ];
  const requests = requestIds.length
    ? await db.query.helpRequests.findMany({
        where: inArray(helpRequests.id, requestIds),
      })
    : [];
  const pros = proIds.length
    ? await db.query.professionals.findMany({
        where: inArray(professionals.id, proIds),
      })
    : [];
  if (
    requests.length !== requestIds.length ||
    pros.length !== proIds.length ||
    pros.some((row) => row.status === "deleting" && input.kind !== "account") ||
    (input.kind !== "request" &&
      !pros.some(
        (row) =>
          row.id === input.expected.id &&
          row.status === input.expected.status &&
          row.userId === input.expected.userId &&
          row.updatedAt === input.expected.updatedAt &&
          row.currentActiveRequests === input.expected.currentActiveRequests &&
          ((input.kind !== "credential_review" &&
            input.kind !== "professional_kind") ||
            (row.nonClinicalHelper === input.expected.nonClinicalHelper &&
              row.credentialConfirmed === input.expected.credentialConfirmed &&
              row.nonClinicalHelper === (input.kind === "professional_kind"))),
      ))
  ) {
    throw new Error("El caso o la cuenta cambió. Vuelve a intentarlo.");
  }
  const scopes =
    input.kind === "professional_kind"
      ? await db.query.practiceCredentials.findMany({
          where: eq(practiceCredentials.professionalId, input.id),
        })
      : [];
  const roomScope =
    input.kind === "request"
      ? eq(conversations.helpRequestId, input.id)
      : eq(conversations.professionalId, input.id);
  const rooms = await db.query.conversations.findMany({
    where: and(roomScope, eq(conversations.status, "open")),
    extras: { reopeningId: reopeningVersion().as("reopening_id") },
  });
  const guards = [
    input.kind === "account"
      ? accountDeletionIntentGuard(input.intent)
      : input.kind === "credential_review"
        ? currentCredentialReviewer(input.actor)
        : currentWaitlistAdmin(input.actor),
    sql`(SELECT count(*) FROM ${assignments} WHERE ${scope} AND ${assignments.status} IN ('assigned','accepted'))=${active.length}`,
    sql`(SELECT count(*) FROM ${conversations} WHERE ${roomScope} AND ${conversations.status}='open')=${rooms.length}`,
    snapshotMatches(
      assignments,
      [
        assignments.id,
        assignments.helpRequestId,
        assignments.professionalId,
        assignments.status,
        assignments.updatedAt,
      ],
      active.map((row) => [
        row.id,
        row.helpRequestId,
        row.professionalId,
        row.status,
        row.updatedAt,
      ]),
    ),
    snapshotMatches(
      helpRequests,
      [
        helpRequests.id,
        helpRequests.status,
        helpRequests.updatedAt,
        helpRequests.anonymizedAt,
      ],
      requests.map((row) => [
        row.id,
        row.status,
        row.updatedAt,
        row.anonymizedAt,
      ]),
    ),
    snapshotMatches(
      professionals,
      [
        professionals.id,
        professionals.userId,
        professionals.status,
        professionals.updatedAt,
        professionals.currentActiveRequests,
        professionals.nonClinicalHelper,
        professionals.credentialConfirmed,
      ],
      pros.map((row) => [
        row.id,
        row.userId,
        row.status,
        row.updatedAt,
        row.currentActiveRequests,
        row.nonClinicalHelper,
        row.credentialConfirmed,
      ]),
    ),
    snapshotMatches(
      conversations,
      [
        conversations.id,
        conversations.status,
        conversations.updatedAt,
        conversations.professionalId,
        conversations.seekerSid,
        conversations.helpRequestId,
        conversations.deletedAt,
        conversations.anonymizedAt,
        conversations.reopenedAt,
        reopeningVersion(),
      ],
      rooms.map((room) => [
        room.id,
        room.status,
        room.updatedAt,
        room.professionalId,
        room.seekerSid,
        room.helpRequestId,
        room.deletedAt,
        room.anonymizedAt,
        room.reopenedAt,
        room.reopeningId,
      ]),
    ),
  ];
  if (input.kind === "professional_kind") {
    guards.push(
      sql`(SELECT count(*) FROM ${practiceCredentials} WHERE ${practiceCredentials.professionalId}=${input.id})=${scopes.length}`,
      snapshotMatches(
        practiceCredentials,
        [
          practiceCredentials.id,
          practiceCredentials.professionalId,
          practiceCredentials.patientCountry,
          practiceCredentials.registryReference,
          practiceCredentials.reviewedBy,
          practiceCredentials.reviewedAt,
          practiceCredentials.expiresAt,
        ],
        scopes.map((row) => [
          row.id,
          row.professionalId,
          row.patientCountry,
          row.registryReference,
          row.reviewedBy,
          row.reviewedAt,
          row.expiresAt,
        ]),
      ),
    );
  }
  const timestamp = nowIso();
  const auditId = newId("log");
  const action =
    input.kind === "request"
      ? "request_closure"
      : input.kind === "credential_review"
        ? "practice_credential_decision"
        : input.kind === "professional_kind"
          ? "professional_kind_certified"
          : input.kind === "account"
            ? "account_assignments_closed"
            : input.status === "suspended"
              ? "professional_suspension"
              : "professional_rejection";
  const metadata =
    input.kind === "credential_review"
      ? JSON.stringify({ status: input.status, reference: input.reference })
      : null;
  const admitted = sql`EXISTS (SELECT 1 FROM ${auditLogs} WHERE ${auditLogs.id}=${auditId})`;
  const claim = db
    .insert(auditLogs)
    .select(
      sql`SELECT ${auditId},${input.actor.email},${action},${input.kind === "request" ? "help_request" : "professional"},${input.id},${metadata},${timestamp} WHERE ${and(...guards)}`,
    )
    .returning({ id: auditLogs.id });
  const writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [claim];
  for (const room of rooms) {
    const closedAt = new Date(
      Math.max(Date.parse(timestamp), Date.parse(room.updatedAt) + 1),
    ).toISOString();
    writes.push(
      db
        .update(conversations)
        .set({
          status: "closed",
          closedAt,
          closedReason: "case_closed",
          updatedAt: closedAt,
        })
        .where(and(admitted, roomVersion(room)))
        .returning({ id: conversations.id }),
      db
        .update(seekerSessions)
        .set({ revokedAt: new Date(closedAt) })
        .where(
          and(
            admitted,
            eq(seekerSessions.conversationId, room.id),
            isNull(seekerSessions.revokedAt),
            sql`changes()=1`,
          ),
        ),
    );
  }
  for (const row of active) {
    writes.push(
      db
        .update(assignments)
        .set({ status: "closed", updatedAt: timestamp })
        .where(
          and(
            admitted,
            eq(assignments.id, row.id),
            eq(assignments.status, row.status),
            eq(assignments.updatedAt, row.updatedAt),
            eq(assignments.helpRequestId, row.helpRequestId),
            eq(assignments.professionalId, row.professionalId),
          ),
        )
        .returning({ id: assignments.id }),
    );
    if (input.kind === "request") {
      writes.push(
        db
          .update(professionals)
          .set({
            currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
            updatedAt: timestamp,
          })
          .where(
            and(
              admitted,
              eq(professionals.id, row.professionalId),
              sql`changes()=1`,
            ),
          ),
      );
    }
  }
  if (input.kind === "request") {
    writes.push(
      db
        .update(helpRequests)
        .set({ status: "closed", updatedAt: timestamp })
        .where(and(admitted, eq(helpRequests.id, input.id))),
    );
  } else {
    for (const request of requests) {
      if (request.status === "assigned")
        writes.push(
          db
            .update(helpRequests)
            .set({ status: "new", updatedAt: timestamp })
            .where(
              and(
                admitted,
                eq(helpRequests.id, request.id),
                eq(helpRequests.status, "assigned"),
              ),
            ),
        );
    }
    const updates =
      input.kind === "account"
        ? {
            status: "deleting",
            acceptingRequests: false,
            currentActiveRequests: 0,
            updatedAt: input.expected.updatedAt,
          }
        : input.kind === "credential_review"
          ? {
              status: input.status,
              credentialConfirmed: false,
              currentActiveRequests: 0,
              updatedAt: timestamp,
            }
          : input.kind === "professional_kind"
            ? {
                status: "pending_verification",
                nonClinicalHelper: false,
                credentialConfirmed: false,
                acceptingRequests: false,
                currentActiveRequests: 0,
                updatedAt: timestamp,
              }
            : {
                status: input.status,
                acceptingRequests: false,
                currentActiveRequests: 0,
                updatedAt: timestamp,
              };
    writes.push(
      db
        .update(professionals)
        .set(updates)
        .where(and(admitted, eq(professionals.id, input.id))),
    );
    if (input.kind === "professional_kind")
      writes.push(
        db
          .update(practiceCredentials)
          .set({ expiresAt: timestamp })
          .where(
            and(
              admitted,
              eq(practiceCredentials.professionalId, input.id),
              sql`${practiceCredentials.expiresAt} > ${timestamp}`,
            ),
          ),
      );
  }
  const results = await db.batch(writes);
  if (!Array.isArray(results[0]) || results[0].length !== 1) {
    throw new Error(
      "El caso, el chat o tu sesión cambió. Vuelve a intentarlo.",
    );
  }
  // Sólo después del commit: los gates consultan estado/grants por frame.
  for (const room of rooms) await disconnectConversationSockets(room.id);
  return active.length;
}

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
      extras: { reopeningId: reopeningVersion().as("reopening_id") },
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
      .where(roomVersion(current))
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
