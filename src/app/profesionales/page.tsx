import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmergencyNotice } from "@/components/emergency-notice";
import {
  DirectoryItemListJsonLd,
  DirectoryJsonLd,
} from "@/components/structured-data";
import { SupportDirectory } from "@/components/support-directory";
import { getFeedProfessionals } from "@/lib/feed";
import { publishedOrganizations } from "@/lib/organizations";
import { getPublishedPartners, partnersToOrganizations } from "@/lib/partners";

// Dinámica: lee los filtros de la URL (?q/?tipo/?tema/?disp) en el servidor para
// que el primer render ya salga filtrado (enlace compartible/indexable, sin
// parpadeo ni spinner). La lista pública es pequeña y la consulta a D1 es ligera.
// El `canonical` fijo evita que los buscadores indexen las variantes con filtros.

export const metadata: Metadata = {
  title: "Psicólogas y psicólogos voluntarios en Venezuela",
  description:
    "Psicólogas y psicólogos voluntarios verificados en Venezuela. Busca por cómo te sientes, especialidad o nombre y elige con quién hablar. Gratis y a distancia.",
  alternates: { canonical: "/profesionales" },
  openGraph: {
    title: "Psicólogas y psicólogos voluntarios en Venezuela | Nido",
    description:
      "Psicólogas y psicólogos voluntarios verificados en Venezuela. Busca por cómo te sientes, especialidad o nombre y elige con quién hablar. Gratis y a distancia.",
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
  }>;
}) {
  const { q, tipo, tema, disp } = await searchParams;
  const professionals = await getFeedProfessionals();
  const organizations = [
    ...publishedOrganizations,
    ...partnersToOrganizations(await getPublishedPartners()),
  ];
  const initialFilters = {
    q,
    type: tipo,
    topic: tema,
    onlyAvailable: disp === "1",
  };
  // Nombres públicos ya visibles en la página, para el ItemList (SEO). Solo
  // nombre (sin contacto ni ubicación), coherente con el criterio de privacidad.
  const itemNames = [
    ...professionals.map((professional) => professional.name),
    ...organizations.map((organization) => organization.name),
  ];

  return (
    <section className="section">
      <div className="container">
        <Breadcrumbs
          trail={[{ name: "Psicólogos voluntarios", path: "/profesionales" }]}
        />
        <DirectoryJsonLd />
        <DirectoryItemListJsonLd path="/profesionales" names={itemNames} />
        <h1>
          Psicólogas y psicólogos voluntarios en Venezuela, listos para
          acompañarte
        </h1>
        <ul className="trust-strip" aria-label="Garantías">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta</li>
          <li>Verificados</li>
        </ul>
        <p className="lead">
          Psicólogas y psicólogos voluntarios —y también auxiliares no clínicos
          y organizaciones aliadas— que dan su tiempo para acompañarte, a
          distancia. Busca por cómo te sientes, por especialidad o servicio, o
          por nombre; filtra por tipo de apoyo y elige a quien sientas más afín.
          Y si prefieres no elegir, deja tu mensaje y le llega a todo el equipo.
        </p>
        <EmergencyNotice />

        <SupportDirectory
          professionals={professionals}
          organizations={organizations}
          initialFilters={initialFilters}
        />
      </div>
    </section>
  );
}
