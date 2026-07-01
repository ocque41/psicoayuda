import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmergencyNotice } from "@/components/emergency-notice";
import { DirectoryJsonLd } from "@/components/structured-data";
import { getFeedProfessionals } from "@/lib/feed";
import { ProfessionalDirectory } from "./professional-directory";

// Lista pública (verificados, sin datos confidenciales): se cachea en el edge y
// se revalida cada 60s. El filtrado (nombre/especialidad/disponibilidad) ocurre
// en el cliente sobre esta lista, así que la página sigue siendo ISR.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Psicólogas y psicólogos voluntarios en Venezuela",
  description:
    "Psicólogas y psicólogos voluntarios verificados en Venezuela. Busca por cómo te sientes, especialidad o nombre y elige con quién hablar. Gratis y a distancia.",
  alternates: { canonical: "/profesionales" },
};

export default async function ProfesionalesPage() {
  const professionals = await getFeedProfessionals();

  return (
    <section className="section">
      <div className="container">
        <Breadcrumbs
          trail={[{ name: "Psicólogos voluntarios", path: "/profesionales" }]}
        />
        <DirectoryJsonLd />
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
          Estas psicólogas y psicólogos dan su tiempo para acompañarte, a
          distancia. Busca por cómo te sientes, por especialidad o por nombre,
          elige a quien sientas más afín y pídele apoyo. Y si prefieres no
          elegir, deja tu mensaje y le llega a todo el equipo.
        </p>
        <EmergencyNotice />

        <ProfessionalDirectory professionals={professionals} />
      </div>
    </section>
  );
}
