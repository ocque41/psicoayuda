import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  webPushDeliveries as deliveries,
  webPushSubscriptions as subscriptions,
} from "@/db/push-schema";
import { notesConfigured } from "@/lib/practice/note-crypto";
import {
  nextOutsideQuietHours,
  type PushKind,
  type PushPreferences,
  pushPreferencesSchema,
  pushSubscriptionSchema,
  type WebPushSubscription,
} from "./contract";
import { openPushSubscription } from "./crypto";
import { pushDigest } from "./encoding";
import {
  authorizedPushActor,
  eligiblePushActor,
  pushConfiguration,
} from "./preferences";
import { sendWebPush, type WebPushResult } from "./web-push";

type Device = typeof subscriptions.$inferSelect;
type Event = {
  kind: PushKind;
  entityId: string;
  version: string;
  due: number;
  expires: number;
};
type Sender = typeof sendWebPush;
const DAY = 86400000;
const LEASE = 120000;

function liveDevice(device: Device, at: number) {
  return sql`EXISTS(SELECT 1 FROM user u WHERE ${eligiblePushActor({ userId: device.userId, role: device.role, sessionId: device.sessionId || "" }, at)})
 AND EXISTS(SELECT 1 FROM web_push_subscriptions w WHERE w.id=${device.id} AND w.revision=${device.revision} AND w.revoked_at IS NULL AND w.sealed_subscription IS NOT NULL)`;
}
function liveChat(device: Device) {
  return sql`c.status='open' AND c.closed_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
 AND p.status='approved' AND p.non_clinical_helper=0
 AND ((${device.role}='professional' AND p.user_id=${device.userId} AND c.last_message_role='seeker' AND c.last_message_at>coalesce(c.pro_last_read_at,0))
 OR (${device.role}='patient' AND c.last_message_role='professional' AND EXISTS(SELECT 1 FROM patient_conversation_links l WHERE l.conversation_id=c.id AND l.user_id=${device.userId}
 AND l.verified_by IN('verified_email','seeker_session') AND c.last_message_at>coalesce(l.last_read_at,0))))`;
}
function liveAppointment(device: Device) {
  return sql`pp.professional_id=a.professional_id AND pp.status!='closed' AND p.status='approved' AND p.non_clinical_helper=0
 AND ((${device.role}='professional' AND p.user_id=${device.userId}) OR (${device.role}='patient'
 AND EXISTS(SELECT 1 FROM conversations c JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE c.id=pp.conversation_id AND c.professional_id=p.id
 AND c.status='open' AND c.closed_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND l.user_id=${device.userId} AND l.verified_by IN('verified_email','seeker_session'))))`;
}
function missingSessionNote() {
  return sql`a.starts_at<a.ends_at AND NOT EXISTS(SELECT 1 FROM practice_notes n WHERE n.appointment_id=a.id AND n.professional_id=a.professional_id AND n.patient_id=a.patient_id)`;
}
function alreadyQueued(
  device: Device,
  kind: PushKind,
  versionColumn: ReturnType<typeof sql>,
) {
  // Exclude recorded events before LIMIT so a busy inbox progresses on every scan.
  return sql`NOT EXISTS(SELECT 1 FROM web_push_deliveries d WHERE d.subscription_id=${device.id} AND d.kind=${kind} AND d.entity_id=${kind === "chat" ? sql`c.id` : sql`a.id`} AND d.event_version=${versionColumn})`;
}
export const PUSH_JOB_LIMITS = {
  // Statement reservations (not D1 billing/index rows). Each maintenance write touches <=50 base rows.
  statements: 40,
  writes: 30,
  milliseconds: 20000,
  devices: 5,
  eventsPerDevice: 2,
  batch: 3,
} as const;
class PushBudgetExceeded extends Error {}
class PushBudget {
  statements = 0;
  writes = 0;
  exhausted = false;
  enqueued = 0;
  constructor(
    readonly now: () => number,
    readonly started: number,
  ) {}
  checkTime() {
    if (this.now() - this.started >= PUSH_JOB_LIMITS.milliseconds) {
      this.exhausted = true;
      throw new PushBudgetExceeded("push_budget_exhausted");
    }
  }
  reserve(statements: number, writes = 0) {
    this.checkTime();
    if (
      this.statements + statements > PUSH_JOB_LIMITS.statements ||
      this.writes + writes > PUSH_JOB_LIMITS.writes
    ) {
      this.exhausted = true;
      throw new PushBudgetExceeded("push_budget_exhausted");
    }
    this.statements += statements;
    this.writes += writes;
  }
}
async function deviceEvents(
  device: Device,
  preferences: PushPreferences,
  at: number,
): Promise<Event[]> {
  const due = sql`(unixepoch(a.starts_at)*1000-${preferences.offsetMinutes}*60000)`;
  const parts = [
    sql`SELECT 'chat' kind,c.id entity_id,CAST(c.last_message_at AS TEXT) version,c.last_message_at due,c.last_message_at+${DAY} expires
      FROM conversations c JOIN professionals p ON p.id=c.professional_id
      WHERE ${preferences.chatEnabled ? 1 : 0}=1 AND ${liveChat(device)} AND ${liveDevice(device, at)}
      AND c.last_message_at>=${device.consentAt} AND c.last_message_at>${at - DAY} AND ${alreadyQueued(device, "chat", sql`CAST(c.last_message_at AS TEXT)`)}`,
    sql`SELECT 'appointment' kind,a.id entity_id,a.starts_at version,${due} due,unixepoch(a.starts_at)*1000 expires
      FROM practice_appointments a JOIN practice_patients pp ON pp.id=a.patient_id JOIN professionals p ON p.id=a.professional_id
      WHERE ${preferences.appointmentEnabled ? 1 : 0}=1 AND ${liveAppointment(device)} AND ${liveDevice(device, at)} AND a.status='scheduled' AND a.starts_at>${new Date(at).toISOString()}
      AND ${due}>=${device.consentAt} AND ${due} BETWEEN ${at - 3600000} AND ${at + 3600000} AND ${alreadyQueued(device, "appointment", sql`a.starts_at`)}`,
    sql`SELECT 'after_session' kind,a.id entity_id,a.starts_at || '|' || a.ends_at version,unixepoch(a.ends_at)*1000 due,unixepoch(a.ends_at)*1000+${DAY} expires
      FROM practice_appointments a JOIN practice_patients pp ON pp.id=a.patient_id JOIN professionals p ON p.id=a.professional_id
      WHERE ${device.role === "professional" && preferences.afterSessionEnabled && notesConfigured() ? 1 : 0}=1 AND ${liveAppointment(device)} AND ${liveDevice(device, at)} AND ${missingSessionNote()} AND a.status IN('scheduled','completed')
      AND a.ends_at BETWEEN ${new Date(Math.max(device.consentAt, at - DAY)).toISOString()} AND ${new Date(at).toISOString()}
      AND ${alreadyQueued(device, "after_session", sql`a.starts_at || '|' || a.ends_at`)}`,
  ];
  const rows = await db.values<[PushKind, string, string, number, number]>(
    sql`SELECT * FROM (${sql.join(parts, sql` UNION ALL `)}) ORDER BY due,kind,entity_id LIMIT ${PUSH_JOB_LIMITS.eventsPerDevice}`,
  );
  return rows.map(([kind, entityId, version, due, expires]) => ({
    kind,
    entityId,
    version,
    due,
    expires,
  }));
}
export async function enqueueWebPush(
  at: number,
  limit = PUSH_JOB_LIMITS.devices,
  budget = new PushBudget(Date.now, Date.now()),
) {
  budget.reserve(1);
  const rows = await db
    .select()
    .from(subscriptions)
    .where(isNull(subscriptions.revokedAt))
    .orderBy(asc(subscriptions.updatedAt), asc(subscriptions.id))
    .limit(Math.min(PUSH_JOB_LIMITS.devices, Math.max(1, Math.floor(limit))));
  let queued = 0;
  for (const device of rows) {
    const parsed = pushPreferencesSchema.safeParse(
      JSON.parse(device.preferencesJson),
    );
    budget.reserve(1);
    const events = parsed.success
      ? await deviceEvents(device, parsed.data, at)
      : [];
    const inserts = [];
    for (const event of events) {
      if (!parsed.success) break;
      const due = nextOutsideQuietHours(parsed.data, Math.max(at, event.due));
      if (due === null || due >= event.expires) continue;
      const hash = await pushDigest(
        JSON.stringify([event.kind, event.entityId, event.version]),
      );
      // Full schema projection for INSERT SELECT, preserving atomic live guards.
      inserts.push(
        db
          .insert(deliveries)
          .select(
            sql`SELECT ${crypto.randomUUID()},${device.id},${hash},${event.kind},${event.entityId},${event.version},${device.revision},${due},${event.expires},'pending',0,${due},NULL,NULL,NULL,${at},${at} WHERE ${liveDevice(device, at)}`,
          )
          .onConflictDoNothing()
          .returning({ id: deliveries.id }),
      );
    }
    const rotate = db
      .update(subscriptions)
      .set({ updatedAt: at })
      .where(
        and(
          eq(subscriptions.id, device.id),
          eq(subscriptions.revision, device.revision),
        ),
      )
      .returning({ id: subscriptions.id });
    // A device's inserts and rotation share a <=3-statement atomic batch.
    const statements = [rotate, ...inserts] as [
      typeof rotate,
      ...typeof inserts,
    ];
    budget.reserve(statements.length, statements.length);
    const results = await db.batch(statements);
    const inserted = results
      .slice(1)
      .reduce((sum, rows) => sum + rows.length, 0);
    queued += inserted;
    budget.enqueued += inserted;
  }
  return queued;
}
async function eligibleEvent(
  device: Device,
  preferences: PushPreferences,
  event: typeof deliveries.$inferSelect,
  at: number,
) {
  if (event.kind === "chat") {
    if (!preferences.chatEnabled) return false;
    return Boolean(
      (
        await db.values(sql`SELECT c.id FROM conversations c JOIN professionals p ON p.id=c.professional_id WHERE c.id=${event.entityId}
 AND CAST(c.last_message_at AS TEXT)=${event.eventVersion} AND ${liveChat(device)} AND ${liveDevice(device, at)}`)
      ).length,
    );
  }
  if (event.kind === "appointment" && !preferences.appointmentEnabled)
    return false;
  if (
    event.kind === "after_session" &&
    (!preferences.afterSessionEnabled ||
      device.role !== "professional" ||
      !notesConfigured())
  )
    return false;
  return Boolean(
    (
      await db.values(sql`SELECT a.id FROM practice_appointments a JOIN practice_patients pp ON pp.id=a.patient_id JOIN professionals p ON p.id=a.professional_id
 WHERE a.id=${event.entityId} AND ${liveAppointment(device)} AND ${liveDevice(device, at)}
 AND ${event.kind === "appointment" ? sql`a.status='scheduled' AND a.starts_at=${event.eventVersion} AND a.starts_at>${new Date(at).toISOString()}` : sql`a.status IN('scheduled','completed') AND ${missingSessionNote()} AND a.starts_at || '|' || a.ends_at=${event.eventVersion} AND a.ends_at<=${new Date(at).toISOString()}`}`)
    ).length,
  );
}
async function finish(
  id: string,
  token: string,
  status: "sent" | "skipped" | "dead" | "pending",
  reason: string | null,
  at: number,
  next = at,
) {
  await db
    .update(deliveries)
    .set({
      status,
      reasonCode: reason,
      claimToken: null,
      leaseUntil: null,
      updatedAt: at,
      nextAttemptAt: next,
    })
    .where(
      and(
        eq(deliveries.id, id),
        eq(deliveries.claimToken, token),
        eq(deliveries.status, "sending"),
      ),
    );
}
export async function deliverWebPush(
  id: string,
  at: number,
  send: Sender = sendWebPush,
  now: () => number = Date.now,
  budget?: PushBudget,
) {
  const configuration = await pushConfiguration();
  budget?.checkTime();
  if (!configuration) return "unavailable";
  const token = crypto.randomUUID();
  const claimed =
    await db.values(sql`UPDATE web_push_deliveries SET status='sending',claim_token=${token},lease_until=${at + LEASE},attempts=attempts+1,updated_at=${at}
 WHERE id=${id} AND due_at<=${at} AND expires_at>${at} AND attempts<4 AND ((status='pending' AND next_attempt_at<=${at}) OR (status='sending' AND lease_until<=${at})) RETURNING id`);
  if (!claimed.length) return "unclaimed";
  const [event] = await db
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.id, id), eq(deliveries.claimToken, token)));
  if (!event) return "unclaimed";
  const [device] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, event.subscriptionId));
  const skip = async (reason: string) => {
    await finish(id, token, "skipped", reason, now());
    return "skipped";
  };
  if (
    !device ||
    device.revokedAt !== null ||
    !device.sealedSubscription ||
    device.revision !== event.preferenceRevision ||
    device.vapidKeyHash !== (await pushDigest(configuration.publicKey))
  )
    return skip("consent_changed");
  let preferences: PushPreferences;
  let subscription: WebPushSubscription;
  try {
    preferences = pushPreferencesSchema.parse(
      JSON.parse(device.preferencesJson),
    );
    subscription = pushSubscriptionSchema.parse(
      JSON.parse(
        await openPushSubscription(
          device.sealedSubscription,
          device.userId,
          device.role,
          device.id,
        ),
      ),
    );
  } catch {
    await finish(id, token, "dead", "invalid_storage", now());
    return "dead";
  }
  const deliveryAt = now();
  if (!(await eligibleEvent(device, preferences, event, deliveryAt)))
    return skip("eligibility_changed");
  const sendAt = now();
  if (sendAt >= event.expiresAt || sendAt >= at + LEASE) return skip("expired");
  const next = nextOutsideQuietHours(preferences, sendAt);
  if (next === null || next >= event.expiresAt) return skip("quiet_expired");
  if (next > sendAt) {
    // A quiet-hours deferral is not a provider attempt.
    await db.run(
      sql`UPDATE web_push_deliveries SET status='pending',attempts=attempts-1,next_attempt_at=${next},claim_token=NULL,lease_until=NULL,updated_at=${sendAt} WHERE id=${id} AND claim_token=${token} AND status='sending'`,
    );
    return "deferred";
  }
  if (budget && now() - budget.started >= PUSH_JOB_LIMITS.milliseconds - 8500) {
    // Release an unstarted attempt using its reserved cleanup statement.
    await db.run(
      sql`UPDATE web_push_deliveries SET status='pending',attempts=attempts-1,claim_token=NULL,lease_until=NULL,updated_at=${now()} WHERE id=${id} AND claim_token=${token} AND status='sending'`,
    );
    budget.exhausted = true;
    throw new PushBudgetExceeded("push_budget_exhausted");
  }
  let result: WebPushResult;
  try {
    result = await send(
      subscription,
      { v: 1, id: event.id, kind: event.kind, role: device.role },
      Math.max(1, Math.min(300, Math.floor((event.expiresAt - sendAt) / 1000))),
      {
        configuration,
        at: sendAt,
        deadline: budget
          ? budget.started + PUSH_JOB_LIMITS.milliseconds - 500
          : undefined,
        now,
      },
    );
  } catch {
    result = { ok: false, retryable: true, code: "temporary" };
  }
  const finishedAt = now();
  if (result.ok) {
    await finish(id, token, "sent", null, finishedAt);
    return "sent";
  }
  if (result.code === "expired") {
    // Only retire the exact subscription revision that failed, not a fresh opt-in.
    await db
      .update(subscriptions)
      .set({
        revokedAt: finishedAt,
        sealedSubscription: null,
        sessionId: null,
        revision: device.revision + 1,
        updatedAt: finishedAt,
      })
      .where(
        and(
          eq(subscriptions.id, device.id),
          eq(subscriptions.revision, device.revision),
        ),
      );
  }
  const retryAt =
    finishedAt + [60000, 300000, 900000][Math.min(event.attempts - 1, 2)];
  const retry =
    result.retryable && event.attempts < 4 && retryAt < event.expiresAt;
  await finish(
    id,
    token,
    retry ? "pending" : "dead",
    result.code,
    finishedAt,
    retryAt,
  );
  return retry ? "retry" : "dead";
}
/** Called as an independent job by the existing authenticated practice cron. */
/** An opaque notification ID is never an access grant. Resolve after login. */
export async function pushOpenDestination(
  userId: string,
  sessionId: string,
  id: string,
  at = Date.now(),
) {
  const [row] = await db
    .select({ event: deliveries, device: subscriptions })
    .from(deliveries)
    .innerJoin(subscriptions, eq(deliveries.subscriptionId, subscriptions.id))
    .where(
      and(
        eq(deliveries.id, id),
        eq(subscriptions.userId, userId),
        eq(subscriptions.sessionId, sessionId),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.device.revokedAt !== null ||
    !(await authorizedPushActor(
      { userId, sessionId, role: row.device.role },
      at,
    ))
  )
    return "/entrar";
  const fallback =
    row.device.role === "patient"
      ? row.event.kind === "chat"
        ? "/mi/mensajes"
        : "/mi/calendario"
      : row.event.kind === "chat"
        ? "/pro/mensajes"
        : "/pro/consulta";
  if (
    row.event.kind !== "after_session" ||
    row.event.expiresAt <= at ||
    row.event.preferenceRevision !== row.device.revision
  )
    return fallback;
  let preferences: PushPreferences;
  try {
    preferences = pushPreferencesSchema.parse(
      JSON.parse(row.device.preferencesJson),
    );
  } catch {
    return fallback;
  }
  if (!(await eligibleEvent(row.device, preferences, row.event, at)))
    return fallback;
  const rows = await db.values<[string]>(
    sql`SELECT patient_id FROM practice_appointments WHERE id=${row.event.entityId} LIMIT 1`,
  );
  const patientId = rows[0]?.[0];
  return patientId
    ? `/pro/pacientes/${encodeURIComponent(patientId)}?notaSesion=${encodeURIComponent(row.event.entityId)}#notas`
    : fallback;
}
export async function runWebPushJobs(
  at = Date.now(),
  send: Sender = sendWebPush,
  now: () => number = Date.now,
) {
  // Start before configuration, maintenance and enqueue, not just delivery.
  const budget = new PushBudget(now, now());
  const summary = {
    enabled: false,
    enqueued: 0,
    processed: 0,
    sent: 0,
    retried: 0,
    skipped: 0,
    dead: 0,
    failed: 0,
    complete: true,
    exhausted: false,
    statementsReserved: 0,
    writesReserved: 0,
  };
  const configuration = await pushConfiguration();
  if (!configuration) {
    if (process.env.NIDO_PUSH_ENABLED === "true") {
      summary.failed = 1;
      summary.complete = false;
    }
    return summary;
  }
  summary.enabled = true;
  try {
    const keyHash = await pushDigest(configuration.publicKey);
    const retired = sql`revoked_at<${at - 30 * DAY} OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=web_push_subscriptions.user_id)`;
    const maintenance = [
      db
        .update(subscriptions)
        .set({
          sealedSubscription: null,
          sessionId: null,
          revokedAt: at,
          revision: sql`revision+1`,
          updatedAt: at,
        })
        .where(sql`id IN(SELECT id FROM web_push_subscriptions WHERE revoked_at IS NULL AND (vapid_key_hash!=${keyHash} OR NOT EXISTS(SELECT 1 FROM session s WHERE s.id=web_push_subscriptions.session_id AND s.user_id=web_push_subscriptions.user_id AND s.expires_at>${at})
        OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=web_push_subscriptions.user_id AND u.email_verified=1
        AND ((web_push_subscriptions.role='professional' AND EXISTS(SELECT 1 FROM professionals p WHERE p.user_id=u.id AND p.status='approved' AND p.non_clinical_helper=0))
        OR (web_push_subscriptions.role='patient' AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=u.id AND pa.deletion_state='active' AND pa.onboarding_completed_at IS NOT NULL))))) ORDER BY updated_at,id LIMIT 50)`),
      db
        .update(deliveries)
        .set({
          status: "dead",
          reasonCode: "expired",
          claimToken: null,
          leaseUntil: null,
          updatedAt: at,
        })
        .where(
          sql`id IN(SELECT id FROM web_push_deliveries WHERE status IN('pending','sending') AND (expires_at<=${at} OR (attempts>=4 AND coalesce(lease_until,0)<=${at})) ORDER BY expires_at,id LIMIT 50)`,
        ),
      db
        .delete(deliveries)
        .where(
          sql`id IN(SELECT id FROM web_push_deliveries WHERE expires_at<${at - 30 * DAY} ORDER BY expires_at,id LIMIT 50)`,
        ),
      db
        .delete(deliveries)
        .where(
          sql`id IN(SELECT id FROM web_push_deliveries WHERE subscription_id IN(SELECT id FROM web_push_subscriptions WHERE ${retired}) ORDER BY expires_at,id LIMIT 50)`,
        ),
      db
        .delete(subscriptions)
        .where(
          sql`id IN(SELECT id FROM web_push_subscriptions WHERE (${retired}) AND NOT EXISTS(SELECT 1 FROM web_push_deliveries d WHERE d.subscription_id=web_push_subscriptions.id) ORDER BY updated_at,id LIMIT 50)`,
        ),
    ];
    budget.reserve(3, 3);
    await db.batch([maintenance[0], maintenance[1], maintenance[2]]);
    budget.reserve(2, 2);
    await db.batch([maintenance[3], maintenance[4]]);
    await enqueueWebPush(at, PUSH_JOB_LIMITS.devices, budget);
    budget.reserve(1);
    const rows = await db.values<[string]>(
      sql`SELECT id FROM web_push_deliveries WHERE expires_at>${at} AND ((status='pending' AND next_attempt_at<=${at}) OR (status='sending' AND lease_until<=${at})) ORDER BY next_attempt_at,id LIMIT 20`,
    );
    for (const [id] of rows) {
      // A delivery needs at most six SQL statements, including 410 retirement.
      budget.reserve(6, 3);
      const status = await deliverWebPush(id, now(), send, now, budget);
      summary.processed++;
      if (status === "sent") summary.sent++;
      else if (status === "retry") {
        summary.retried++;
        summary.failed++;
      } else if (status === "dead") {
        summary.dead++;
        summary.failed++;
      } else if (status === "unavailable") summary.failed++;
      else summary.skipped++;
    }
    budget.checkTime();
  } catch (error) {
    if (!(error instanceof PushBudgetExceeded)) throw error;
    summary.exhausted = true;
    summary.complete = false;
    summary.failed++;
  }
  summary.enqueued = budget.enqueued;
  summary.statementsReserved = budget.statements;
  summary.writesReserved = budget.writes;
  return summary;
}
