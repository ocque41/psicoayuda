import type { Metadata } from "next";
import Link from "next/link";
import { requestAccessLinks } from "./actions";

export const metadata: Metadata = {
  title: "Entrar a tu conversación",
  // Página de acceso privado: nunca indexar.
  robots: { index: false, follow: false },
};

/**
 * Enlace mágico de re-entrada para personas sin cuenta: escribe tu correo y te
 * enviamos enlaces frescos a tus conversaciones vivas. Respuesta neutra.
 */
export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string }>;
}) {
  const { enviado, error } = await searchParams;

  return (
    <section className="section">
      <div className="container">
        <h1>Entra a tu conversación</h1>
        <p className="lead">
          Si ya escribiste antes, dinos tu correo y te enviamos un enlace
          privado para volver a tu chat. No necesitas crear una cuenta ni
          recordar contraseñas.
        </p>

        {enviado ? (
          <div className="notice" role="status">
            <p style={{ margin: 0 }}>
              Listo. Si hay conversaciones con ese correo, te enviamos el
              enlace. Revisa tu bandeja y la carpeta de spam. El enlace dura
              unas horas; puedes pedir otro cuando quieras.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="notice" role="alert">
            <p style={{ margin: 0 }}>
              Revisa el correo: parece que falta o está mal escrito.
            </p>
          </div>
        ) : null}

        <form action={requestAccessLinks} className="card">
          <label htmlFor="acceso-email">Tu correo</label>
          <input
            id="acceso-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="tucorreo@ejemplo.com"
          />
          <p>
            <button className="button human" type="submit">
              Enviarme el enlace
            </button>
          </p>
          <p className="hint">
            Por tu privacidad, no decimos si un correo tiene conversaciones o
            no.
          </p>
        </form>

        <p className="muted">
          ¿Es tu primera vez? <Link href="/ayuda">Pide apoyo aquí</Link> y te
          conectamos con una persona voluntaria.
        </p>
      </div>
    </section>
  );
}
