import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>¿Estás pasando por un momento difícil? No tienes que atravesarlo en silencio.</h1>
          <p className="lead">
            Te ayudamos a conectar, gratis y a distancia, con psicólogas y
            psicólogos voluntarios. Sin crear cuenta y sin coste.
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
    </>
  );
}
