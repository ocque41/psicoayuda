import type { Metadata } from "next";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Psicólogos voluntarios: ofrece apoyo gratis",
  description:
    "¿Eres psicóloga o psicólogo? Únete como voluntario/a y ofrece apoyo psicológico gratuito y a distancia a personas en Venezuela. Tú defines tu disponibilidad.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "Psicólogos voluntarios: ofrece apoyo gratis | Nido",
    description:
      "Únete como psicólogo o psicóloga voluntaria y ofrece apoyo gratuito y a distancia a personas en Venezuela.",
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
          Si eres psicólogo/a o profesional de la salud mental, aquí puedes
          acompañar a quien más lo necesita. Atiendes en remoto, en la medida de
          tu tiempo, sin coste para nadie. Gracias por estar aquí.
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
            <GoogleSignInButton />
            <p className="hint">
              Entras con Google solo para verificar tu identidad profesional. No
              publicamos nada en tu nombre.
            </p>
            <p className="muted">
              Completar tu perfil toma unos 4 minutos. Después decides a cuántas
              personas acompañar y puedes pausar cuando quieras.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
