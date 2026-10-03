import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contactMessages,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { requirePracticeStaff } from "@/lib/practice/staff";
import { getVerifiedServerSession } from "@/lib/privileged-session";

export type SupportProfessionalActor = {
  kind: "professional";
  professionalId: string;
  userId: string;
  email: string;
  displayName: string;
  timeZone: string;
};
export type SupportStaffActor = {
  kind: "staff";
  userId: string;
  email: string;
};
export type SupportActor = SupportProfessionalActor | SupportStaffActor;

/** Pedir soporte no exige aprobación clínica ni permiso para atender pacientes. */
export async function requireSupportProfessional(): Promise<SupportProfessionalActor | null> {
  const session = await getServerSession();
  if (!session?.user.id) return null;
  const [actor] = await db
    .select({
      professionalId: professionals.id,
      userId: user.id,
      email: user.email,
      displayName: professionals.displayName,
      fullName: professionals.fullName,
      timeZone: practiceSettings.timeZone,
    })
    .from(professionals)
    .innerJoin(user, eq(user.id, professionals.userId))
    .leftJoin(
      practiceSettings,
      eq(practiceSettings.professionalId, professionals.id),
    )
    .where(
      and(eq(user.id, session.user.id), ne(professionals.status, "deleting")),
    )
    .limit(1);
  return actor
    ? {
        kind: "professional",
        professionalId: actor.professionalId,
        userId: actor.userId,
        email: actor.email,
        displayName: actor.displayName || actor.fullName,
        timeZone: actor.timeZone || "America/Caracas",
      }
    : null;
}

export async function requireSupportStaff(): Promise<SupportStaffActor | null> {
  const staff = await requirePracticeStaff("support");
  if (!staff) return null;
  const session = await getVerifiedServerSession();
  if (!session || session.user.email.toLowerCase() !== staff.email) return null;
  return { kind: "staff", userId: session.user.id, email: staff.email };
}

function supportEmailAllowed(email: string) {
  return (
    isAdminEmail(email) ||
    (process.env.SUPPORT_EMAILS || "")
      .split(",")
      .some((allowed) => allowed.trim().toLowerCase() === email.toLowerCase())
  );
}

/** La identidad y el dueño se vuelven a comprobar dentro de cada lectura/escritura. */
export function supportTicketScope(actor: SupportActor) {
  if (actor.kind === "professional")
    return sql`${contactMessages.source} = 'professional_dashboard'
      AND ${contactMessages.professionalId} = ${actor.professionalId}
      AND EXISTS (SELECT 1 FROM professionals AS support_pro
        JOIN user AS support_user ON support_user.id = support_pro.user_id
        WHERE support_pro.id = ${contactMessages.professionalId}
          AND support_pro.user_id = ${actor.userId} AND support_pro.status <> 'deleting'
          AND lower(support_user.email) = lower(${actor.email}))`;
  if (!supportEmailAllowed(actor.email)) return sql`0 = 1`;
  return sql`EXISTS (SELECT 1 FROM user AS support_user
    WHERE support_user.id = ${actor.userId} AND support_user.email_verified = 1
      AND lower(support_user.email) = lower(${actor.email}))`;
}
