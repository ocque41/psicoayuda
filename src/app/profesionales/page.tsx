import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice } from "@/components/emergency-notice";
import { needCategories, needLabels } from "@/lib/constants";
import { getFeedProfessionals } from "@/lib/feed";
import { FeedProfessionalCard } from "./professional-card";

// Lista pública (verificados, sin datos confidenciales): se cachea en el edge y
// se revalida cada 60s. Mucho mejor TTFB/LCP en móvil que renderizar por request.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Psicólogas y psicólogos voluntarios disponibles",
  description:
    "Mira las psicólogas y psicólogos voluntarios verificados de Nido, filtra por el tema que necesitas y elige con quién hablar. Gratis, a distancia y sin crear cuenta.",
  alternates: { canonical: "/profesionales" },
};

// Temas por los que se puede filtrar (excluye "otro", poco útil como filtro).
const FILTER_AREAS = needCategories.filter((area) => area !== "otro");

export default async function ProfesionalesPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const { area } = await searchParams;
  const activeArea =
    area && (needCategories as readonly string[]).includes(area) ? area : null;

  const all = await getFeedProfessionals();
  const professionals = activeArea
    ? all.filter((professional) =>
        professional.supportAreas.includes(activeArea),
      )
    : all;

  return (
    <section className="section">
      <div className="container">
        <h1>Personas voluntarias listas para acompañarte</h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Verificados</li>
        </ul>
        <p className="lead">
          Estas psicólogas y psicólogos dan su tiempo para acompañarte, a
          distancia. Mira sus áreas, elige a quien sientas más afín y pídele
          apoyo. Y si prefieres no elegir, deja tu mensaje y le llega a todo el
          equipo.
        </p>
        <EmergencyNotice />

        {all.length > 0 ? (
          <nav
            className="pro-filters"
            aria-label="Filtrar por tema"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              margin: "0 0 var(--space-6)",
            }}
          >
            <Link
              className={activeArea ? "button secondary" : "button"}
              href="/profesionales"
            >
              Todas
            </Link>
            {FILTER_AREAS.map((areaKey) => (
              <Link
                key={areaKey}
                className={
                  activeArea === areaKey ? "button" : "button secondary"
                }
                href={`/profesionales?area=${areaKey}`}
              >
                {needLabels[areaKey]}
              </Link>
            ))}
          </nav>
        ) : null}

        {professionals.length === 0 ? (
          <div className="card">
            {activeArea ? (
              <p>
                Ahora mismo no hay voluntarios disponibles en “
                {needLabels[activeArea as keyof typeof needLabels]}”.{" "}
                <Link href="/profesionales">Ver todas las personas</Link> o{" "}
                <Link href="/ayuda">deja tu solicitud</Link> y te conectamos con
                alguien afín.
              </p>
            ) : (
              <p>
                Aún estamos sumando voluntarios verificados. Mientras tanto,
                puedes <Link href="/ayuda">dejar tu solicitud</Link> y una
                persona del equipo te contactará por correo.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="muted">
              {professionals.length}{" "}
              {professionals.length === 1
                ? "persona disponible"
                : "personas disponibles"}
              {activeArea
                ? ` en “${needLabels[activeArea as keyof typeof needLabels]}”`
                : ""}
              .
            </p>
            <div className="grid grid-2">
              {professionals.map((professional) => (
                <FeedProfessionalCard
                  key={professional.id}
                  professional={professional}
                />
              ))}
            </div>
            <p className="reassurance">
              ¿Prefieres que te conectemos sin elegir? Deja tu mensaje en{" "}
              <Link href="/ayuda">pedir apoyo</Link> y le llega a todo el equipo
              voluntario.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
