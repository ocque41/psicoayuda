import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PatientOnboarding } from "@/components/onboarding/patient-onboarding";
import { getServerSession } from "@/lib/auth-server";
import { readOnboardingDraft } from "@/lib/onboarding/drafts";
import { patientAccountForUser } from "@/lib/patient/accounts";

export const metadata: Metadata = {
  title: "Prepara tu espacio de acompañamiento",
  robots: { index: false, follow: false },
};

export default async function PatientStartPage() {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/entrar?modo=registro");
  const [account, draft] = await Promise.all([
    patientAccountForUser(session.user.id),
    readOnboardingDraft(session.user.id, "patient"),
  ]);
  if (account?.onboardingCompletedAt) redirect("/mi");
  return (
    <section className="section">
      <div className="container">
        <PatientOnboarding
          key={session.user.id}
          ownerId={session.user.id}
          initial={draft}
          defaultName={session.user.name ?? ""}
        />
      </div>
    </section>
  );
}
