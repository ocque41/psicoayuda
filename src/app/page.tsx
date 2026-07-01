import Link from "next/link";
import { HomeProfessionalsStrip } from "@/components/home-professionals-strip";
import { HomeJsonLd } from "@/components/structured-data";
import { getFeedProfessionals } from "@/lib/feed";
import { HOME_FAQ } from "@/lib/site";

// La portada muestra a las personas voluntarias verificadas (lista pública, sin
// datos confidenciales). ISR cada 60s, igual que /profesionales: la BD D1 no
// existe en build, así que se prerenderiza vacío y se rellena en runtime.
export const revalidate = 60;

export default async function HomePage() {
  const professionals = await getFeedProfessionals();
  // Carrusel horizontal en la portada: mostramos hasta 10 (se deslizan sin
  // empujar el contenido tranquilizador hacia abajo). El resto en /profesionales.
  const featured = professionals.slice(0, 10);
  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Tras los terremotos del 24 de junio de 2026</p>
          <h1>
            Ayuda psicológica gratis en Venezuela, también tras los terremotos
          </h1>
          <ul className="trust-strip" aria-label="Garantías">
            <li>Gratis, siempre</li>
            <li>Confidencial</li>
            <li>Sin crear cuenta</li>
            <li>Voluntarios verificados</li>
          </ul>
          <p>
            <Link className="button human" href="/ayuda">
              Quiero que me acompañen
            </Link>{" "}
            <Link className="button secondary" href="/psicologos">
              Soy profesional voluntario/a
            </Link>
          </p>
          <p className="safety-note">
            Nido no es un servicio de emergencias. Si tú o alguien corre peligro
            inmediato o necesita atención médica urgente, llama al{" "}
            <strong>911</strong> (línea única nacional de emergencias) o busca
            ayuda presencial ahora mismo.{" "}
            <Link href="/emergencia">Más líneas de ayuda y qué hacer →</Link>
          </p>
        </div>
      </section>

      <section className="section" id="voluntarios">
        <div className="container">
          <h2>Psicólogas y psicólogos voluntarios disponibles</h2>
          <p className="lead">
            Estas personas profesionales, verificadas, donan su tiempo para
            acompañarte gratis y a distancia. Elige con quién hablar o deja tu
            solicitud y te conectamos con alguien afín.
          </p>
          <form
            action="/profesionales"
            method="get"
            className="field"
            style={{ maxWidth: 560, marginBottom: "var(--space-5)" }}
          >
            <label htmlFor="home-pro-search">
              Busca un psicólogo por lo que necesitas
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                id="home-pro-search"
                type="search"
                name="q"
                placeholder="Ej.: ansiedad, duelo, niños, miedo…"
                autoComplete="off"
                style={{ flex: "1 1 240px" }}
              />
              <button type="submit" className="button human">
                Buscar
              </button>
            </div>
          </form>
          {featured.length > 0 ? (
            <>
              <p className="muted">
                {professionals.length === 1
                  ? "1 psicóloga o psicólogo voluntario disponible ahora."
                  : `${professionals.length} psicólogas y psicólogos voluntarios disponibles ahora.`}{" "}
                Desliza para conocerlos.
              </p>
              <HomeProfessionalsStrip professionals={featured} />
              <p>
                <Link className="button secondary" href="/profesionales">
                  Ver y buscar todas las personas voluntarias
                </Link>
              </p>
            </>
          ) : (
            <div className="card">
              <p>
                Estamos sumando psicólogas y psicólogos voluntarios verificados.
                Mientras tanto, deja tu solicitud y una persona del equipo te
                escribirá a tu correo para acompañarte.
              </p>
              <p className="join-actions">
                <Link className="button human" href="/ayuda">
                  Pedir apoyo ahora
                </Link>
                <Link className="button secondary" href="/pro">
                  Soy psicólogo/a: quiero ayudar
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Lo que sientes después del terremoto tiene sentido</h2>
          <p className="lead">
            Después de los sismos que sacudieron Yaracuy, La Guaira, Caracas y
            el centro-norte del país, sentir miedo, angustia, insomnio o no
            poder dejar de revivir lo ocurrido es una reacción normal ante algo
            que no fue normal. En Nido te conectamos, sin coste y sin crear
            cuenta, con psicólogas y psicólogos voluntarios verificados que
            acompañan a distancia a quienes atraviesan este momento.
          </p>
          <p>
            No hay una forma “correcta” de reaccionar ante una catástrofe. En
            los días y semanas posteriores es común sentir algunas de estas
            cosas. No estás solo/a y, en la mayoría de los casos, mejoran con
            apoyo y tiempo:
          </p>
          <ul className="reactions">
            <li>Miedo, sobresalto o estar en alerta todo el tiempo.</li>
            <li>Dificultad para dormir, pesadillas o revivir lo ocurrido.</li>
            <li>Tristeza, llanto o sensación de vacío.</li>
            <li>Ansiedad, palpitaciones o sensación de falta de aire.</li>
            <li>Irritabilidad, culpa o sentir que “deberías estar mejor”.</li>
            <li>
              Preocupación constante por tus seres queridos o por el futuro.
            </li>
          </ul>
          <p>
            Hablar con alguien que escucha sin juzgar ayuda. Si quieres, una
            persona voluntaria puede acompañarte de forma gratuita y
            confidencial.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>
            No te quedes solo/a: encuentra a un profesional que te acompañe
          </h2>
          <p>
            Cuidar tu salud mental después de una catástrofe no es un lujo ni
            una debilidad: es parte de reconstruir. El miedo, el duelo y el
            agotamiento, cuando nadie los atiende, se quedan dentro y también
            frenan a las familias y a las comunidades. Un país vuelve a
            levantarse cuando su gente puede volver a dormir, a trabajar y a
            cuidar de los suyos.
          </p>
          <p>
            Pedir ayuda a tiempo cambia las cosas: hablar con una persona
            profesional que escucha sin juzgar alivia, ordena lo que sientes y
            te devuelve fuerzas. No tienes que poder con todo tú solo/a.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Encontrar a un profesional
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Cómo pedir apoyo psicológico en 3 pasos</h2>
          <ol className="steps">
            <li>
              <strong>Cuéntanos cómo estás.</strong> Completa un formulario
              breve en menos de un minuto. No necesitas cuenta, nombre ni
              ubicación exacta.
            </li>
            <li>
              <strong>Una persona voluntaria te lee.</strong> Un psicólogo o
              psicóloga voluntaria verificada revisa tu solicitud.
            </li>
            <li>
              <strong>Te escriben a tu correo.</strong> Te acompañan a
              distancia, de forma gratuita y confidencial.
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-2">
          <article className="card">
            <h2>Si necesitas apoyo</h2>
            <p>
              Cuéntanos cómo estás en menos de un minuto. No necesitas cuenta ni
              dar tu ubicación. Una persona voluntaria revisará tu mensaje y te
              escribirá a tu correo.
            </p>
            <p>
              <Link className="button human" href="/ayuda">
                Pedir apoyo ahora
              </Link>
            </p>
          </article>
          <article className="card">
            <h2>Si quieres ayudar</h2>
            <p>
              Atiendes en remoto, gratis, con el número de personas que tú
              decidas. Tú pones los límites; nosotros coordinamos y verificamos.
            </p>
            <p>
              <Link className="button secondary" href="/pro">
                Quiero ayudar
              </Link>
            </p>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="join-cta">
            <p className="eyebrow">Súmate al equipo</p>
            <h2>¿Eres psicólogo/a profesional o una fundación?</h2>
            <p>
              Cuantas más personas voluntarias y organizaciones se sumen, a más
              gente podemos acompañar tras el terremoto. Si eres psicóloga o
              psicólogo, regístrate gratis: tú defines tu disponibilidad y
              nosotros verificamos y coordinamos por ti. Si representas a una
              fundación u organización de salud mental, aliémonos para llegar a
              más personas.
            </p>
            <p className="join-actions">
              <Link className="button human" href="/pro">
                Soy psicólogo/a: quiero ayudar
              </Link>
              <Link className="button secondary" href="/contacto">
                Represento una fundación
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Apoyo para las zonas afectadas y para toda Venezuela</h2>
          <p>
            Como la atención es en línea, la ayuda llega a las zonas más
            golpeadas por los sismos —Yaracuy (San Felipe), Yumare, La Guaira y
            Caracas— y también al resto del país: Maracaibo, Valencia,
            Barquisimeto, Maracay, Ciudad Guayana y más. Acompañamos a familias
            desplazadas, a personas en refugios con acceso a un teléfono y a
            venezolanos en el exterior preocupados por los suyos. Solo necesitas
            un correo electrónico para empezar.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Guías para acompañarte</h2>
          <p>
            Lecturas breves y cálidas, escritas con cuidado, para distintos
            momentos. No reemplazan hablar con una persona, pero pueden ayudarte
            mientras das el paso.
          </p>
          <ul className="reactions">
            <li>
              <Link href="/recursos/psicologo-online-gratis-venezuela">
                Psicólogo online gratis en Venezuela: cómo empezar
              </Link>
            </li>
            <li>
              <Link href="/recursos/ansiedad-despues-del-terremoto">
                Ansiedad y miedo después del terremoto: qué hacer
              </Link>
            </li>
            <li>
              <Link href="/recursos/acompanar-a-alguien-en-crisis">
                Cómo acompañar a alguien que está pasando por un mal momento
              </Link>
            </li>
            <li>
              <Link href="/recursos">Ver todos los recursos de apoyo</Link>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Preguntas frecuentes sobre la ayuda psicológica gratuita</h2>
          <div className="faq">
            {HOME_FAQ.map((item) => (
              <article className="card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <HomeJsonLd />
    </>
  );
}
