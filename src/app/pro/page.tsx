import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Voluntariado: psicólogos y fundaciones que quieren ayudar",
  description:
    "¿Eres psicóloga, psicólogo o una fundación de salud mental? Únete como voluntario/a y ofrece apoyo psicológico gratuito y a distancia a personas afectadas por el terremoto en Venezuela. Tú defines tu disponibilidad.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "Psicólogos voluntarios y fundaciones: ayuda gratis | Nido",
    description:
      "Súmate como psicólogo, psicóloga o fundación voluntaria y ofrece apoyo gratuito y a distancia a personas en Venezuela tras el terremoto.",
    url: "/pro",
  },
};

export default async function ProPage() {
  const session = await getServerSession();

  return (
    <section className="section">
      <div className="container">
        <h1>Este es tu lugar para ayudar</h1>
        <p className="lead">
          Si eres psicóloga o psicólogo, aquí puedes acompañar a quien más lo
          necesita tras el terremoto: en remoto, en la medida de tu tiempo, sin
          coste para nadie. Y si representas a una fundación u organización de
          salud mental, también queremos sumarte. Gracias por estar aquí.
        </p>
        <ul className="trust-strip" aria-label="Lo que te ofrecemos">
          <li>Tú defines tu cupo</li>
          <li>Verificamos y coordinamos por ti</li>
          <li>100% remoto y voluntario</li>
        </ul>
        {session?.user ? (
          <p>
            <Link className="button human" href="/pro/onboarding">
              Continuar mi perfil
            </Link>{" "}
            <Link className="button secondary" href="/pro/dashboard">
              Ver mi panel
            </Link>
          </p>
        ) : (
          <div className="signin">
            <AuthPanel />
            <p className="muted auth-foot">
              Entras solo para verificar tu identidad profesional; no publicamos
              nada en tu nombre. Completar tu perfil toma unos 4 minutos.
            </p>
          </div>
        )}
        <div className="notice" style={{ marginTop: "var(--space-8)" }}>
          <p style={{ margin: 0 }}>
            <strong>¿Eres una fundación u organización de salud mental?</strong>{" "}
            Aliémonos para llegar a más personas. Tus profesionales pueden
            registrarse aquí, y si quieres coordinar una alianza,{" "}
            <Link href="/contacto">escríbenos</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
