import type { Metadata } from "next";
import Link from "next/link";
import {
  PUBLIC_OPEN_GRAPH,
  PUBLIC_TWITTER,
} from "@/lib/public-social-metadata";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

const title = "Transparencia e impacto";
const description =
  "Cómo Nido separa la consulta profesional y Ayuda Terremoto, cuida los datos y mide su impacto.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/transparencia" },
  openGraph: {
    ...PUBLIC_OPEN_GRAPH,
    type: "website",
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    title: `${title} | ${SITE_NAME}`,
    description,
    url: "/transparencia",
  },
  twitter: {
    ...PUBLIC_TWITTER,
    card: "summary_large_image",
    title: `${title} | ${SITE_NAME}`,
    description,
  },
};
export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>Transparencia e impacto</h1>
        <p className="lead">
          Queremos que entiendas qué ofrece Nido y qué puedes esperar al usarlo.
        </p>
        <article className="card">
          <h2>Dos recorridos claros</h2>
          <p>
            La consulta profesional permite encontrar a un psicólogo y organizar
            el acompañamiento acordado con él. Ayuda Terremoto mantiene un
            programa separado de apoyo voluntario gratuito, según
            disponibilidad.
          </p>
        </article>
        <article className="card">
          <h2>Condiciones antes de decidir</h2>
          <p>
            El profesional acuerda contigo el alcance de su atención y las
            condiciones de los encuentros. El espacio profesional tiene
            herramientas para organizar la consulta y sus propias condiciones de
            uso.
          </p>
        </article>
        <article className="card">
          <h2>Impacto con datos reales</h2>
          <p>
            No publicamos cifras de personas atendidas sin confirmación. Los
            informes de actividad se elaboran de forma agregada y evitando que
            permitan identificar a una persona.
          </p>
        </article>
        <article className="card">
          <h2>Privacidad y límites</h2>
          <p>
            El equipo revisa credenciales y atiende dudas de la plataforma. Nido
            no garantiza disponibilidad inmediata y no ofrece atención de
            emergencias en tiempo real.
          </p>
          <Link href="/privacidad">Cómo cuidamos tus datos</Link> ·{" "}
          <Link href="/seguridad">Cómo revisamos los perfiles</Link>
        </article>
        <p>
          <Link className="button secondary" href="/contacto">
            Contactar al equipo
          </Link>
        </p>
      </div>
    </section>
  );
}
