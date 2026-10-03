import Link from "next/link";
import { HomeProfessionalsStrip } from "@/components/home-professionals-strip";
import { HomeJsonLd } from "@/components/structured-data";
import { WorkspaceIcon } from "@/components/workspace/icon";
import { ProductPreview } from "@/components/workspace/product-preview";
import { getCachedFeedProfessionals } from "@/lib/feed";
import { HOME_FAQ } from "@/lib/site";

export const revalidate = 300;
export default async function HomePage() {
  const professionals = await getCachedFeedProfessionals();
  const localCatalogFirst = process.env.NIDO_LOCAL_CATALOG_FIRST === "true";
  const principles = (
    <section
      className="marketing-principles"
      aria-label="Un acompañamiento a tu medida"
    >
      <div className="container">
        <span>Personas primero.</span>
        <p>Tú eliges con quién hablar.</p>
        <p>Tu historia tiene su propio ritmo.</p>
        <p>Un próximo paso a la vez.</p>
      </div>
    </section>
  );
  return (
    <div className="nido-marketing">
      <section className="marketing-hero">
        <div className="container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <p className="eyebrow">
              <span className="marketing-live-dot" aria-hidden="true" />
              Un lugar para empezar
            </p>
            <h1>
              Ayuda psicológica en Venezuela.
              <br />
              <span>A tu ritmo.</span>
            </h1>
            <p className="lead">
              No tienes que tener todas las respuestas para dar el primer paso.
              Encuentra a alguien que pueda escucharte y acompañarte.
            </p>
            <div className="marketing-hero-actions">
              <Link className="button" href="/profesionales">
                Encontrar mi psicólogo<span aria-hidden="true">↗</span>
              </Link>
              <Link className="marketing-text-link" href="/orientacion">
                Ayúdame a elegir<span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="marketing-trust">
              <span>
                <WorkspaceIcon name="profile" />
                Perfiles revisados
              </span>
              <span>
                <WorkspaceIcon name="message" />
                Conversaciones privadas
              </span>
            </div>
            <p className="marketing-hero-context">
              En Venezuela y donde te encuentres, según la disponibilidad y el
              ámbito de cada profesional.
            </p>
          </div>
          <ProductPreview />
        </div>
      </section>
      {!localCatalogFirst ? principles : null}
      <section className="section marketing-professionals">
        <div className="container">
          <div className="marketing-section-heading">
            <div>
              <p className="eyebrow">Conoce a tu próximo acompañante</p>
              <h2>
                Una conexión
                <br />
                que empieza contigo.
              </h2>
            </div>
            <p>
              Explora sus áreas de apoyo, idiomas y formas de contacto. El
              próximo paso lo decides tú.
            </p>
          </div>
          {professionals.length ? (
            <HomeProfessionalsStrip professionals={professionals.slice(0, 9)} />
          ) : (
            <div className="workspace-empty">
              <WorkspaceIcon name="people" />
              <h3>Estamos preparando los perfiles disponibles</h3>
              <p>
                El equipo puede ayudarte a encontrar orientación mientras
                ampliamos el catálogo.
              </p>
              <Link className="button secondary" href="/contacto">
                Hablar con el equipo
              </Link>
            </div>
          )}
          <p>
            <Link className="marketing-text-link" href="/profesionales">
              Explorar todos los perfiles<span aria-hidden="true">↗</span>
            </Link>
          </p>
        </div>
      </section>
      {localCatalogFirst ? principles : null}
      <section className="section marketing-how">
        <div className="container">
          <div className="marketing-section-heading">
            <div>
              <p className="eyebrow">Sin prisa, sin complicaciones</p>
              <h2>Empieza con algo pequeño.</h2>
            </div>
            <p>
              No hace falta saber cómo funciona todo. Te acompañamos desde el
              primer paso.
            </p>
          </div>
          <div className="marketing-steps">
            <article>
              <div className="marketing-step-symbol">
                <WorkspaceIcon name="people" />
                <span>01</span>
              </div>
              <h3>Encuentra a alguien afín</h3>
              <p>
                Busca por área de apoyo o deja que unas preguntas breves te
                orienten.
              </p>
              <Link href="/orientacion">Explorar lo que necesito →</Link>
            </article>
            <article>
              <div className="marketing-step-symbol">
                <WorkspaceIcon name="message" />
                <span>02</span>
              </div>
              <h3>Comienza una conversación</h3>
              <p>
                Pregunta cómo empezar. Tú decides qué compartir y con quién
                continuar.
              </p>
              <Link href="/profesionales">Conocer profesionales →</Link>
            </article>
            <article>
              <div className="marketing-step-symbol">
                <WorkspaceIcon name="calendar" />
                <span>03</span>
              </div>
              <h3>Haz espacio para ti</h3>
              <p>
                Organiza tus encuentros, mensajes y próximos pasos en tu espacio
                personal.
              </p>
              <Link href="/entrar?modo=registro">Crear mi espacio →</Link>
            </article>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container marketing-professional-cta">
          <div>
            <p className="eyebrow">Nido para psicólogos</p>
            <h2>
              Tu atención merece
              <br />
              un espacio propio.
            </h2>
            <p>
              Agenda, pacientes, notas y seguimiento. Más claridad para tu
              consulta, más tiempo para acompañar.
            </p>
            <Link className="button" href="/para-psicologos">
              Conocer Nido para profesionales<span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="marketing-cta-art" aria-hidden="true">
            <div />
            <WorkspaceIcon name="leaf" />
            <span>
              Una consulta.
              <br />
              Todo conectado.
            </span>
          </div>
        </div>
      </section>
      <section className="section marketing-help">
        <div className="container marketing-help-grid">
          <article>
            <p className="eyebrow">Ayuda Terremoto</p>
            <h2>
              Cuando hace falta
              <br />
              estar cerca.
            </h2>
            <p>
              El acompañamiento voluntario para personas afectadas por el
              terremoto tiene su propio recorrido. Se mantiene gratuito, según
              disponibilidad.
            </p>
            <Link className="marketing-text-link" href="/ayuda">
              Solicitar ayuda por el terremoto<span aria-hidden="true">→</span>
            </Link>
          </article>
          <article>
            <p className="eyebrow">Para el próximo paso</p>
            <h2>
              Un poco de claridad
              <br />
              también ayuda.
            </h2>
            <p>
              Lecturas breves para orientarte y preparar una conversación con un
              profesional.
            </p>
            <Link className="marketing-text-link" href="/recursos">
              Explorar recursos<span aria-hidden="true">→</span>
            </Link>
          </article>
        </div>
      </section>
      <section className="section marketing-faq">
        <div className="container marketing-faq-layout">
          <div>
            <p className="eyebrow">Te lo ponemos sencillo</p>
            <h2>
              Las preguntas
              <br />
              son un buen inicio.
            </h2>
            <p>Si falta una respuesta, nuestro equipo puede orientarte.</p>
            <Link href="/contacto">Hablar con Nido →</Link>
          </div>
          <div>
            {HOME_FAQ.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <aside className="container marketing-safety">
        <WorkspaceIcon name="help" />
        <p>
          Si hay peligro inmediato, busca ayuda presencial o contacta los
          servicios de emergencia de tu ubicación.{" "}
          <Link href="/emergencia">Recursos de ayuda inmediata →</Link>
        </p>
      </aside>
      <HomeJsonLd />
    </div>
  );
}
