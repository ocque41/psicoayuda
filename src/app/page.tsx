import Link from "next/link";
import { HomeJsonLd } from "@/components/structured-data";
import { HOME_FAQ } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>
            Ayuda psicológica gratis, confidencial y a distancia en Venezuela
          </h1>
          <p className="lead">
            ¿Estás pasando por un momento difícil? No tienes que atravesarlo en
            silencio. En Nido te conectamos, sin coste y sin crear cuenta, con
            psicólogas y psicólogos voluntarios verificados que acompañan a
            personas en toda Venezuela.
          </p>
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
            <Link className="button secondary" href="/pro">
              Soy profesional voluntario/a
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
          <h2>Apoyo psicológico para toda Venezuela, esté donde estés</h2>
          <p>
            Como la atención es en línea, la ayuda llega a cualquier estado:
            Caracas, Maracaibo, Valencia, Barquisimeto, Maracay, Ciudad Guayana
            y el resto del país. También acompañamos a personas venezolanas en
            el exterior. Solo necesitas un correo electrónico para empezar.
          </p>
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
