import type { Metadata } from "next";
import Link from "next/link";
import { FocusHeading } from "@/components/focus-heading";
import { ProfessionalCard } from "@/components/professional-card";
import { suggestProfessionalsForRequest } from "@/lib/matching";

export const metadata: Metadata = {
  title: "Recibimos tu mensaje",
  robots: { index: false, follow: true },
};

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ solicitud?: string }>;
}) {
  const params = await searchParams;
  const suggestions = params.solicitud
    ? await suggestProfessionalsForRequest(params.solicitud)
    : [];

  return (
    <section className="section">
      <div className="container">
        <FocusHeading>Recibimos tu mensaje. No estás solo/a.</FocusHeading>

        <h2>Qué sigue ahora</h2>
        <ol className="steps">
          <li>Tu mensaje ya llegó a nuestro equipo.</li>
          <li>
            Una persona voluntaria verificada revisará tu solicitud y te
            escribirá a tu correo.
          </li>
          <li>
            Suele tomar unas horas, no es inmediato; revisa también tu carpeta
            de spam.
          </li>
        </ol>
        <p className="muted">
          Somos un equipo de voluntarios, así que los tiempos de respuesta
          varían. Mientras tanto, puedes mirar nuestros{" "}
          <Link href="/recursos">recursos</Link>.
        </p>
        <p>
          ¿Prefieres elegir tú a quién hablarle?{" "}
          <Link className="button secondary" href="/profesionales">
            Ver y elegir a las personas voluntarias
          </Link>
        </p>

        {suggestions.length ? (
          <>
            <h2>Así es el equipo voluntario que te puede acompañar</h2>
            <p className="muted">
              Te conectaremos con alguien afín a lo que necesitas. Aún no es una
              asignación.
            </p>
            <div className="grid grid-2">
              {suggestions.map(({ professional }) => (
                <ProfessionalCard
                  key={professional.id}
                  displayName={professional.displayName}
                  fullName={professional.fullName}
                  languages={professional.languages}
                  supportAreas={professional.supportAreas}
                  shortBio={professional.shortBio}
                />
              ))}
            </div>
          </>
        ) : null}

        <p className="reassurance">
          Detrás de Nido hay psicólogas y psicólogos voluntarios reales que dan
          su tiempo para acompañar a personas como tú.
        </p>
      </div>
    </section>
  );
}
