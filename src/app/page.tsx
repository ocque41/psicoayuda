import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>
            Conectamos personas afectadas con profesionales voluntarios de apoyo
            psicológico.
          </h1>
          <p className="muted" style={{ maxWidth: 720, fontSize: "1.15rem" }}>
            PsicoAyuda no reemplaza emergencias ni atención médica. Ayuda a
            conectar rápidamente con profesionales voluntarios disponibles de
            forma remota.
          </p>
          <p>
            <Link className="button" href="/ayuda">
              Pedir ayuda
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
            <h2>Para personas</h2>
            <p>
              Puedes enviar una solicitud con tu correo. La ubicación es
              opcional. No necesitas crear cuenta.
            </p>
          </article>
          <article className="card">
            <h2>Para profesionales</h2>
            <p>
              Entra con Google, completa tus datos y espera verificación de un
              coordinador antes de recibir solicitudes.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
