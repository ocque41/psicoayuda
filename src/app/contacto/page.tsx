import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { getAbuseContactEmail, getPrivacyContactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Cómo escribirnos en Nido: privacidad y eliminación de datos, o reportar abuso o conducta insegura. Somos un equipo voluntario. Esto no es un canal de emergencia.",
  alternates: { canonical: "/contacto" },
};

export default function Page() {
  const privacyEmail = getPrivacyContactEmail();
  const abuseEmail = getAbuseContactEmail();

  return (
    <section className="section">
      <div className="container">
        <h1>Contacto</h1>
        <p className="lead">
          Estamos para escucharte. Si tienes una duda sobre tus datos o quieres
          alertarnos de algo que no se siente seguro, aquí te decimos a quién
          escribir y qué puedes esperar.
        </p>

        <div className="notice contact-emergency-notice">
          <p>
            Esto <strong>no</strong> es un canal de emergencia. Nadie está
            revisando estos correos en tiempo real. Si estás en peligro ahora
            mismo o sientes que tu vida o la de otra persona corre riesgo, busca
            ayuda de inmediato.
          </p>
          <CrisisResources variant="callout" />
          <p>
            <Link className="button human" href="/emergencia">
              Ver qué hacer en una emergencia
            </Link>
          </p>
        </div>

        <div className="grid grid-2">
          <article className="card">
            <h2>Privacidad y tus datos</h2>
            <p>
              Para preguntas sobre tu privacidad, sobre qué información tenemos,
              o para pedir que eliminemos tus datos, escríbenos a este correo:
            </p>
            <p>
              <Link
                className="button secondary"
                href={`mailto:${privacyEmail}`}
              >
                {privacyEmail}
              </Link>
            </p>
            <p className="muted">
              Cuéntanos con tus palabras qué necesitas. No hace falta que uses
              ningún formato especial ni que des más datos de los que quieras.
            </p>
          </article>

          <article className="card">
            <h2>Reportar abuso o conducta insegura</h2>
            <p>
              Si una persona voluntaria, o cualquier interacción dentro de Nido,
              te hizo sentir en riesgo, presionada o tratada de forma
              irrespetuosa, queremos saberlo. También puedes escribir aquí si
              notas algo que creas que pone en peligro a otras personas:
            </p>
            <p>
              <Link className="button secondary" href={`mailto:${abuseEmail}`}>
                {abuseEmail}
              </Link>
            </p>
            <p className="muted">
              Tomamos en serio cada reporte. Si puedes, dinos qué pasó y cuándo;
              eso nos ayuda a actuar y a cuidar a más personas.
            </p>
          </article>
        </div>

        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <h2>Fundaciones, organizaciones y alianzas</h2>
          <p>
            Si representas a una fundación, universidad, colegio de psicólogos u
            otra organización de salud mental y quieres aliarte con Nido para
            llegar a más personas tras el terremoto —que tus profesionales se
            sumen como voluntarios, derivar casos o coordinar campañas—, déjanos
            tus datos y te escribimos:
          </p>
          <p>
            <Link className="button human" href="/alianzas">
              Completar el formulario para organizaciones
            </Link>
          </p>
          <p className="muted">
            ¿Prefieres el correo? Escríbenos a{" "}
            <Link href={`mailto:${privacyEmail}`}>{privacyEmail}</Link>. Cada
            organización que se suma nos ayuda a acompañar a más gente.
          </p>
        </div>

        <div className="reassurance">
          <h2>Qué esperar de nosotros</h2>
          <ul>
            <li>
              Somos un equipo voluntario y sin fines de lucro. Leemos lo que nos
              escribes y respondemos en cuanto podemos, aunque no siempre sea de
              inmediato.
            </li>
            <li>
              Tu mensaje lo ve solo el equipo de coordinación, y se trata con el
              mismo cuidado y discreción que pedimos a todas las personas que
              forman parte de Nido.
            </li>
            <li>
              No vendemos tus datos ni los usamos para publicidad. Te pedimos la
              mínima información necesaria para poder ayudarte.
            </li>
          </ul>
          <p className="hint">
            Texto pendiente de revisión por un profesional del derecho en
            Venezuela.
          </p>
        </div>

        <div className="card">
          <h3>¿Buscas otra cosa?</h3>
          <ul>
            <li>
              Si necesitas apoyo emocional, empieza por{" "}
              <Link href="/ayuda">pedir ayuda</Link>.
            </li>
            <li>
              Si eres profesional de la psicología y quieres ser voluntario/a,
              entra por <Link href="/pro">el acceso para profesionales</Link>.
            </li>
            <li>
              Para entender cómo cuidamos tu información, lee nuestra{" "}
              <Link href="/privacidad">política de privacidad</Link> y la página
              de <Link href="/seguridad">seguridad</Link>.
            </li>
            <li>
              Si esto es una urgencia, ve a{" "}
              <Link href="/emergencia">emergencia</Link> o a{" "}
              <Link href="/recursos">recursos de ayuda</Link>.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
