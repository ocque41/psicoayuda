import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RolePicker } from "@/components/onboarding/role-picker";
import { db } from "@/db";
import { accountRolePreferences, professionals } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { patientAccountForUser } from "@/lib/patient/accounts";
import { requirePracticeStaff } from "@/lib/practice/staff";

export const metadata: Metadata = {
  title: "Tu espacio en Nido",
  robots: { index: false, follow: false },
};

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ cambiar?: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/entrar");
  if (await requireAdmin()) redirect("/admin");
  if (
    (await requirePracticeStaff("support")) ||
    (await requirePracticeStaff("credentials"))
  )
    redirect("/admin/operaciones");
  const params = await searchParams;
  if (params.cambiar !== "1") {
    const [preferences, patient, pro] = await Promise.all([
      db
        .select()
        .from(accountRolePreferences)
        .where(eq(accountRolePreferences.userId, session.user.id))
        .limit(1),
      patientAccountForUser(session.user.id),
      db
        .select({
          id: professionals.id,
          status: professionals.status,
          nonClinicalHelper: professionals.nonClinicalHelper,
        })
        .from(professionals)
        .where(eq(professionals.userId, session.user.id))
        .limit(1),
    ]);
    if (preferences[0]?.role === "patient")
      redirect(patient?.onboardingCompletedAt ? "/mi" : "/empezar/paciente");
    if (preferences[0]?.role === "pro" || pro[0])
      redirect(
        pro[0]
          ? pro[0].status === "approved" && !pro[0].nonClinicalHelper
            ? "/pro/consulta"
            : "/pro/dashboard"
          : "/pro/onboarding",
      );
    if (patient?.onboardingCompletedAt) redirect("/mi");
  }
  return (
    <section className="section">
      <div className="container">
        <RolePicker name={session.user.name || "te damos la bienvenida"} />
      </div>
    </section>
  );
}
