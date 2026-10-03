import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { RegistroPasos } from "@/components/registro-pasos";
import { requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Tu consulta profesional en Nido",
  description:
    "Crea tu perfil profesional, organiza tu consulta y conecta con personas que buscan apoyo psicológico en Venezuela.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "Nido para profesionales",
    description:
      "Crea tu perfil profesional, organiza pacientes y agenda, y conecta con personas que buscan apoyo psicológico.",
    url: "/pro",
  },
};

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; modo?: string }>;
}) {
  const session = await getServerSession();
  const isAdmin = Boolean(await requireAdmin());
  const { cuenta, modo } = await searchParams;
  const defaultMode = modo === "registro" ? "signup" : "signin";
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  return (
    <section className="section pro-join">
      <div className="container">
        <h1>Tu espacio para acompañar</h1>
        <p className="lead">
          Crea tu perfil, organiza tu consulta y conecta con personas que buscan
          apoyo. El equipo revisa tus credenciales antes de habilitar tu perfil.
          La ayuda voluntaria por el terremoto conserva su propio programa.
        </p>
        {cuenta === "borrada" ? (
          <p className="status-message" role="status">
            Tu cuenta se borró correctamente.
          </p>
        ) : null}
        <ul className="trust-strip" aria-label="Lo que te ofrecemos">
          <li>Tú defines tu cupo</li>
          <li>Verificamos y coordinamos por ti</li>
          <li>Tu consulta, a tu ritmo</li>
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
            <RegistroPasos actual={1} />
            <AuthPanel
              callbackURL="/empezar"
              defaultMode={defaultMode}
              googleEnabled={googleEnabled}
            />
            <p className="muted auth-foot">
              Al entrar eliges tu espacio. Para crear tu consulta, selecciona
              «Soy profesional» y completa el perfil paso a paso.
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
