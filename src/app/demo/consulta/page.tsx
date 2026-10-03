import type { Metadata } from "next";
import { PracticeDemo } from "@/components/demo/practice-demo";

export const metadata: Metadata = {
  title: "Conoce tu consulta · Demo de Nido",
  description:
    "Explora la agenda, pacientes, notas, mensajes y cobros de Nido en una demostración guiada con datos de ejemplo.",
  robots: { index: false, follow: false },
};
export default function DemoPage() {
  return <PracticeDemo initialMonth={new Date().toISOString().slice(0, 7)} />;
}
