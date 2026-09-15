import type { Metadata } from "next";
import Link from "next/link";
import { FoundationContactForm } from "@/components/foundation-contact-form";
import { PartnersShowcase } from "@/components/partners-showcase";
import { WaitlistCallout } from "@/components/waitlist-callout";

export const metadata: Metadata = {
  title: "Fundaciones y organizaciones aliadas",
  description:
    "¿Representas una fundación, universidad, colegio de psicólogos u otra organización de salud mental? Déjanos tus datos para aliarte con Nido y acompañar a más personas tras el terremoto.",
  alternates: { canonical: "/alianzas" },
};

// ISR: la página es estática pero el escaparate lee aliados de D1. Sin
// revalidación, la copia prerenderizada (sin BD en build) se quedaría vacía
// hasta la siguiente edición en /admin.
export const revalidate = 60;

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

          {/* La ayuda gratuita es para las víctimas del terremoto: quien busca
              apoyo por otro motivo puede anotarse en la lista de espera o
              contactar directamente a las organizaciones del escaparate. */}
          <WaitlistCallout showAssociationsLink={false} />
        </div>
      </section>

      <PartnersShowcase />
    </>
  );
}
