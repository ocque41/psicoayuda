import type { Metadata } from "next";
import Link from "next/link";
import { FoundationContactForm } from "@/components/foundation-contact-form";
import { PartnersShowcase } from "@/components/partners-showcase";

export const metadata: Metadata = {
  title: "Fundaciones y organizaciones aliadas",
  description:
    "¿Representas a una fundación, universidad, colegio de psicólogos u otra organización de salud mental? Déjanos tus datos para aliarte con Nido y acompañar a más personas tras el terremoto.",
  alternates: { canonical: "/alianzas" },
};

export default function AlianzasPage() {
  return (
    <>
      <section className="section">
        <div className="container">
          <h1>Fundaciones y organizaciones aliadas</h1>
          <p className="lead">
            Si representas a una fundación, universidad, colegio de psicólogos u
            otra organización de salud mental y quieres aliarte con Nido —que
            tus profesionales se sumen como voluntarios, derivar casos o
            coordinar campañas—, déjanos tus datos y te escribimos.
          </p>

          <FoundationContactForm />

          <p className="reassurance">
            ¿Buscas otra cosa? Si necesitas apoyo emocional, empieza por{" "}
            <Link href="/ayuda">pedir ayuda</Link>. Si eres profesional de la
            psicología y quieres ser voluntario/a, entra por{" "}
            <Link href="/pro">el acceso para profesionales</Link>.
          </p>
        </div>
      </section>

      <PartnersShowcase />
    </>
  );
}
