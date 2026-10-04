import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { webPushDeliveries, webPushSubscriptions } from "@/db/push-schema";
import {
  type PushPreferences,
  type PushRole,
  pushPreferencesSchema,
  pushSubscriptionSchema,
} from "./contract";
import { pushStorageReady, sealPushSubscription } from "./crypto";
import { decodeBase64url, pushDigest } from "./encoding";
import { readVapidConfiguration, vapidAuthorization } from "./web-push";

export type PushActor = { userId: string; role: PushRole; sessionId: string };
/** Managing existing consent does not grant access to an approved practice. */
export function verifiedPushAccount(actor: PushActor, at: number) {
  return sql`u.id=${actor.userId} AND u.email_verified=1
 AND EXISTS(SELECT 1 FROM session s WHERE s.id=${actor.sessionId} AND s.user_id=u.id AND s.expires_at>${at})
 AND ((${actor.role}='professional' AND EXISTS(SELECT 1 FROM professionals p WHERE p.user_id=u.id))
 OR (${actor.role}='patient' AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=u.id)))`;
}
export async function authorizedPushAccount(actor: PushActor, at = Date.now()) {
  return Boolean(
    (
      await db.values(
        sql`SELECT u.id FROM user u WHERE ${verifiedPushAccount(actor, at)} LIMIT 1`,
      )
    ).length,
  );
}
export async function revocablePushDevices(actor: PushActor, at = Date.now()) {
  return db
    .select({
      id: webPushSubscriptions.id,
      revokedAt: webPushSubscriptions.revokedAt,
    })
    .from(webPushSubscriptions)
    .where(
      and(
        eq(webPushSubscriptions.userId, actor.userId),
        eq(webPushSubscriptions.role, actor.role),
        isNull(webPushSubscriptions.revokedAt),
        sql`EXISTS(SELECT 1 FROM user u WHERE ${verifiedPushAccount(actor, at)})`,
      ),
    )
    .limit(20);
}
/** Alias u plus a real auth session; never trust the requested role as authority. */
export function eligiblePushActor(actor: PushActor, at: number) {
  return sql`u.id=${actor.userId} AND u.email_verified=1
 AND EXISTS(SELECT 1 FROM session s WHERE s.id=${actor.sessionId} AND s.user_id=u.id AND s.expires_at>${at})
 AND ((${actor.role}='professional' AND EXISTS(SELECT 1 FROM professionals p WHERE p.user_id=u.id AND p.status='approved' AND p.non_clinical_helper=0))
 OR (${actor.role}='patient' AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=u.id AND pa.deletion_state='active' AND pa.onboarding_completed_at IS NOT NULL)))`;
}
export async function authorizedPushActor(actor: PushActor, at = Date.now()) {
  return Boolean(
    (
      await db.values(
        sql`SELECT u.id FROM user u WHERE ${eligiblePushActor(actor, at)} LIMIT 1`,
      )
    ).length,
  );
}
export async function pushConfiguration() {
  const vapid = readVapidConfiguration();
  if (process.env.NIDO_PUSH_ENABLED !== "true" || !pushStorageReady() || !vapid)
    return null;
  try {
    await vapidAuthorization(
      "https://fcm.googleapis.com/test",
      vapid,
      Date.now(),
    );
    return vapid;
  } catch {
    return null;
  }
}
export async function pushDevices(actor: PushActor) {
  const currentKeyHash = await pushDigest(
    readVapidConfiguration()?.publicKey || "",
  );
  const rows = await db
    .select()
    .from(webPushSubscriptions)
    .where(
      and(
        eq(webPushSubscriptions.userId, actor.userId),
        eq(webPushSubscriptions.role, actor.role),
      ),
    )
    .orderBy(
      desc(sql`${webPushSubscriptions.revokedAt} IS NULL`),
      desc(webPushSubscriptions.updatedAt),
      desc(webPushSubscriptions.id),
    )
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    revision: row.revision,
    active:
      row.revokedAt === null &&
      row.sessionId === actor.sessionId &&
      row.vapidKeyHash === currentKeyHash,
    endpointHash: row.endpointHash,
    preferences: pushPreferencesSchema.parse(JSON.parse(row.preferencesJson)),
  }));
}
export async function subscribePush(
  actor: PushActor,
  input: unknown,
  preferences: PushPreferences,
  revision: number,
  at = Date.now(),
) {
  const subscription = pushSubscriptionSchema.parse(input);
  const parsed = pushPreferencesSchema.parse(preferences);
  if (actor.role === "patient" && parsed.afterSessionEnabled)
    throw new Error("push_invalid");
  const configuration = await pushConfiguration();
  if (!configuration) throw new Error("push_unavailable");
  // Length alone does not establish an on-curve P-256 public key.
  await crypto.subtle.importKey(
    "raw",
    decodeBase64url(subscription.keys.p256dh, 65),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const hash = await pushDigest(subscription.endpoint);
  const [old] = await db
    .select()
    .from(webPushSubscriptions)
    .where(eq(webPushSubscriptions.endpointHash, hash))
    .limit(1);
  if (old && (old.userId !== actor.userId || old.role !== actor.role))
    throw new Error("push_conflict");
  const id = old?.id || crypto.randomUUID();
  const sealed = await sealPushSubscription(
    JSON.stringify(subscription),
    actor.userId,
    actor.role,
    id,
  );
  const keyHash = await pushDigest(configuration.publicKey);
  const rows = await db.values<
    [string, number]
  >(sql`INSERT INTO web_push_subscriptions(id,user_id,role,session_id,endpoint_hash,sealed_subscription,vapid_key_hash,preferences_json,revision,consent_at,created_at,updated_at,revoked_at)
 SELECT ${id},u.id,${actor.role},${actor.sessionId},${hash},${sealed},${keyHash},${JSON.stringify(parsed)},1,${at},${at},${at},NULL
 FROM user u WHERE ${eligiblePushActor(actor, at)}
 AND ((${revision}=0 AND NOT EXISTS(SELECT 1 FROM web_push_subscriptions w WHERE w.endpoint_hash=${hash}))
 OR EXISTS(SELECT 1 FROM web_push_subscriptions w WHERE w.endpoint_hash=${hash} AND w.user_id=u.id AND w.role=${actor.role} AND w.revision=${revision}))
 AND (SELECT count(*) FROM web_push_subscriptions w WHERE w.user_id=u.id AND w.revoked_at IS NULL AND w.vapid_key_hash=${keyHash} AND w.endpoint_hash!=${hash}) < 5
 ON CONFLICT(endpoint_hash) DO UPDATE SET session_id=excluded.session_id,sealed_subscription=excluded.sealed_subscription,vapid_key_hash=excluded.vapid_key_hash,preferences_json=excluded.preferences_json,
 revision=web_push_subscriptions.revision+1,consent_at=excluded.consent_at,updated_at=excluded.updated_at,revoked_at=NULL
 WHERE web_push_subscriptions.user_id=${actor.userId} AND web_push_subscriptions.role=${actor.role} AND web_push_subscriptions.revision=${revision} RETURNING id,revision`);
  if (!rows.length) throw new Error("push_conflict");
  return { id: rows[0][0], revision: rows[0][1] };
}
export async function updatePushPreferences(
  actor: PushActor,
  id: string,
  revision: number,
  input: unknown,
  at = Date.now(),
) {
  const preferences = pushPreferencesSchema.parse(input);
  if (actor.role === "patient" && preferences.afterSessionEnabled)
    throw new Error("push_invalid");
  const rows =
    await db.values(sql`UPDATE web_push_subscriptions SET preferences_json=${JSON.stringify(preferences)},revision=revision+1,consent_at=${at},updated_at=${at}
 WHERE id=${id} AND user_id=${actor.userId} AND role=${actor.role} AND session_id=${actor.sessionId} AND revoked_at IS NULL AND revision=${revision}
 AND EXISTS(SELECT 1 FROM user u WHERE ${eligiblePushActor(actor, at)}) RETURNING revision`);
  if (!rows.length) throw new Error("push_conflict");
}
/** Baja siempre posible, aunque falte proveedor o se haya suspendido el perfil. */
export async function revokePush(
  actor: PushActor,
  id?: string,
  at = Date.now(),
) {
  await db.run(sql`UPDATE web_push_subscriptions SET sealed_subscription=NULL,session_id=NULL,revoked_at=${at},revision=revision+1,updated_at=${at}
 WHERE user_id=${actor.userId} AND role=${actor.role} ${id ? sql`AND id=${id}` : sql``}
 AND EXISTS(SELECT 1 FROM user u WHERE ${verifiedPushAccount(actor, at)})`);
  await db.run(sql`UPDATE web_push_deliveries SET status='skipped',reason_code='revoked',claim_token=NULL,lease_until=NULL,updated_at=${at}
 WHERE subscription_id IN(SELECT id FROM web_push_subscriptions WHERE user_id=${actor.userId} AND role=${actor.role} AND revoked_at IS NOT NULL) AND status IN('pending','sending')
 AND EXISTS(SELECT 1 FROM user u WHERE ${verifiedPushAccount(actor, at)})`);
}
/** Invoke from the existing verified account-deletion flow before deleting user. */
export function pushAccountDeleteStatements(userId: string) {
  return [
    db
      .delete(webPushDeliveries)
      .where(
        sql`subscription_id IN(SELECT id FROM web_push_subscriptions WHERE user_id=${userId})`,
      ),
    db
      .delete(webPushSubscriptions)
      .where(eq(webPushSubscriptions.userId, userId)),
  ] as const;
}
export async function purgePushForAccount(userId: string) {
  await db.batch([...pushAccountDeleteStatements(userId)]);
}
