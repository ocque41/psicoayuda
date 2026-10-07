import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointmentReminderDeliveries } from "@/db/reminder-schema";
import { newId } from "@/lib/ids";
import {
  type ReminderEmailInput,
  type ReminderEmailResult,
  sendAppointmentReminderEmail,
} from "./reminder-email";
import type { ReminderRole } from "./reminder-options";
import { reminderProviderReady } from "./reminder-preferences";

const MAX_ATTEMPTS = 4;
const LEASE_MS = 120_000;
const RETRY_WINDOW_MS = 23 * 3_600_000;
const BACKOFF_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000];
export const REMINDER_JOB_LIMITS = {
  // Reservas de sentencias, no filas facturables/índices ni capacidad de Workers.
  statements: 40,
  writes: 30,
  milliseconds: 35_000,
  enqueue: 100,
  batch: 8,
  deliveries: 20,
} as const;
class ReminderBudgetExceeded extends Error {}
class ReminderBudget {
  statements = 0;
  writes = 0;
  enqueued = 0;
  moreWork = false;
  exhausted = false;
  constructor(
    readonly now: () => number,
    readonly started: number,
  ) {}
  expired() {
    return this.now() - this.started >= REMINDER_JOB_LIMITS.milliseconds;
  }
  reserve(statements: number, writes = 0) {
    if (
      this.expired() ||
      this.statements + statements > REMINDER_JOB_LIMITS.statements ||
      this.writes + writes > REMINDER_JOB_LIMITS.writes
    ) {
      this.exhausted = true;
      throw new ReminderBudgetExceeded();
    }
    this.statements += statements;
    this.writes += writes;
  }
}
type Candidate = [
  string,
  string,
  string,
  ReminderRole,
  number,
  string,
  string,
  number,
  string,
];
type Delivery = typeof appointmentReminderDeliveries.$inferSelect;

/** Solo identidad operativa verificada. Nunca se leen nombres ni notas.
 * Para paciente se exige vínculo vivo de esa cuenta, no un email en su ficha. */
function liveEligibility(at: number) {
  return sql`pref.email_enabled=1 AND u.email_verified=1
    AND pro.status='approved' AND pro.non_clinical_helper=0
    AND a.status='scheduled' AND a.starts_at > ${new Date(at).toISOString()}
    AND pp.status != 'closed'
    AND ((pref.role='professional' AND pro.user_id=pref.user_id)
      OR (pref.role='patient' AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=pref.user_id AND pa.deletion_state='active' AND pa.onboarding_completed_at IS NOT NULL)
        AND EXISTS(SELECT 1 FROM conversations c JOIN patient_conversation_links l ON l.conversation_id=c.id
          WHERE c.id=pp.conversation_id AND c.professional_id=pro.id AND c.status='open'
          AND c.closed_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND l.user_id=pref.user_id
          AND l.verified_by IN ('verified_email','seeker_session'))))`;
}

