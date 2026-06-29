import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="section">
      <div className="container">
        <h1>No encontramos esta página</h1>
        <p className="lead">
          El enlace puede estar roto o la página se movió. Pero sigues a un paso
          de recibir apoyo.
        </p>
        <p>
          <Link className="button human" href="/ayuda">
            Pedir ayuda psicológica gratis
          </Link>{" "}
          <Link className="button secondary" href="/">
            Volver al inicio
          </Link>
        </p>
        <p className="muted">
          También puedes ver nuestros <Link href="/recursos">recursos</Link> o,
          si eres profesional, <Link href="/pro">unirte como voluntario/a</Link>
          .
        </p>
      </div>
    </section>
  );
}
