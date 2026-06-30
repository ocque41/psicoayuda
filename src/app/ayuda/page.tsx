import type { Metadata } from "next";
import { FeedProfessionalCard } from "@/app/profesionales/professional-card";
import { EmergencyNotice } from "@/components/emergency-notice";
import { HelpRequestForm } from "@/components/help-request-form";
import { QuickExit, QuickExitNote } from "@/components/quick-exit";
import { getFeedProfessionals } from "@/lib/feed";

export const metadata: Metadata = {
  title: "Pedir ayuda psicológica gratis",
  description:
    "Pide apoyo psicológico gratuito y confidencial en Venezuela. Escríbele a un profesional voluntario o envía tu solicitud a todos, sin crear cuenta.",
  alternates: { canonical: "/ayuda" },
  openGraph: {
    title: "Pedir ayuda psicológica gratis | Nido",
    description:
      "Escríbele a un profesional voluntario o envía tu solicitud a todos, sin crear cuenta. Una persona voluntaria te acompañará.",
    url: "/ayuda",
  },
};

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ profesional?: string; acceso?: string }>;
}) {
  const { profesional, acceso } = await searchParams;
  const professionals = await getFeedProfessionals();

  let preferred: { id: string; name: string } | null = null;
  if (profesional) {
    const found = professionals.find((person) => person.id === profesional);
    if (found) preferred = { id: found.id, name: found.name };
  }

  return (
    <section className="section">
      <QuickExit />
      <div className="container">
        <h1>Cuéntanos cómo estás. Vamos a leerte.</h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Voluntarios verificados</li>
        </ul>
        <EmergencyNotice />
        <QuickExitNote />

        {acceso === "invalido" ? (
          <div className="notice" role="alert">
            <p style={{ margin: 0 }}>
              Ese enlace de acceso ya no es válido (pudo expirar a las 72 horas
              o ya se usó). Si aún necesitas apoyo, vuelve a enviar tu solicitud
              aquí abajo y te enviaremos un enlace nuevo.
            </p>
          </div>
        ) : null}

        {professionals.length > 0 ? (
          <>
            <h2>Profesionales que pueden acompañarte</h2>
            <p className="lead">
              Estas personas voluntarias verificadas están disponibles ahora.
              Escríbele directo a quien sientas más afín, o cuéntanos un poco
              más abajo y <strong>envía tu solicitud a todas a la vez</strong> —
              responde quien pueda.
            </p>
            <div className="grid grid-2">
              {professionals.map((person) => (
                <FeedProfessionalCard key={person.id} professional={person} />
              ))}
            </div>
          </>
        ) : null}

        <h2 id="formulario">
          O cuéntanos y envía tu solicitud a varios a la vez
        </h2>
        <p className="lead">
          Completar esto toma menos de un minuto. Al terminar podrás enviar tu
          solicitud a todas las personas disponibles o elegir a quién.
        </p>
        <HelpRequestForm
          preferredProfessionalId={preferred?.id}
          preferredProfessionalName={preferred?.name}
        />
        <p className="reassurance">
          Detrás de Nido hay psicólogas y psicólogos voluntarios reales que dan
          su tiempo para acompañar a personas como tú.
        </p>
      </div>
    </section>
  );
}