function recipientHash(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

/** Acota el horizonte y excluye claves ya registradas antes de LIMIT para
 * avanzar el backlog. El insert repite los guards tras leer candidatos. */
export async function enqueueAppointmentReminders(
  at: number,
  limit = 100,
  budget?: ReminderBudget,
) {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  budget?.reserve(1);
  const dueSql = sql`(unixepoch(a.starts_at)*1000 - CAST(slot.value AS INTEGER)*60000)`;
  const candidates =
    await db.values<Candidate>(sql`SELECT a.id,a.starts_at,pref.user_id,pref.role,pref.revision,pref.time_zone,u.email,CAST(slot.value AS INTEGER),pref.updated_at
    FROM appointment_reminder_preferences pref JOIN user u ON u.id=pref.user_id
    JOIN json_each(pref.offsets_json) slot
    JOIN practice_appointments a ON a.status='scheduled'
    JOIN practice_patients pp ON pp.id=a.patient_id AND pp.professional_id=a.professional_id
    JOIN professionals pro ON pro.id=a.professional_id
    WHERE ${liveEligibility(at)}
    AND a.starts_at >= ${new Date(at).toISOString()} AND a.starts_at < ${new Date(at + 8 * 86_400_000).toISOString()}
    AND ${dueSql} BETWEEN ${at - 15 * 60_000} AND ${at + 60 * 60_000}
    AND ${dueSql} >= unixepoch(pref.updated_at)*1000
    AND NOT EXISTS(SELECT 1 FROM appointment_reminder_deliveries existing WHERE existing.appointment_id=a.id AND existing.appointment_starts_at=a.starts_at AND existing.user_id=pref.user_id AND existing.role=pref.role AND existing.offset_minutes=CAST(slot.value AS INTEGER)
      AND NOT(existing.status='pending' AND existing.attempts=0 AND existing.first_attempt_at IS NULL AND existing.preference_revision != pref.revision))
    ORDER BY ${dueSql},a.id,pref.user_id,pref.role LIMIT ${budget ? boundedLimit + 1 : boundedLimit}`);
  if (budget && candidates.length > boundedLimit) budget.moreWork = true;
  let enqueued = 0;
  const valid = candidates.slice(0, boundedLimit).filter((row) => {
    const dueAt = Date.parse(row[1]) - row[7] * 60_000;
    return Number.isFinite(dueAt) && dueAt >= Date.parse(row[8]);
  });
  const batchSize = budget ? REMINDER_JOB_LIMITS.batch : 1;
  for (let index = 0; index < valid.length; index += batchSize) {
    budget?.reserve(1, 1);
    // Diez parámetros por fila + tres comunes: <=83 con ocho candidatos.
    // Una sentencia INSERT SELECT revalida cada fila y conserva el mismo CAS.
    const inputs = valid
      .slice(index, index + batchSize)
      .map(
        ([
          appointmentId,
          startsAt,
          userId,
          role,
          revision,
          timeZone,
          email,
          offset,
        ]) =>
          sql`(${newId("reminder")},${appointmentId},${startsAt},${userId},${role},${offset},${revision},${recipientHash(email)},${timeZone},${Date.parse(startsAt) - offset * 60_000})`,
      );
    const rows = await db.values<
      [string]
    >(sql`WITH candidate(id,appointment_id,appointment_starts_at,user_id,role,offset_minutes,preference_revision,recipient_hash,time_zone,due_at) AS (VALUES ${sql.join(inputs, sql`,`)})
      INSERT INTO appointment_reminder_deliveries(id,appointment_id,appointment_starts_at,user_id,role,offset_minutes,preference_revision,recipient_hash,time_zone,due_at,status,attempts,next_attempt_at,created_at,updated_at)
      SELECT candidate.id,a.id,a.starts_at,pref.user_id,pref.role,candidate.offset_minutes,pref.revision,candidate.recipient_hash,pref.time_zone,candidate.due_at,'pending',0,candidate.due_at,${at},${at}
      FROM candidate JOIN appointment_reminder_preferences pref ON pref.user_id=candidate.user_id AND pref.role=candidate.role
      JOIN user u ON u.id=pref.user_id
      JOIN practice_appointments a ON a.id=candidate.appointment_id
      JOIN practice_patients pp ON pp.id=a.patient_id AND pp.professional_id=a.professional_id
      JOIN professionals pro ON pro.id=a.professional_id
      WHERE pref.revision=candidate.preference_revision AND pref.time_zone=candidate.time_zone
      AND a.starts_at=candidate.appointment_starts_at AND ${liveEligibility(at)}
      AND EXISTS(SELECT 1 FROM json_each(pref.offsets_json) slot WHERE CAST(slot.value AS INTEGER)=candidate.offset_minutes)
      ON CONFLICT(appointment_id,appointment_starts_at,user_id,role,offset_minutes) DO UPDATE
        SET preference_revision=excluded.preference_revision,recipient_hash=excluded.recipient_hash,time_zone=excluded.time_zone,updated_at=excluded.updated_at
        WHERE appointment_reminder_deliveries.status='pending' AND appointment_reminder_deliveries.attempts=0 AND appointment_reminder_deliveries.first_attempt_at IS NULL
          AND appointment_reminder_deliveries.preference_revision != excluded.preference_revision RETURNING id`);
    enqueued += rows.length;
    if (budget) budget.enqueued += rows.length;
  }
  return enqueued;
}

export async function claimAppointmentReminder(id: string, at: number) {
  const token = newId("claim");
  const rows = await db.values<
    [string]
  >(sql`UPDATE appointment_reminder_deliveries
    SET status='sending',claim_token=${token},lease_until=${at + LEASE_MS},attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,${at}),updated_at=${at}
    WHERE id=${id} AND due_at <= ${at} AND attempts < ${MAX_ATTEMPTS}
    AND (first_attempt_at IS NULL OR first_attempt_at > ${at - RETRY_WINDOW_MS})
    AND ((status='pending' AND next_attempt_at <= ${at}) OR (status='sending' AND lease_until <= ${at})) RETURNING id`);
  return rows.length ? token : null;
}

async function finishDelivery(
  id: string,
  token: string,
  at: number,
  status: "sent" | "skipped" | "dead",
  reasonCode: string | null,
) {
  const rows = await db.values<
    [string]
  >(sql`UPDATE appointment_reminder_deliveries SET status=${status},reason_code=${reasonCode},sent_at=${status === "sent" ? at : null},claim_token=NULL,lease_until=NULL,updated_at=${at}
    WHERE id=${id} AND claim_token=${token} AND status='sending' RETURNING id`);
  return Boolean(rows.length);
}

async function currentRecipient(delivery: Delivery, token: string, at: number) {
  const rows = await db.values<
    [string]
  >(sql`SELECT u.email FROM appointment_reminder_deliveries d
    JOIN appointment_reminder_preferences pref ON pref.user_id=d.user_id AND pref.role=d.role
    JOIN user u ON u.id=d.user_id JOIN practice_appointments a ON a.id=d.appointment_id
    JOIN practice_patients pp ON pp.id=a.patient_id AND pp.professional_id=a.professional_id
    JOIN professionals pro ON pro.id=a.professional_id
    WHERE d.id=${delivery.id} AND d.status='sending' AND d.claim_token=${token} AND d.lease_until > ${at}
    AND d.appointment_starts_at=a.starts_at AND d.preference_revision=pref.revision AND d.time_zone=pref.time_zone
    AND EXISTS(SELECT 1 FROM json_each(pref.offsets_json) slot WHERE CAST(slot.value AS INTEGER)=d.offset_minutes)
    AND ${liveEligibility(at)} LIMIT 1`);
  const email = rows[0]?.[0];
  return email && recipientHash(email) === delivery.recipientHash
    ? email
    : null;
}

/** Revalida al entregar, después de reclamar y de cualquier espera. La API
 * externa no comparte transacción con D1: un envío ya iniciado no se retracta. */
export async function deliverAppointmentReminder(
  id: string,
  at: number,
  send: (
    input: ReminderEmailInput,
  ) => Promise<ReminderEmailResult> = sendAppointmentReminderEmail,
  now: () => number = Date.now,
  budget?: ReminderBudget,
) {
  const token = await claimAppointmentReminder(id, at);
  if (!token) {
    const expired = await db.values<
      [string]
    >(sql`UPDATE appointment_reminder_deliveries SET status='dead',reason_code='retry_exhausted',claim_token=NULL,lease_until=NULL,updated_at=${at}
      WHERE id=${id} AND ((status='pending' AND next_attempt_at <= ${at}) OR (status='sending' AND lease_until <= ${at}))
      AND (attempts >= ${MAX_ATTEMPTS} OR first_attempt_at <= ${at - RETRY_WINDOW_MS}) RETURNING id`);
    return expired.length ? ("dead" as const) : ("unclaimed" as const);
  }
  const [delivery] = await db
    .select()
    .from(appointmentReminderDeliveries)
    .where(
      and(
        eq(appointmentReminderDeliveries.id, id),
        eq(appointmentReminderDeliveries.claimToken, token),
      ),
    )
    .limit(1);
  if (!delivery) return "unclaimed" as const;
  const to = await currentRecipient(delivery, token, now());
  // Una lectura puede tardar más que el lease. Se comprueba el reloj otra vez
  // tras el lookup, inmediatamente antes de iniciar la petición externa.
  const sendAt = now();
  if (budget?.expired()) {
    // La petición externa aún no empezó. Devolver la reclamación permite
    // revalidar en el próximo tick; CAS conserva un intento tomado por otro.
    budget.exhausted = true;
    const released = await db.values<
      [string]
    >(sql`UPDATE appointment_reminder_deliveries
      SET status='pending',attempts=attempts-1,first_attempt_at=CASE WHEN attempts=1 THEN NULL ELSE first_attempt_at END,
        claim_token=NULL,lease_until=NULL,updated_at=${sendAt}
      WHERE id=${id} AND claim_token=${token} AND status='sending' RETURNING id`);
    return released.length ? ("deferred" as const) : ("unclaimed" as const);
  }
  if (
    !to ||
    !delivery.leaseUntil ||
    delivery.leaseUntil <= sendAt ||
    Date.parse(delivery.appointmentStartsAt) <= sendAt
  ) {
    return (await finishDelivery(
      id,
      token,
      sendAt,
      "skipped",
      "eligibility_changed",
    ))
      ? ("skipped" as const)
      : ("unclaimed" as const);
  }
  let result: ReminderEmailResult;
  try {
    result = await send({
      to,
      startsAt: delivery.appointmentStartsAt,
      timeZone: delivery.timeZone,
      role: delivery.role,
      deliveryId: delivery.id,
    });
  } catch {
    result = { ok: false, retryable: true, code: "network" };
  }
  const finishedAt = now();
  if (result.ok) {
    return (await finishDelivery(id, token, finishedAt, "sent", null))
      ? ("sent" as const)
      : ("unclaimed" as const);
  }
  const nextAt =
    finishedAt +
    BACKOFF_MS[Math.min(delivery.attempts - 1, BACKOFF_MS.length - 1)];
  const exhausted =
    !result.retryable ||
    delivery.attempts >= MAX_ATTEMPTS ||
    nextAt >= Date.parse(delivery.appointmentStartsAt) ||
    nextAt >= (delivery.firstAttemptAt || at) + RETRY_WINDOW_MS;
  if (exhausted) {
    return (await finishDelivery(id, token, finishedAt, "dead", result.code))
      ? ("dead" as const)
      : ("unclaimed" as const);
  }
  // Un resultado tardío no pertenece a este intento si otro ya tomó el lease.
  const changed = await db.values<
    [string]
  >(sql`UPDATE appointment_reminder_deliveries SET status='pending',reason_code=${result.code},next_attempt_at=${nextAt},claim_token=NULL,lease_until=NULL,updated_at=${finishedAt}
    WHERE id=${id} AND claim_token=${token} AND status='sending' RETURNING id`);
  return changed.length ? ("retry" as const) : ("unclaimed" as const);
}

/** El endpoint interno de cron es el único caller automático. Sin proveedor
 * o sin opt-in no se crean envíos. Devuelve solo recuentos, nunca destinatarios. */
export async function runAppointmentReminderJobs(
  options: {
    now?: () => number;
    send?: (input: ReminderEmailInput) => Promise<ReminderEmailResult>;
    limit?: number;
  } = {},
) {
  const result = {
    enqueued: 0,
    sent: 0,
    skipped: 0,
    retry: 0,
    dead: 0,
    unclaimed: 0,
    deferred: 0,
    unavailable: false,
    complete: true,
    exhausted: false,
    statementsReserved: 0,
    writesReserved: 0,
  };
  if (process.env.NIDO_PRACTICE_ENABLED !== "true" || !reminderProviderReady())
    return { ...result, unavailable: true };
  const clock = options.now || Date.now;
  const budget = new ReminderBudget(clock, clock());
  try {
    // Agrupar inserts mantiene el horizonte y deja margen para entregar backlog.
    await enqueueAppointmentReminders(
      clock(),
      REMINDER_JOB_LIMITS.enqueue,
      budget,
    );
    const at = clock();
    const limit = Math.min(
      REMINDER_JOB_LIMITS.deliveries,
      Math.max(1, Math.floor(options.limit || REMINDER_JOB_LIMITS.deliveries)),
    );
    budget.reserve(1);
    const deliveries = await db
      .select({ id: appointmentReminderDeliveries.id })
      .from(appointmentReminderDeliveries)
      .where(
        sql`(${appointmentReminderDeliveries.status}='pending' AND ${appointmentReminderDeliveries.nextAttemptAt} <= ${at}) OR (${appointmentReminderDeliveries.status}='sending' AND ${appointmentReminderDeliveries.leaseUntil} <= ${at})`,
      )
      .orderBy(
        asc(appointmentReminderDeliveries.nextAttemptAt),
        asc(appointmentReminderDeliveries.id),
      )
      .limit(limit + 1);
    if (deliveries.length > limit) budget.moreWork = true;
    for (const [index, delivery] of deliveries.slice(0, limit).entries()) {
      budget.reserve(0);
      // 1,5 solicitudes/s como máximo en este runner; 429 sigue siendo reintentable.
      if (index > 0 && !options.send)
        await new Promise((resolve) => setTimeout(resolve, 650));
      // Reserva también el cierre CAS aunque SQL/red agoten el reloj después.
      budget.reserve(4, 2);
      const outcome = await deliverAppointmentReminder(
        delivery.id,
        clock(),
        options.send,
        clock,
        budget,
      );
      result[outcome]++;
    }
    if (budget.expired()) budget.exhausted = true;
  } catch (error) {
    if (!(error instanceof ReminderBudgetExceeded)) throw error;
  }
  result.enqueued = budget.enqueued;
  result.exhausted = budget.exhausted;
  result.statementsReserved = budget.statements;
  result.writesReserved = budget.writes;
  // Complete acredita el scan y los intentos debidos de este tick, no entrega
  // de avisos futuros. Reintentos y resultados no acreditados siguen pendientes.
  result.complete =
    !budget.moreWork &&
    !budget.exhausted &&
    result.retry === 0 &&
    result.dead === 0 &&
    result.unclaimed === 0 &&
    result.deferred === 0;
  return result;
}
