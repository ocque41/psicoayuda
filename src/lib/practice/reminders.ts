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
export async function enqueueAppointmentReminders(at: number, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
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
    ORDER BY ${dueSql},a.id,pref.user_id,pref.role LIMIT ${boundedLimit}`);
  let enqueued = 0;
  for (const [
    appointmentId,
    startsAt,
    userId,
    role,
    revision,
    timeZone,
    email,
    offset,
    preferencesUpdatedAt,
  ] of candidates) {
    const dueAt = Date.parse(startsAt) - offset * 60_000;
    if (!Number.isFinite(dueAt) || dueAt < Date.parse(preferencesUpdatedAt))
      continue;
    const rows = await db.values<
      [string]
    >(sql`INSERT INTO appointment_reminder_deliveries(id,appointment_id,appointment_starts_at,user_id,role,offset_minutes,preference_revision,recipient_hash,time_zone,due_at,status,attempts,next_attempt_at,created_at,updated_at)
      SELECT ${newId("reminder")},a.id,a.starts_at,pref.user_id,pref.role,${offset},pref.revision,${recipientHash(email)},pref.time_zone,${dueAt},'pending',0,${dueAt},${at},${at}
      FROM appointment_reminder_preferences pref JOIN user u ON u.id=pref.user_id
      JOIN practice_appointments a ON a.id=${appointmentId}
      JOIN practice_patients pp ON pp.id=a.patient_id AND pp.professional_id=a.professional_id
      JOIN professionals pro ON pro.id=a.professional_id
      WHERE pref.user_id=${userId} AND pref.role=${role} AND pref.revision=${revision} AND pref.time_zone=${timeZone}
      AND a.starts_at=${startsAt} AND ${liveEligibility(at)}
      AND EXISTS(SELECT 1 FROM json_each(pref.offsets_json) slot WHERE CAST(slot.value AS INTEGER)=${offset})
      ON CONFLICT(appointment_id,appointment_starts_at,user_id,role,offset_minutes) DO UPDATE
        SET preference_revision=excluded.preference_revision,recipient_hash=excluded.recipient_hash,time_zone=excluded.time_zone,updated_at=excluded.updated_at
        WHERE appointment_reminder_deliveries.status='pending' AND appointment_reminder_deliveries.attempts=0 AND appointment_reminder_deliveries.first_attempt_at IS NULL
          AND appointment_reminder_deliveries.preference_revision != excluded.preference_revision RETURNING id`);
    enqueued += rows.length;
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
  if (
    !to ||
    !delivery.leaseUntil ||
    delivery.leaseUntil <= sendAt ||
    Date.parse(delivery.appointmentStartsAt) <= sendAt
  ) {
    await finishDelivery(id, token, sendAt, "skipped", "eligibility_changed");
    return "skipped" as const;
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
    await finishDelivery(id, token, finishedAt, "dead", result.code);
    return "dead" as const;
  }
  await db.run(sql`UPDATE appointment_reminder_deliveries SET status='pending',reason_code=${result.code},next_attempt_at=${nextAt},claim_token=NULL,lease_until=NULL,updated_at=${finishedAt}
    WHERE id=${id} AND claim_token=${token} AND status='sending'`);
  return "retry" as const;
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
    unavailable: false,
  };
  if (process.env.NIDO_PRACTICE_ENABLED !== "true" || !reminderProviderReady())
    return { ...result, unavailable: true };
  const clock = options.now || Date.now;
  const startedAt = Date.now();
  result.enqueued = await enqueueAppointmentReminders(clock());
  const at = clock();
  const limit = Math.min(20, Math.max(1, Math.floor(options.limit || 20)));
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
    .limit(limit);
  for (const [index, delivery] of deliveries.entries()) {
    if (Date.now() - startedAt > 35_000) break;
    // 1,5 solicitudes/s como máximo en este runner; 429 sigue siendo reintentable.
    if (index > 0 && !options.send)
      await new Promise((resolve) => setTimeout(resolve, 650));
    const outcome = await deliverAppointmentReminder(
      delivery.id,
      clock(),
      options.send,
      clock,
    );
    if (outcome !== "unclaimed") result[outcome]++;
  }
  return result;
}
