import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Hazte voluntario/a: psicólogas y psicólogos",
  description:
    "Tras el terremoto en Venezuela, miles de personas cargan con un dolor que no se ve. Si eres psicóloga o psicólogo, súmate a Nido: acompaña gratis y a distancia, en la medida de tu tiempo.",
  alternates: { canonical: "/psicologos" },
  openGraph: {
    title:
      "Psicólogos voluntarios: tu vocación puede ayudar a sanar un país | Nido",
    description:
      "Súmate como psicólogo o psicóloga voluntaria y ofrece apoyo gratuito y a distancia a personas afectadas por el terremoto en Venezuela.",
    url: "/psicologos",
  },
};

export default async function PsychologistsLandingPage() {
  const session = await getServerSession();

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Para psicólogas y psicólogos voluntarios</p>
          <h1>Tu vocación puede ayudar a sanar a un país</h1>
          <p className="lead">
            Después del terremoto, miles de personas en Venezuela cargan con
            miedo, duelo e insomnio que nadie ve. Tú tienes justo lo que hace
            falta para acompañarlas. En Nido pones tu experiencia al servicio de
            quien más lo necesita: en remoto, en la medida de tu tiempo y sin
            coste para nadie.
          </p>
          <ul className="trust-strip" aria-label="Lo que te ofrecemos">
            <li>Tú defines tu cupo</li>
            <li>Verificamos y coordinamos por ti</li>
            <li>100% remoto y voluntario</li>
          </ul>
          <p>
            <Link className="button human" href="#registro">
              Quiero ser voluntario/a
            </Link>{" "}
            <Link className="button secondary" href="/como-funciona">
              Ver cómo funciona
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Por qué tu ayuda importa ahora</h2>
          <p>
            Una catástrofe no termina cuando deja de temblar. El dolor que no se
            atiende se queda: se vuelve insomnio que no cede, ansiedad, duelos
            congelados y familias que no logran rehacerse. La salud mental no es
            un lujo para después; es parte de la reconstrucción. Un país se
            levanta cuando su gente puede volver a dormir, a trabajar y a cuidar
            de los suyos.
          </p>
          <p>
            Ahí es donde entras tú. No hacen falta grandes recursos para cambiar
            la historia de alguien: a veces basta una persona preparada que
            escuche a tiempo. Cada acompañamiento que ofreces suma a algo más
            grande que una sesión: ayuda a que una comunidad entera vuelva a
            ponerse de pie.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Cómo funciona para ti</h2>
          <ol className="steps">
            <li>
              <strong>Entras con Google (o tu correo), aquí mismo.</strong> Es
              el primer paso y lo haces al final de esta página. Luego, en unos
              minutos, nos cuentas tu formación, tus áreas de competencia, tus
              idiomas y cuánto tiempo puedes donar.
            </li>
            <li>
              <strong>Verificamos tu credencial a mano.</strong> Hasta que esa
              revisión se complete, tu perfil queda en espera. Lo hacemos así
              para cuidar a quien pide ayuda y para proteger la seriedad de la
              red.
            </li>
            <li>
              <strong>Recibes solicitudes afines.</strong> Te llegan casos
              acordes a tus áreas e idiomas, siempre dentro del cupo que tú
              decidas.
            </li>
            <li>
              <strong>Acompañas a distancia.</strong> Por el medio que acuerdes
              con la persona y dentro de tu competencia profesional. La atención
              ocurre fuera de la plataforma.
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Tu protección y nuestra seriedad</h2>
          <div className="grid grid-2">
            <article className="card">
              <h3>Verificación real</h3>
              <p>
                Revisamos credenciales de forma manual antes de que nadie reciba
                solicitudes. Conoce el proceso en{" "}
                <Link href="/seguridad">cómo verificamos y cuidamos</Link>.
              </p>
            </article>
            <article className="card">
              <h3>Un pacto claro</h3>
              <p>
                Servicio gratuito, sin captar clientes pagos, con
                confidencialidad y dentro de tu competencia. Lee el{" "}
                <Link href="/pacto-voluntario">pacto del voluntario</Link>.
              </p>
            </article>
            <article className="card">
              <h3>Tú pones los límites</h3>
              <p>
                Defines tu cupo y tu disponibilidad, y puedes ponerte en pausa
                cuando lo necesites. Acompañar no debería agotarte.
              </p>
            </article>
            <article className="card">
              <h3>Nido solo conecta</h3>
              <p>
                La atención sucede fuera de la app y no guardamos historias
                clínicas. Que Nido no atienda emergencias también te protege a
                ti: nadie espera de ti una respuesta inmediata.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="registro">
        <div className="container">
          <div className="join-cta">
            <p className="eyebrow">Paso 1: entra</p>
            <h2>¿List@ para empezar?</h2>
            <p>
              Súmate a las psicólogas y psicólogos que ya están sosteniendo a
              Venezuela, una conversación a la vez. Entrar es el primer paso:
              solo sirve para verificar tu identidad profesional y no publicamos
              nada en tu nombre.
            </p>
            {session?.user ? (
              <p className="join-actions">
                <Link className="button human" href="/pro/onboarding">
                  Continuar mi perfil
                </Link>
                <Link className="button secondary" href="/pro/dashboard">
                  Ver mi panel
                </Link>
              </p>
            ) : (
              <div className="signin">
                <AuthPanel />
                <p className="muted auth-foot">
                  Entras solo para verificar tu identidad profesional. Completar
                  tu perfil toma unos minutos.
                </p>
              </div>
            )}
            <p className="muted">
              ¿Te quedan dudas? Mira las{" "}
              <Link href="/preguntas-frecuentes">preguntas frecuentes</Link> o,
              si representas a una fundación,{" "}
              <Link href="/contacto">escríbenos</Link>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
