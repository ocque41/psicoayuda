import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Voluntariado de psicólogos y fundaciones en Venezuela",
  description:
    "¿Eres psicóloga, psicólogo o fundación de salud mental? Únete como voluntario/a y ofrece apoyo gratuito y a distancia en Venezuela. Tú defines tu cupo.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "Psicólogos voluntarios y fundaciones: ayuda gratis | Nido",
    description:
      "Súmate como psicólogo, psicóloga o fundación voluntaria y ofrece apoyo gratuito y a distancia a personas en Venezuela tras el terremoto.",
    url: "/pro",
  },
};

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const session = await getServerSession();
  const isAdmin = isAdminEmail(session?.user?.email);
  const { modo } = await searchParams;
  const defaultMode = modo === "registro" ? "signup" : "signin";
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  return (
    <section className="section pro-join">
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
          isAdmin ? (
            <p>
              <Link className="button human" href="/admin">
                Ir al panel de administración
              </Link>
            </p>
          ) : (
            <p>
              <Link className="button human" href="/pro/onboarding">
                Continuar mi perfil
              </Link>{" "}
              <Link className="button secondary" href="/pro/dashboard">
                Ver mi panel
              </Link>
            </p>
          )
        ) : (
          <div className="signin">
            <AuthPanel
              defaultMode={defaultMode}
              googleEnabled={googleEnabled}
            />
            <p className="muted auth-foot">
              Entras solo para crear tu perfil profesional; no publicamos nada
              en tu nombre. Completar tu perfil toma unos 4 minutos.
            </p>
          </div>
        )}
        <div className="org-cta">
          <h2>¿Representas a una fundación u organización?</h2>
          <p>
            Aliémonos para llegar a más personas. Tus profesionales pueden
            registrarse arriba; para coordinar una alianza, déjanos tus datos.
          </p>
          <Link className="button" href="/alianzas">
            Coordinar una alianza
          </Link>
        </div>
      </div>
    </section>
  );
}
