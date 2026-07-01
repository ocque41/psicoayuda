import type { Metadata } from "next";
import Link from "next/link";
import { AlliedResources } from "@/components/allied-resources";
import { SeismicFeed } from "@/components/seismic-feed";
import { DAMAGE_MAP } from "@/lib/allied-resources";

// La página es estática + ISR: el feed sísmico se revalida cada 5 minutos.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Terremoto en Venezuela: sismos en vivo y ayuda",
  description:
    "Sismos recientes en Venezuela en vivo (USGS) y plataformas de ayuda tras el terremoto: buscar personas, refugios, hospitales, rescate y apoyo psicológico.",
  alternates: { canonical: "/situacion" },
};

export default function SituacionPage() {
  return (
    <section className="section">
      <div className="container">
        <h1>Situación del terremoto en Venezuela</h1>

        <div className="notice" role="note">
          <span aria-hidden="true">⚠️</span>
          <span>
            <strong>No entres a estructuras dañadas.</strong> Si hay peligro
            inmediato, llama a emergencias locales (911). Esta información
            complementa, no reemplaza, a las autoridades oficiales.
          </span>
        </div>

        <p className="lead">
          Reunimos fuentes en vivo y plataformas de ayuda para que encuentres lo
          que necesitas en un solo lugar. Nido es el espacio de apoyo
          psicológico de esta red.
        </p>

        <SeismicFeed />

        <section className="card">
          <h2>Mapa de daños</h2>
          <p>{DAMAGE_MAP.description}</p>
          <p>
            <a
              className="button secondary"
              href={DAMAGE_MAP.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir el mapa de daños ↗
            </a>
          </p>
        </section>

        <AlliedResources />

        <p className="reassurance">
          Si todo esto te supera, también está bien pedir apoyo emocional.{" "}
          <Link href="/ayuda">Cuéntanos cómo estás</Link> y una persona
          voluntaria te acompaña.
        </p>
      </div>
    </section>
  );
}
