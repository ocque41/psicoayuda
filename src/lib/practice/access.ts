import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { practicePatients, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";

export async function requirePracticeProfessional() {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/pro");
  const pro = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.userId, session.user.id),
      eq(professionals.status, "approved"),
    ),
    columns: {
      id: true,
      userId: true,
      email: true,
      displayName: true,
      fullName: true,
      nonClinicalHelper: true,
      country: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    },
  });
  if (!pro || pro.nonClinicalHelper || !pro.userId) redirect("/pro/dashboard");
  return { ...pro, userId: pro.userId };
}
export async function ownedPatient(patientId: string, professionalId: string) {
  return db.query.practicePatients.findFirst({
    where: and(
      eq(practicePatients.id, patientId),
      eq(practicePatients.professionalId, professionalId),
    ),
  });
}
/** Permite gestionar cobros propios incluso al suspender la atención clínica. */
export async function requirePracticeBillingProfessional() {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/entrar");
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
    columns: { id: true, email: true, status: true, fullName: true },
  });
  if (!pro) redirect("/empezar");
  return pro;
}
