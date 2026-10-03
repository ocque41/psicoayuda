import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  googleCalendarConnections,
  googleCalendarOAuthStates,
} from "@/db/calendar-schema";
import {
  type CalendarActor,
  type CalendarAudience,
  calendarActorPermission,
  loadCalendarActor,
} from "./access";
import { GOOGLE_CALENDAR_SCOPE, googleCalendarConfig } from "./config";
import {
  calendarChallenge,
  calendarDigest,
  calendarRandom,
  openCalendarSecret,
  sealCalendarSecret,
} from "./crypto";
import { exchangeCalendarCode, revokeCalendarTokens } from "./google";

export function calendarSettingsPath(audience: CalendarAudience) {
  return audience === "pro" ? "/pro/ajustes" : "/mi/ajustes";
}
export async function beginCalendarOAuth(actor: CalendarActor) {
  const cfg = googleCalendarConfig();
  if (!cfg) throw new Error("calendar_configuration");
  const current = await db.query.googleCalendarConnections.findFirst({
    where: and(
      eq(googleCalendarConnections.userId, actor.userId),
      eq(googleCalendarConnections.audience, actor.audience),
    ),
    columns: { id: true },
  });
  if (current) throw new Error("calendar_disconnect_first");
  const state = calendarRandom(),
    verifier = calendarRandom(),
    stateHash = await calendarDigest(state),
    now = new Date();
  await db
    .delete(googleCalendarOAuthStates)
    .where(
      and(
        eq(googleCalendarOAuthStates.userId, actor.userId),
        eq(googleCalendarOAuthStates.audience, actor.audience),
      ),
    );
  const verifierEnvelope = await sealCalendarSecret(
    verifier,
    "state",
    actor.userId,
    actor.audience,
    stateHash,
  );
  const inserted = await db.all(sql`INSERT INTO google_calendar_oauth_states
    (state_hash, user_id, audience, verifier_envelope, expires_at, created_at)
    SELECT ${stateHash}, ${actor.userId}, ${actor.audience}, ${verifierEnvelope}, ${new Date(now.getTime() + 600000).toISOString()}, ${now.toISOString()}
    WHERE ${calendarActorPermission(actor.userId, actor.audience)} RETURNING state_hash`);
  if (!inserted.length) throw new Error("calendar_permission_changed");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    code_challenge: await calendarChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
/** UPDATE RETURNING consume el state una sola vez y exige la misma cuenta autenticada. */
export async function consumeCalendarState(userId: string, state: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  const stateHash = await calendarDigest(state),
    now = new Date().toISOString();
  const [row] = await db
    .update(googleCalendarOAuthStates)
    .set({ consumedAt: now })
    .where(
      and(
        eq(googleCalendarOAuthStates.stateHash, stateHash),
        eq(googleCalendarOAuthStates.userId, userId),
        isNull(googleCalendarOAuthStates.consumedAt),
        gt(googleCalendarOAuthStates.expiresAt, now),
      ),
    )
    .returning();
  return row || null;
}
export async function completeCalendarOAuth(
  userId: string,
  state: string,
  code: string | null,
  denied = false,
) {
  const row = await consumeCalendarState(userId, state);
  if (!row) return { audience: null, status: "state" } as const;
  const audience = row.audience as CalendarAudience;
  if (denied || !code || code.length > 4096)
    return { audience, status: "denied" } as const;
  const actor = await loadCalendarActor(userId, audience);
  if (!actor) return { audience, status: "permission" } as const;
  const verifier = await openCalendarSecret(
    row.verifierEnvelope,
    "state",
    userId,
    audience,
    row.stateHash,
  );
  const tokens = await exchangeCalendarCode(code, verifier),
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  const envelope = await sealCalendarSecret(
    JSON.stringify(tokens),
    "token",
    userId,
    audience,
    id,
  );
  // Desconectar/purgar borra el state antes de esperar a Google. El callback
  // solo puede guardar el grant si ese mismo consentimiento sigue vigente.
  const inserted = await db.all(sql`INSERT INTO google_calendar_connections
    (id, user_id, audience, token_envelope, created_at, updated_at)
    SELECT ${id}, ${userId}, ${audience}, ${envelope}, ${now}, ${now}
    FROM google_calendar_oauth_states s
    WHERE s.state_hash=${row.stateHash} AND s.user_id=${userId}
      AND s.audience=${audience} AND s.consumed_at=${row.consumedAt}
      AND s.expires_at>${now} AND ${calendarActorPermission(userId, audience)}
    ON CONFLICT DO NOTHING RETURNING id`);
  if (!inserted.length) {
    const existing = await db.query.googleCalendarConnections.findFirst({
      where: and(
        eq(googleCalendarConnections.userId, userId),
        eq(googleCalendarConnections.audience, audience),
      ),
      columns: { id: true },
    });
    if (!existing) {
      // Revocar puede abarcar otros grants del proyecto Calendar de esta cuenta;
      // no dejamos otro espacio anunciando conexión vigente tras esa retirada.
      await db
        .update(googleCalendarConnections)
        .set({
          status: "needs_reconnect",
          errorCode: "reconnect",
          autoSync: false,
          updatedAt: now,
        })
        .where(eq(googleCalendarConnections.userId, userId));
      await revokeCalendarTokens(tokens);
    }
    return { audience, status: "state" } as const;
  }
  return { audience, status: "connected" } as const;
}
