import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session as authSessions, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";

/** La cookie HMAC del chat nunca sustituye una sesión BetterAuth vigente. */
export async function loadLiveChatProfessional(
  expectedProfessionalId?: string,
) {
  const current = await getServerSession();
  if (!current?.user?.id || !current.session?.id) return null;
  const expiry = new Date(current.session.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;
  const rows = await db
    .select({
      professional: professionals,
      authSessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
    })
    .from(professionals)
    .innerJoin(
      authSessions,
      and(
        eq(authSessions.userId, professionals.userId),
        eq(authSessions.id, current.session.id),
      ),
    )
    .where(
      and(
        eq(professionals.userId, current.user.id),
        eq(professionals.status, "approved"),
        gt(authSessions.expiresAt, new Date()),
        expectedProfessionalId === undefined
          ? undefined
          : eq(professionals.id, expectedProfessionalId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row && row.expiresAt.getTime() > Date.now()
    ? { ...row, userId: current.user.id, expiresAt: row.expiresAt.getTime() }
    : null;
}
