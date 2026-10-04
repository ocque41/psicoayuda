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
async function deviceEvents(
  device: Device,
  preferences: PushPreferences,
  at: number,
): Promise<Event[]> {
  const events: Event[] = [];
  if (preferences.chatEnabled) {
    const rows = await db.values<
      [string, number]
    >(sql`SELECT c.id,c.last_message_at FROM conversations c JOIN professionals p ON p.id=c.professional_id
 WHERE ${liveChat(device)} AND ${liveDevice(device, at)} AND c.last_message_at>=${device.consentAt} AND c.last_message_at>${at - DAY}
 AND ${alreadyQueued(device, "chat", sql`CAST(c.last_message_at AS TEXT)`)} ORDER BY c.last_message_at,c.id LIMIT 10`);
    for (const [id, time] of rows)
      events.push({
        kind: "chat",
        entityId: id,
        version: String(time),
        due: time,
        expires: time + DAY,
      });
  }
  if (preferences.appointmentEnabled) {
    const due = sql`(unixepoch(a.starts_at)*1000-${preferences.offsetMinutes}*60000)`;
    const rows = await db.values<
      [string, string]
    >(sql`SELECT a.id,a.starts_at FROM practice_appointments a JOIN practice_patients pp ON pp.id=a.patient_id JOIN professionals p ON p.id=a.professional_id
 WHERE ${liveAppointment(device)} AND ${liveDevice(device, at)} AND a.status='scheduled' AND a.starts_at>${new Date(at).toISOString()}
 AND ${due}>=${device.consentAt} AND ${due} BETWEEN ${at - 3600000} AND ${at + 3600000}
 AND ${alreadyQueued(device, "appointment", sql`a.starts_at`)} ORDER BY a.starts_at,a.id LIMIT 10`);
    for (const [id, start] of rows)
      events.push({
        kind: "appointment",
        entityId: id,
        version: start,
        due: Date.parse(start) - preferences.offsetMinutes * 60000,
        expires: Date.parse(start),
      });
  }
  if (
    device.role === "professional" &&
    preferences.afterSessionEnabled &&
    notesConfigured()
  ) {
    const rows = await db.values<
      [string, string, string]
    >(sql`SELECT a.id,a.starts_at,a.ends_at FROM practice_appointments a JOIN practice_patients pp ON pp.id=a.patient_id JOIN professionals p ON p.id=a.professional_id
 WHERE ${liveAppointment(device)} AND ${liveDevice(device, at)} AND ${missingSessionNote()} AND a.status IN('scheduled','completed')
 AND a.ends_at BETWEEN ${new Date(Math.max(device.consentAt, at - DAY)).toISOString()} AND ${new Date(at).toISOString()}
 AND ${alreadyQueued(device, "after_session", sql`a.starts_at || '|' || a.ends_at`)} ORDER BY a.ends_at,a.id LIMIT 10`);
    for (const [id, start, end] of rows)
      events.push({
        kind: "after_session",
        entityId: id,
        version: `${start}|${end}`,
        due: Date.parse(end),
        expires: Date.parse(end) + DAY,
      });
  }
  return events;
}
export async function enqueueWebPush(at: number, limit = 50) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(isNull(subscriptions.revokedAt))
    .orderBy(asc(subscriptions.updatedAt), asc(subscriptions.id))
    .limit(Math.min(50, Math.max(1, limit)));
  let queued = 0;
  for (const device of rows) {
    let preferences: PushPreferences;
    try {
      preferences = pushPreferencesSchema.parse(
        JSON.parse(device.preferencesJson),
      );
    } catch {
      continue;
    }
    for (const event of await deviceEvents(device, preferences, at)) {
      const due = nextOutsideQuietHours(preferences, Math.max(at, event.due));
      if (due === null || due >= event.expires) continue;
      const hash = await pushDigest(
        JSON.stringify([event.kind, event.entityId, event.version]),
      );
      const id = crypto.randomUUID();
      const inserted =
        await db.values(sql`INSERT INTO web_push_deliveries(id,subscription_id,event_hash,kind,entity_id,event_version,preference_revision,due_at,expires_at,next_attempt_at,created_at,updated_at)
 SELECT ${id},${device.id},${hash},${event.kind},${event.entityId},${event.version},${device.revision},${due},${event.expires},${due},${at},${at}
 WHERE ${liveDevice(device, at)} ON CONFLICT(subscription_id,event_hash) DO NOTHING RETURNING id`);
      queued += inserted.length;
    }
    // Rotate the bounded scan without changing revision or consent timestamps.
    await db
      .update(subscriptions)
      .set({ updatedAt: at })
      .where(
        and(
          eq(subscriptions.id, device.id),
          eq(subscriptions.revision, device.revision),
        ),
      );
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
) {
  const configuration = await pushConfiguration();
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
  let result: WebPushResult;
  try {
    result = await send(
      subscription,
      { v: 1, id: event.id, kind: event.kind, role: device.role },
      Math.max(1, Math.min(300, Math.floor((event.expiresAt - sendAt) / 1000))),
      { configuration, at: sendAt },
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
  const configuration = await pushConfiguration();
  if (!configuration) return { enabled: false, enqueued: 0, processed: 0 };
  const keyHash = await pushDigest(configuration.publicKey);
  // Purge capability material when auth is revoked/expired; keep a bounded ledger.
  await db.run(sql`UPDATE web_push_subscriptions SET sealed_subscription=NULL,session_id=NULL,revoked_at=${at},revision=revision+1,updated_at=${at}
 WHERE revoked_at IS NULL AND (vapid_key_hash!=${keyHash} OR NOT EXISTS(SELECT 1 FROM session s WHERE s.id=web_push_subscriptions.session_id AND s.user_id=web_push_subscriptions.user_id AND s.expires_at>${at})
 OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=web_push_subscriptions.user_id AND u.email_verified=1
 AND ((web_push_subscriptions.role='professional' AND EXISTS(SELECT 1 FROM professionals p WHERE p.user_id=u.id AND p.status='approved' AND p.non_clinical_helper=0))
 OR (web_push_subscriptions.role='patient' AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=u.id AND pa.deletion_state='active' AND pa.onboarding_completed_at IS NOT NULL)))))`);
  await db.run(
    sql`UPDATE web_push_deliveries SET status='dead',reason_code='expired',claim_token=NULL,lease_until=NULL,updated_at=${at} WHERE status IN('pending','sending') AND (expires_at<=${at} OR (attempts>=4 AND coalesce(lease_until,0)<=${at}))`,
  );
  await db.run(
    sql`DELETE FROM web_push_deliveries WHERE expires_at<${at - 30 * DAY}`,
  );
  // Explicit child-first deletion works even when a driver's FK pragma is off.
  await db.run(
    sql`DELETE FROM web_push_deliveries WHERE subscription_id IN(SELECT id FROM web_push_subscriptions WHERE revoked_at<${at - 30 * DAY} OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=web_push_subscriptions.user_id))`,
  );
  await db.run(
    sql`DELETE FROM web_push_subscriptions WHERE revoked_at<${at - 30 * DAY} OR NOT EXISTS(SELECT 1 FROM user u WHERE u.id=web_push_subscriptions.user_id)`,
  );
  const enqueued = await enqueueWebPush(at);
  const rows = await db.values<[string]>(
    sql`SELECT id FROM web_push_deliveries WHERE expires_at>${at} AND ((status='pending' AND next_attempt_at<=${at}) OR (status='sending' AND lease_until<=${at})) ORDER BY next_attempt_at,id LIMIT 20`,
  );
  let processed = 0;
  const started = now();
  for (const [id] of rows) {
    if (now() - started > 30000) break;
    await deliverWebPush(id, now(), send, now);
    processed++;
  }
  return { enabled: true, enqueued, processed };
}
