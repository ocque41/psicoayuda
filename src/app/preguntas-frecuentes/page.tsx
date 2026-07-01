import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { FaqJsonLd } from "@/components/structured-data";
import { HOME_FAQ, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Preguntas frecuentes: ayuda psicológica en Venezuela",
  description:
    "Preguntas frecuentes sobre Nido: ayuda psicológica gratis y a distancia en Venezuela. Cómo pedir apoyo sin crear cuenta y cómo ser psicólogo voluntario.",
  alternates: { canonical: "/preguntas-frecuentes" },
  openGraph: {
    title: "Preguntas frecuentes: ayuda psicológica en Venezuela | Nido",
    description:
      "Preguntas frecuentes sobre Nido: ayuda psicológica gratis y a distancia en Venezuela. Cómo pedir apoyo sin crear cuenta y cómo ser psicólogo voluntario.",
    url: "/preguntas-frecuentes",
  },
};

const PRO_FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "¿Cómo me registro como psicólogo o psicóloga voluntaria?",
    answer:
      "Entras en la sección para profesionales con tu cuenta de Google. Con eso creas tu perfil de voluntariado y nos cuentas tu formación, tus áreas de competencia y cuánto tiempo puedes donar. No te pedimos datos de tus pacientes ni nada del trabajo que hagas fuera de Nido.",
  },
  {
    question: "¿Cómo verifican mi credencial?",
    answer:
      "La verificación es manual y la hace una persona del equipo de coordinación. Revisamos tu título y tu colegiación o registro profesional según lo que aplique en Venezuela. Hasta que esa revisión se complete, tu perfil queda en espera y no recibe solicitudes. Lo hacemos así para cuidar a quien pide ayuda.",
  },
  {
    question: "¿Cuánto tiempo toma la verificación?",
    answer:
      "Depende del volumen de solicitudes y de que los documentos estén completos y legibles. Es un proceso hecho por personas, no automático, así que puede tomar varios días. Te escribiremos al correo de tu cuenta para confirmarte o pedirte lo que falte. Preferimos hacerlo con calma y bien antes que rápido.",
  },
  {
    question: "¿Tengo que pagar algo o cobro por atender?",
    answer:
      "Nada de dinero cambia de manos. Nido no cobra a quien pide ayuda y tampoco te paga a ti: es voluntariado. Donas tu tiempo dentro de tus áreas de competencia y de la disponibilidad que tú mismo definas. No manejamos pagos, suscripciones ni propinas dentro de la plataforma.",
  },
  {
    question:
      "¿Qué pasa si no puedo atender una solicitud o necesito hacer una pausa?",
    answer:
      "Está bien y lo esperamos. Tú decides cuándo estás disponible y puedes pausar tu perfil cuando lo necesites; mientras esté en pausa, no recibirás nuevas solicitudes. Si ya empezaste a acompañar a alguien y no puedes continuar, avísale a la coordinación para buscar juntos una alternativa y que nadie quede sin apoyo.",
  },
  {
    question:
      "¿Cómo protegen mi confidencialidad y mis datos como profesional?",
    answer:
      "Pedimos la mínima información necesaria para verificarte y coordinar el voluntariado, y solo la ve el equipo de coordinación. No publicamos tus documentos ni los compartimos con terceros para fines comerciales. El acompañamiento ocurre fuera de la app, por los medios que acuerdes con la persona, dentro del marco del pacto de voluntariado.",
  },
];

