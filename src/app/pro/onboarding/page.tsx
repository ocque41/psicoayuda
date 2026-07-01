import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account-actions";
import { ProfessionalOnboardingForm } from "@/components/professional-onboarding-form";
import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Onboarding profesional",
  robots: { index: false, follow: false },
};

export default async function ProOnboardingPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/pro");
  // Los admins no son profesionales: no pasan por el onboarding. Como el callback
  // de login apunta aquí, este es el chokepoint que los desvía a su panel.
  if (isAdminEmail(session.user.email)) redirect("/admin");

  return (
    <section className="section">
      <div className="container">
        <h1>Onboarding profesional</h1>
        <p className="muted">
          Estos datos quedan pendientes de verificación por un coordinador.
        </p>
        <ProfessionalOnboardingForm
          email={session.user.email}
          name={session.user.name}
        />
        <AccountActions />
      </div>
    </section>
  );
}
