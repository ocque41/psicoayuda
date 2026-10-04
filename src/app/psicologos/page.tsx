import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { getServerSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Hazte psicólogo/a voluntario/a en Venezuela",
  description:
    "Si eres psicóloga o psicólogo en Venezuela, súmate a Nido como voluntario/a: acompaña gratis y a distancia, en la medida de tu tiempo, tras el terremoto.",
  alternates: { canonical: "/psicologos" },
  openGraph: {
    title: "Psicólogos voluntarios para Ayuda Terremoto | Nido",
    description:
      "Súmate como psicólogo o psicóloga voluntaria y ofrece apoyo gratuito y a distancia a personas afectadas por el terremoto en Venezuela.",
    url: "/psicologos",
  },
};

export default async function PsychologistsLandingPage() {
  const session = await getServerSession();
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Para psicólogas y psicólogos voluntarios</p>
          <h1>Tu experiencia puede acompañar a quienes necesitan apoyo</h1>
          <p className="lead">
            Ayuda Terremoto reúne a profesionales que ofrecen acompañamiento
            voluntario a personas afectadas en Venezuela. Puedes colaborar a
            distancia, dentro de tu competencia y de la disponibilidad que
            decidas. La atención en este programa es gratuita.
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
            Después de una experiencia difícil, algunas personas buscan un
            espacio para hablar y recibir apoyo. El programa facilita el
            contacto con profesionales que pueden revisar con ellas qué
            acompañamiento ofrecer y cuáles son sus límites.
          </p>
          <p>
            Tú decides cuántas solicitudes puedes atender y cuándo pausar tu
            participación. El voluntariado no exige disponibilidad permanente ni
            garantiza un resultado clínico. Nido no es un servicio de
            emergencias.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Cómo funciona para ti</h2>
          <ol className="steps">
            <li>
              <strong>
                {googleEnabled
                  ? "Entras con Google o con tu correo."
                  : "Entras con tu correo."}
              </strong>{" "}
              Es el primer paso y lo haces al final de esta página. Después
              eliges el espacio profesional y completas tu formación, áreas de
              competencia, idiomas y disponibilidad.
            </li>
            <li>
              <strong>Verificamos tu credencial a mano.</strong> Hasta que esa
              revisión se complete, tu perfil queda en espera. Lo hacemos así
              para cuidar a quien pide ayuda y para proteger la seriedad de la
              red.
            </li>
            <li>
              <strong>Revisas las solicitudes disponibles.</strong> El equipo
              coordina según áreas, idiomas, cupo y disponibilidad. Cada
              solicitud requiere que compruebes si puedes ofrecer ese
              acompañamiento.
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
              <h3>Privacidad y límites claros</h3>
              <p>
                El chat está cifrado de extremo a extremo. Si utilizas la
                consulta de Nido, puedes guardar notas privadas cifradas en
                servidor; ese almacenamiento no es cifrado de extremo a extremo.
                Consulta{" "}
                <Link href="/privacidad">cómo se tratan los datos</Link>. El
                programa no ofrece atención de emergencias ni respuesta
                inmediata.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="registro">
        <div className="container">
          <div className="join-cta">
            <p className="eyebrow">Paso 1: entra</p>
            <h2>¿Quieres participar?</h2>
            <p>
              Crea una cuenta y completa tu perfil profesional. El acceso a la
              cuenta no verifica tu identidad ni tus credenciales: el equipo
              debe revisarlas antes de habilitar tu participación y el ámbito de
              atención por país.
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
                <AuthPanel googleEnabled={googleEnabled} />
                <p className="muted auth-foot">
                  Al entrar eliges tu espacio. Selecciona «Soy profesional» para
                  completar tu perfil.
                </p>
              </div>
            )}
            <p className="muted">
              Si buscas herramientas para tu consulta, conoce{" "}
              <Link href="/para-psicologos">Nido para psicólogos</Link>. El
              software profesional y Ayuda Terremoto tienen recorridos
              separados.
            </p>
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