// Versión en texto plano de la pregunta de tiempos (su respuesta visible lleva
// enlaces y va en dos párrafos); el JSON-LD necesita texto y debe coincidir con
// lo visible.
const RESPONSE_TIME_FAQ = {
  question: "¿Cuánto tardan en responderme?",
  answer:
    "Queremos ser honestos contigo: Nido lo sostienen personas voluntarias, así que no respondemos al instante ni podemos prometer un tiempo exacto. Tu mensaje no se pierde; lo revisa el equipo de coordinación y se busca a alguien que pueda acompañarte. La espera puede variar según cuántas personas voluntarias estén disponibles. Por eso es importante recordar que Nido no es un servicio de emergencia: si estás en peligro ahora mismo o sientes que no puedes esperar, busca ayuda inmediata en la página de emergencia o consulta las líneas de apoyo en recursos.",
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <FaqJsonLd items={[...HOME_FAQ, ...PRO_FAQ, RESPONSE_TIME_FAQ]} />
        <h1>Preguntas frecuentes sobre {SITE_NAME}</h1>
        <p className="lead">
          Aquí respondemos las dudas más comunes sobre cómo pedir apoyo
          psicológico gratis y a distancia en Venezuela, y cómo sumarte como
          profesional voluntario. Si no encuentras tu respuesta, escríbenos
          desde <Link href="/contacto">contacto</Link>.
        </p>

        <CrisisResources variant="callout" />

        <h2>Si buscas apoyo</h2>
        <p className="muted">
          Para pedir ayuda no necesitas crear una cuenta. Cuando estés lista o
          listo, empieza en <Link href="/ayuda">pedir apoyo</Link>.
        </p>
        <div className="faq">
          {HOME_FAQ.map((q) => (
            <article className="card" key={q.question}>
              <h3>{q.question}</h3>
              <p>{q.answer}</p>
            </article>
          ))}
        </div>

        <p className="reassurance">
          Cualquier persona es bienvenida aquí: jóvenes, adultos y quienes
          atraviesan momentos muy difíciles. No hay preguntas tontas y nadie te
          va a juzgar. Si lo tuyo no es una emergencia pero sí te pesa, este es
          un buen lugar para empezar.
        </p>

        <h2>Si eres profesional</h2>
        <p className="muted">
          Nido existe para que tu vocación llegue a quien más lo necesita en
          Venezuela. Si eres psicólogo o psicóloga y quieres donar parte de tu
          tiempo, así funciona. Conoce también el{" "}
          <Link href="/pacto-voluntario">pacto de voluntariado</Link> y la
          página para <Link href="/pro">profesionales</Link>.
        </p>
        <div className="faq">
          {PRO_FAQ.map((q) => (
            <article className="card" key={q.question}>
              <h3>{q.question}</h3>
              <p>{q.answer}</p>
            </article>
          ))}
        </div>

        <h2>Sobre los tiempos de respuesta</h2>
        <div className="faq">
          <article className="card">
            <h3>¿Cuánto tardan en responderme?</h3>
            <p>
              Queremos ser honestos contigo: Nido lo sostienen personas
              voluntarias, así que no respondemos al instante ni podemos
              prometer un tiempo exacto. Tu mensaje no se pierde; lo revisa el
              equipo de coordinación y se busca a alguien que pueda acompañarte.
              La espera puede variar según cuántas personas voluntarias estén
              disponibles.
            </p>
            <p>
              Por eso es importante recordar que{" "}
              <strong>Nido no es un servicio de emergencia</strong>. Si estás en
              peligro ahora mismo o sientes que no puedes esperar, no te quedes
              con esto: busca ayuda inmediata en{" "}
              <Link href="/emergencia">emergencia</Link> o consulta las líneas
              de apoyo en <Link href="/recursos">recursos</Link>.
            </p>
          </article>
        </div>

        <div className="notice">
          <p>
            Nido conecta y acompaña; no ofrece terapia dentro de la aplicación,
            no maneja chat, video ni pagos, y no sustituye la atención médica,
            psicológica o de emergencia. La confidencialidad, el cuidado de
            menores y el deber de actuar ante un riesgo se rigen por el{" "}
            <Link href="/pacto-voluntario">pacto de voluntariado</Link>, la{" "}
            <Link href="/privacidad">privacidad</Link> y los{" "}
            <Link href="/terminos">términos</Link>.
          </p>
          <p className="hint">
            Texto pendiente de revisión por un profesional del derecho en
            Venezuela.
          </p>
        </div>

        <p className="muted">
          ¿Quieres saber más antes de dar el paso? Mira{" "}
          <Link href="/como-funciona">cómo funciona</Link>, conoce a{" "}
          <Link href="/quienes-somos">quiénes somos</Link>, lee sobre{" "}
          <Link href="/seguridad">seguridad</Link> y revisa nuestra{" "}
          <Link href="/transparencia">transparencia</Link>.
        </p>
      </div>
    </section>
  );
}
