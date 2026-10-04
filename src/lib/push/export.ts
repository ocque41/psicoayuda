import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { pushPreferencesSchema } from "./contract";
import { eligiblePushActor, type PushActor } from "./preferences";

/** Bounded, own patient data only. Never select subscription material. */
export async function* withPatientPushExport(
  actor: PushActor,
  source: AsyncGenerator<string>,
) {
  let tail: string | undefined;
  try {
    for await (const chunk of source) {
      if (tail !== undefined) yield tail;
      tail = chunk;
    }
    if (!tail?.endsWith("}")) throw new Error("push_export_invalid");
    yield tail.slice(0, -1);
    yield ',"pushPreferences":[';
    let cursor = "",
      first = true;
    while (true) {
      const rows = await db.values<
        [string, string, number, number, number | null]
      >(sql`SELECT w.id,w.preferences_json,w.revision,w.consent_at,w.revoked_at FROM web_push_subscriptions w
        WHERE w.user_id=${actor.userId} AND w.role='patient' AND w.id>${cursor}
        AND EXISTS(SELECT 1 FROM user u WHERE ${eligiblePushActor(actor, Date.now())}) ORDER BY w.id LIMIT 100`);
      for (const [id, preferences, revision, consentAt, revokedAt] of rows) {
        yield `${first ? "" : ","}${JSON.stringify({ id, preferences: pushPreferencesSchema.parse(JSON.parse(preferences)), revision, consentAt, revokedAt })}`;
        first = false;
      }
      if (rows.length < 100) break;
      cursor = rows[rows.length - 1][0];
    }
    yield '],"pushDeliveries":[';
    cursor = "";
    first = true;
    while (true) {
      const rows = await db.values<
        [string, string, string, string, number, number, number]
      >(sql`SELECT d.id,d.subscription_id,d.kind,d.status,d.attempts,d.created_at,d.updated_at FROM web_push_deliveries d JOIN web_push_subscriptions w ON w.id=d.subscription_id
        WHERE w.user_id=${actor.userId} AND w.role='patient' AND d.id>${cursor}
        AND EXISTS(SELECT 1 FROM user u WHERE ${eligiblePushActor(actor, Date.now())}) ORDER BY d.id LIMIT 100`);
      for (const [
        id,
        deviceId,
        kind,
        status,
        attempts,
        createdAt,
        updatedAt,
      ] of rows) {
        yield `${first ? "" : ","}${JSON.stringify({ id, deviceId, kind, status, attempts, createdAt, updatedAt })}`;
        first = false;
      }
      if (rows.length < 100) break;
      cursor = rows[rows.length - 1][0];
    }
    yield "]}";
  } finally {
    await source.return(undefined);
  }
}
