import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmergencyNotice } from "@/components/emergency-notice";
import { DirectoryJsonLd } from "@/components/structured-data";
import { SupportDirectory } from "@/components/support-directory";
import { getCachedFeedProfessionals } from "@/lib/feed";
import { publishedOrganizations } from "@/lib/organizations";
import {
  getCachedPublishedPartners,
  partnersToOrganizations,
} from "@/lib/partners";

// Dinámica: lee los filtros de la URL (?q/?tipo/?tema/?disp) en el servidor para
// que el primer render ya salga filtrado (enlace compartible/indexable, sin
// parpadeo ni spinner). La lista pública es pequeña y la consulta a D1 es ligera.
// El `canonical` fijo identifica la URL preferida de las variantes con filtros.

export const metadata: Metadata = {
  title: "Psicólogas y psicólogos en Venezuela",
  description:
    "Encuentra profesionales de psicología con perfiles revisados. Busca por lo que necesitas, especialidad o nombre y elige con quién hablar.",
  alternates: { canonical: "/profesionales" },
  openGraph: {
    title: "Psicólogas y psicólogos en Venezuela | Nido",
    description:
      "Encuentra profesionales de psicología con perfiles revisados. Busca por lo que necesitas, especialidad o nombre y elige con quién hablar.",
    url: "/profesionales",
  },
};

export default async function ProfesionalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tipo?: string;
    tema?: string;
    disp?: string;
    pago?: string;
  }>;
}) {
  const { q, tipo, tema, disp, pago } = await searchParams;
  const professionals = await getCachedFeedProfessionals();
  const organizations = [
    ...publishedOrganizations,
    ...partnersToOrganizations(await getCachedPublishedPartners()),
  ];
  const initialFilters = {
    q,
    type: tipo,
    topic: tema,
    onlyAvailable: disp === "1",
    paid: pago === "1",
  };
  return (
    <section className="section">
      <div className="container">
        <Breadcrumbs trail={[{ name: "Psicólogos", path: "/profesionales" }]} />
        <DirectoryJsonLd />
        <h1>Psicólogas y psicólogos en Venezuela, listos para acompañarte</h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>A tu ritmo</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Perfiles revisados</li>
        </ul>
        <p className="lead">
          Busca por lo que necesitas, por especialidad o por nombre. Conoce los
          perfiles, elige con quién hablar y acuerda con esa persona cómo
          comenzar.
        </p>
        <p>
          <Link className="button secondary" href="/orientacion">
            No sé a quién elegir
          </Link>
        </p>
        <EmergencyNotice />

        <SupportDirectory
          itemListPath="/profesionales"
          professionals={professionals}
          organizations={organizations}
          initialFilters={initialFilters}
        />
      </div>
    </section>
  );
}
