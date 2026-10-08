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
              Inicia el contacto desde un perfil sin crear una cuenta y pregunta
              lo que necesites para decidir. Guarda el enlace privado y el
              código de recuperación, cuando se muestre, en un lugar seguro.
            </p>
            <Link href="/preguntas-frecuentes">
              Ver cómo volver a mi conversación
            </Link>
          </article>
          <article className="card">
            <h2>3. Continúa</h2>
            <p>
              Acuerda con el profesional las sesiones y condiciones de atención.
              Tu profesional organiza contigo la agenda y el seguimiento.
            </p>
            <Link href="#acordar-cita">
              Qué preguntar antes de confirmar una cita
            </Link>
          </article>
        </div>
        <h2 id="acordar-cita" style={{ scrollMarginTop: "14rem" }}>
          Antes de confirmar una cita
        </h2>
        <p>
          Puedes llevar estas preguntas al profesional para concretar los
          detalles del encuentro:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>¿Cómo sabremos que la cita quedó confirmada?</li>
          <li>¿Por qué medio nos encontraremos y cuánto tiempo reservamos?</li>
          <li>¿Qué fecha, hora y zona horaria acordamos?</li>
          <li>
            ¿Por qué canal coordinamos cambios y en qué horario respondes?
          </li>
          <li>¿Qué hacemos si no puedo asistir o se corta la conexión?</li>
        </ul>
        <p>
          Las condiciones de cada consulta se acuerdan con el profesional. Si
          vas a recibir atención desde otro país, consulta la{" "}
          <Link href="/recursos/venezolanos-en-el-exterior">
            guía para personas en el exterior
          </Link>
          .
        </p>
        <p className="muted">
          Preguntas editoriales con elaboración asistida por IA. Fuentes
          estadounidenses consultadas el 8 de octubre de 2026: información del{" "}
          <a href="https://www.nimh.nih.gov/health/topics/psychotherapies">
            NIMH
          </a>{" "}
          sobre preguntas al profesional y preparación de citas virtuales del{" "}
          <a href="https://telehealth.hhs.gov/providers/preparing-patients-for-telehealth/helping-patients-prepare-for-their-appointment">
            HHS
          </a>
          . Preguntas adaptadas para la coordinación de la cita.
        </p>
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
