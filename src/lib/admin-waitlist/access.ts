import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getVerifiedServerSession } from "@/lib/privileged-session";
import type { WaitlistAdmin } from "./types";

// Admisión no concede acceso a datos de personas que piden apoyo.
export function currentWaitlistAdmin(actor: WaitlistAdmin) {
  if (!actor.sessionId || !isAdminEmail(actor.email)) return sql`0`;
  return sql`EXISTS (SELECT 1 FROM user account JOIN session live_session ON live_session.user_id=account.id
    WHERE account.id=${actor.userId} AND lower(account.email)=${actor.email.trim().toLowerCase()}
      AND account.email_verified=1 AND live_session.id=${actor.sessionId}
      AND live_session.expires_at > cast(unixepoch('subsecond') * 1000 as integer))`;
}

export async function isWaitlistAdminLive(actor: WaitlistAdmin) {
  const [live] = await db
    .select({ id: user.id })
    .from(user)
    .where(currentWaitlistAdmin(actor))
    .limit(1);
  return Boolean(live);
}

export async function requireWaitlistAdmin(): Promise<WaitlistAdmin | null> {
  const session = await getVerifiedServerSession();
  const email = session?.user.email?.trim().toLowerCase();
  if (!email || !session?.session?.id || !isAdminEmail(email)) return null;
  const actor = {
    userId: session.user.id,
    email,
    sessionId: session.session.id,
  };
  return (await isWaitlistAdminLive(actor)) ? actor : null;
}
