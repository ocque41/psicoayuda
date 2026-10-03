import "server-only";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { patientAccounts } from "@/db/patient-schema";
import {
  practiceAppointments,
  practicePatients,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";

export type CalendarAudience = "pro" | "patient";
export type CalendarActor = {
  userId: string;
  audience: CalendarAudience;
  professionalId?: string;
  timeZone: string;
};
export function calendarAudience(value: unknown): CalendarAudience | null {
  return value === "pro" || value === "patient" ? value : null;
}
/** Guard compartido para escrituras OAuth; la elegibilidad se comprueba dentro de la sentencia. */
export function calendarActorPermission(
  userId: string,
  audience: CalendarAudience,
) {
  return audience === "pro"
    ? sql`EXISTS (SELECT 1 FROM professionals p JOIN user u ON u.id=p.user_id WHERE u.id=${userId} AND u.email_verified=1 AND p.status='approved' AND p.non_clinical_helper=0)`
    : sql`EXISTS (SELECT 1 FROM patient_accounts a JOIN user u ON u.id=a.user_id WHERE u.id=${userId} AND u.email_verified=1 AND a.deletion_state='active' AND a.onboarding_completed_at IS NOT NULL)`;
}
export async function loadCalendarActor(
  userId: string,
  audience: CalendarAudience,
): Promise<CalendarActor | null> {
  if (audience === "pro") {
    const [row] = await db
      .select({
        professionalId: professionals.id,
        timeZone: practiceSettings.timeZone,
      })
      .from(professionals)
      .innerJoin(user, eq(user.id, professionals.userId))
      .leftJoin(
        practiceSettings,
        eq(practiceSettings.professionalId, professionals.id),
      )
      .where(
        and(
          eq(user.id, userId),
          eq(user.emailVerified, true),
          eq(professionals.status, "approved"),
          eq(professionals.nonClinicalHelper, false),
        ),
      )
      .limit(1);
    return row
      ? {
          userId,
          audience,
          professionalId: row.professionalId,
          timeZone: row.timeZone || "UTC",
        }
      : null;
  }
  const [row] = await db
    .select({ timeZone: patientAccounts.timezone })
    .from(patientAccounts)
    .innerJoin(user, eq(user.id, patientAccounts.userId))
    .where(
      and(
        eq(user.id, userId),
        eq(user.emailVerified, true),
        eq(patientAccounts.deletionState, "active"),
        sql`${patientAccounts.onboardingCompletedAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return row ? { userId, audience, timeZone: row.timeZone || "UTC" } : null;
}
export async function currentCalendarActor(audience: CalendarAudience) {
  const session = await getServerSession();
  return session?.user.id ? loadCalendarActor(session.user.id, audience) : null;
}
export const calendarWindow = (now = new Date()) => ({
  from: now.toISOString(),
  until: new Date(now.getTime() + 365 * 86400000).toISOString(),
});

/** Proyección mínima; se reevalúa propiedad y estado actual de la cuenta en cada consulta. */
export async function ownedCalendarAppointments(
  actor: CalendarActor,
  options: {
    after?: string;
    ids?: string[];
    limit?: number;
    upcoming?: boolean;
  } = {},
) {
  const window = calendarWindow();
  const where = and(
    actor.audience === "pro"
      ? eq(
          practiceAppointments.professionalId,
          actor.professionalId || "__no_calendar_professional__",
        )
      : undefined,
    options.after ? gt(practiceAppointments.id, options.after) : undefined,
    options.ids
      ? inArray(
          practiceAppointments.id,
          options.ids.length ? options.ids : ["__no_calendar_appointment__"],
        )
      : undefined,
    options.upcoming === false
      ? undefined
      : and(
          sql`${practicePatients.status} != 'closed'`,
          eq(practiceAppointments.status, "scheduled"),
          gt(practiceAppointments.endsAt, window.from),
          lt(practiceAppointments.startsAt, window.until),
        ),
    actor.audience === "pro"
      ? sql`EXISTS (SELECT 1 FROM professionals p JOIN user u ON u.id=p.user_id WHERE p.id=${practiceAppointments.professionalId} AND u.id=${actor.userId} AND u.email_verified=1 AND p.status='approved' AND p.non_clinical_helper=0)`
      : sql`EXISTS (SELECT 1 FROM patient_conversation_links l JOIN patient_accounts a ON a.user_id=l.user_id JOIN user u ON u.id=a.user_id JOIN conversations c ON c.id=l.conversation_id JOIN professionals p ON p.id=c.professional_id WHERE l.user_id=${actor.userId} AND l.verified_by IN ('verified_email','seeker_session') AND u.email_verified=1 AND a.deletion_state='active' AND a.onboarding_completed_at IS NOT NULL AND c.id=${practicePatients.conversationId} AND c.professional_id=${practiceAppointments.professionalId} AND c.status='open' AND c.closed_at IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND p.status='approved' AND p.non_clinical_helper=0)`,
  );
  return db
    .select({
      id: practiceAppointments.id,
      startsAt: practiceAppointments.startsAt,
      endsAt: practiceAppointments.endsAt,
      status: practiceAppointments.status,
      updatedAt: practiceAppointments.updatedAt,
      patientStatus: practicePatients.status,
    })
    .from(practiceAppointments)
    .innerJoin(
      practicePatients,
      and(
        eq(practicePatients.id, practiceAppointments.patientId),
        eq(
          practicePatients.professionalId,
          practiceAppointments.professionalId,
        ),
      ),
    )
    .where(where)
    .orderBy(asc(practiceAppointments.id))
    .limit(Math.max(1, Math.min(501, options.limit || 21)));
}
