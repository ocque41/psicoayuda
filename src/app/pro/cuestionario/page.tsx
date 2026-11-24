import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScreeningWizard } from "@/components/screening/screening-wizard";
import { publicScreeningQuestions } from "@/lib/screening/scoring";
import {
  currentScreeningCandidate,
  readScreening,
} from "@/lib/screening/store";

export const metadata: Metadata = {
  title: "Cuestionario clínico",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ScreeningPage() {
  const pro = await currentScreeningCandidate();
  if (!pro) redirect("/pro");
  // Toda solicitud pendiente, clínica o de apoyo voluntario, lo responde: es
  // la segunda parte de la solicitud que revisa Admisión.
  if (pro.status !== "pending_verification") redirect("/pro/dashboard");
  const screening = await readScreening(pro.id);
  if (screening?.submittedAt) redirect("/pro/dashboard");
  return (
    <section className="section">
      <div className="container">
        <ScreeningWizard
          questions={publicScreeningQuestions(pro.id)}
          initialAnswers={screening?.answers ?? {}}
          initialExclusions={screening?.exclusions ?? ""}
        />
      </div>
    </section>
  );
}
