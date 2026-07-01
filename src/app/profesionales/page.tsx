import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice } from "@/components/emergency-notice";
import { needCategories, needLabels } from "@/lib/constants";
import { getFeedProfessionals } from "@/lib/feed";
import { DirectoryFilter } from "./directory-filter";
import { FeedProfessionalCard } from "./professional-card";

// Lista pública (verificados, sin datos confidenciales): estática + ISR, se
// revalida cada 60s y se sirve desde el edge. El filtro por tema es client-side
// (ver DirectoryFilter): leer `searchParams` en el server volvía la página
// dinámica en CADA request y anulaba este `revalidate` (causa del Error 1102 /
// exceededCpu). El cache se invalida al aprobar/suspender (adminSetProfessionalStatus).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Psicólogas y psicólogos voluntarios disponibles",
  description:
    "Mira las psicólogas y psicólogos voluntarios verificados de Nido, filtra por el tema que necesitas y elige con quién hablar. Gratis, a distancia y sin crear cuenta.",
  alternates: { canonical: "/profesionales" },
};

// Temas por los que se puede filtrar (excluye "otro", poco útil como filtro).
const FILTER_AREAS = needCategories
  .filter((area) => area !== "otro")
  .map((area) => ({ key: area, label: needLabels[area] }));

export default async function ProfesionalesPage() {
  const all = await getFeedProfessionals();
  // Las tarjetas se renderizan en el servidor (SEO + coste una vez por ISR) y se
  // pasan al filtro cliente ya montadas; este solo decide cuáles se muestran.
  const entries = all.map((professional) => ({
    id: professional.id,
    areas: professional.supportAreas,
    node: (
      <FeedProfessionalCard key={professional.id} professional={professional} />
    ),
  }));

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

        {entries.length === 0 ? (
          <div className="card">
            <p>
              Aún estamos sumando voluntarios verificados. Mientras tanto,
              puedes <Link href="/ayuda">dejar tu solicitud</Link> y una persona
              del equipo te contactará por correo.
            </p>
          </div>
        ) : (
          <DirectoryFilter filters={FILTER_AREAS} entries={entries} />
        )}
      </div>
    </section>
  );
}
