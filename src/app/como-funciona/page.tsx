import type { Metadata } from "next";
import Link from "next/link";
import {
  PUBLIC_OPEN_GRAPH,
  PUBLIC_TWITTER,
} from "@/lib/public-social-metadata";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

const title = "Cómo funciona Nido";
const description =
  "Encuentra un profesional de psicología, inicia una conversación y acuerda el siguiente paso a tu ritmo.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/como-funciona" },
  openGraph: {
    ...PUBLIC_OPEN_GRAPH,
    type: "website",
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    title: `${title} | ${SITE_NAME}`,
    description,
    url: "/como-funciona",
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
        <h1>Un primer paso, a tu ritmo</h1>
        <p className="lead">
          Nido te ayuda a encontrar a alguien con quien hablar y continuar el
          acompañamiento de forma organizada.
        </p>
        <div className="grid grid-3">
          <article className="card">
            <h2>1. Encuentra</h2>
            <p>
              Explora áreas de apoyo, idiomas y perfiles. Si no sabes por dónde
              empezar, el orientador te ayuda a explorar opciones con unas
              preguntas breves.
            </p>
            <Link href="/profesionales">Explorar perfiles</Link>
          </article>
          <article className="card">
            <h2>2. Conversa</h2>
            <p>
              Inicia el contacto desde un perfil sin crear una cuenta. Guarda el
              enlace privado para regresar al chat y pregunta lo que necesites
              para decidir.
            </p>
          </article>
          <article className="card">
            <h2>3. Continúa</h2>
            <p>
              Acuerda con el profesional las sesiones y condiciones de atención.
              Tu profesional organiza contigo la agenda y el seguimiento.
            </p>
          </article>
        </div>
        <p>
          Si buscas otras opciones de apoyo, puedes{" "}
          <Link href="/lista-de-espera">
            anotarte en la lista general de espera
          </Link>
          . El equipo revisa las solicitudes según disponibilidad, sin garantía
          de cupo ni plazo.
        </p>
        <h2>Si buscas ayuda por el terremoto</h2>
        <p>
          Ayuda Terremoto mantiene un recorrido separado de acompañamiento
          voluntario gratuito, según disponibilidad.
        </p>
        <Link className="button secondary" href="/ayuda">
          Solicitar Ayuda Terremoto
        </Link>
        <h2>Si eres profesional</h2>
        <p>
          Crea tu perfil, completa la revisión de credenciales y organiza tu
          consulta en un espacio propio. Tú defines tus servicios y
          disponibilidad.
        </p>
        <Link className="button human" href="/para-psicologos">
          Conocer el espacio profesional
        </Link>
        <p className="safety-note">
          Nido no ofrece atención de emergencias en tiempo real. Si hay peligro
          inmediato, busca ayuda presencial o los servicios de emergencia de tu
          ubicación. <Link href="/emergencia">Ver recursos</Link>
        </p>
      </div>
    </section>
  );
}
