import { redirect } from "next/navigation";
import { ProfessionalOnboardingForm } from "@/components/professional-onboarding-form";
import { getServerSession } from "@/lib/auth-server";

export default async function ProOnboardingPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/pro");

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
      </div>
    </section>
  );
}
