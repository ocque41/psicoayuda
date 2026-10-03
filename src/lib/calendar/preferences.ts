import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { googleCalendarConnections as connections } from "@/db/calendar-schema";
import { type CalendarAudience, calendarActorPermission } from "./access";

/** CAS evita que una pestaña antigua vuelva a activar permisos retirados. */
export async function saveCalendarPreferences(
  userId: string,
  audience: CalendarAudience,
  revision: number,
  preferences: { googleReminders: boolean; autoSync: boolean },
) {
  if (!Number.isSafeInteger(revision) || revision < 0) return false;
  const changed = await db
    .update(connections)
    .set({
      ...preferences,
      preferencesRevision: sql`${connections.preferencesRevision} + 1`,
      syncCursor: null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(connections.userId, userId),
        eq(connections.audience, audience),
        eq(connections.status, "connected"),
        preferences.autoSync || preferences.googleReminders
          ? calendarActorPermission(userId, audience)
          : undefined,
        eq(connections.preferencesRevision, revision),
        or(
          isNull(connections.leaseUntil),
          lt(connections.leaseUntil, new Date().toISOString()),
        ),
      ),
    )
    .returning({ id: connections.id });
  return changed.length > 0;
}
