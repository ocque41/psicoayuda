"use client";

import Link from "next/link";

export default function ProError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="section">
      <div className="container">
        <div className="card signin">
          <h1>No pudimos cargar esta parte</h1>
          <p>
            Tu cuenta y tus datos siguen guardados. Puedes volver a intentarlo
            ahora o regresar al acceso profesional.
          </p>
          <p className="join-actions">
            <button className="button human" type="button" onClick={reset}>
              Reintentar
            </button>
            <Link className="button secondary" href="/pro">
              Volver al acceso profesional
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
