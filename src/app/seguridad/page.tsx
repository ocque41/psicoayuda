import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import {
  PUBLIC_OPEN_GRAPH,
  PUBLIC_TWITTER,
} from "@/lib/public-social-metadata";

const title = "Revisión de perfiles y cuidados en Nido";
const description =
  "Cómo se revisan los perfiles, qué límites tiene esa revisión y cómo se distinguen las condiciones de consulta del programa gratuito Ayuda Terremoto.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/seguridad" },
  openGraph: {
    ...PUBLIC_OPEN_GRAPH,
    title: `${title} | Nido`,
    description,
    url: "/seguridad",
  },
  twitter: {
    ...PUBLIC_TWITTER,
    card: "summary_large_image",
    title: `${title} | Nido`,
    description,
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>{title}</h1>
        <p className="lead">
          Nido conecta a personas con profesionales de psicología. Ayuda
          Terremoto conserva su programa de acompañamiento voluntario gratuito.
          Los perfiles públicos pasan por revisión manual del equipo. Esa
          revisión tiene límites: antes de acordar atención, confirma con el
          profesional la modalidad, las condiciones y si puede atenderte en el
          lugar donde estarás durante la consulta.
        </p>

        <ul className="trust-strip" aria-label="Nuestros cuidados">
          <li>Verificación hecha por personas</li>
          <li>Código de conducta público</li>
          <li>Secreto profesional</li>
        </ul>

        <CrisisResources variant="callout" />

        <h2>Cómo verificamos a cada profesional</h2>
        <p>
          Ningún profesional puede recibir solicitudes sin antes pasar nuestra
          revisión manual. No es un trámite automático: una persona del equipo
          revisa cada caso con calma antes de aprobarlo.
        </p>
        <div className="grid grid-2">
          <article className="card">
            <h3>Título y credencial profesional</h3>
            <p>
              Confirmamos que la persona es psicóloga o psicólogo (o profesional
              de la salud mental) con formación real, revisando su título o la
              credencial que acredita su profesión.
            </p>
          </article>
          <article className="card">
            <h3>Colegiatura o licencia</h3>
            <p>
              Cuando corresponde, comprobamos su colegiatura, inscripción o
              licencia para ejercer, según las normas profesionales aplicables.
            </p>
          </article>
          <article className="card">
            <h3>Identidad</h3>
            <p>
              El acceso a una cuenta y la revisión del perfil son procesos
              distintos. Puedes entrar con correo y, cuando la opción está
              disponible, con Google. Usar esos métodos no acredita por sí solo
              la identidad ni las credenciales profesionales; la publicación del
              perfil requiere revisión manual del equipo.
            </p>
          </article>
          <article className="card">
            <h3>Cuidamos los documentos</h3>
            <p>
              Revisamos lo necesario para confiar, sin exponer documentos. No
              publicamos ni compartimos los datos que un profesional nos muestra
              para verificarse; se usan solo para esa comprobación.
            </p>
          </article>
        </div>
        <p className="hint">
          Verificar reduce riesgos, pero no es una garantía absoluta de
          conducta, disponibilidad ni resultados. Si algo no te cuadra durante
          un acompañamiento, puedes detenerlo y avisarnos.
        </p>

        <h2>Compromisos de Ayuda Terremoto</h2>
        <p>
          El pacto voluntario recoge los compromisos de quienes participan en
          Ayuda Terremoto. El programa gratuito se mantiene separado de las
          consultas por otros motivos:
        </p>
        <article className="card">
          <ul>
            <li>
              <strong>Ayuda Terremoto es gratuita.</strong> La participación en
              este programa no se condiciona a contratar servicios pagos ni el
              software de Nido. Las consultas por otros motivos tienen
              condiciones e importes que se acuerdan con el profesional.
            </li>
            <li>
              <strong>Sin presiones comerciales.</strong> No se presiona a
              quienes solicitan Ayuda Terremoto para contratar otras consultas.
              La ayuda del programa no se condiciona a esa contratación.
            </li>
            <li>
              <strong>Confidencialidad.</strong> Cuidan la información que
              reciben y no la comparten fuera del acompañamiento.
            </li>
            <li>
              <strong>No es un servicio de emergencia.</strong> No prometen
              respuesta inmediata ni atención de urgencia, y derivan a ayuda
              presencial cuando hace falta.
            </li>
            <li>
              <strong>Competencia.</strong> Solo acompañan dentro de sus áreas
              de competencia y formación; si un caso queda fuera de su alcance,
              lo dicen con honestidad y ayudan a buscar una mejor opción.
            </li>
          </ul>
        </article>
        <p>
          Puedes leer el detalle completo en nuestro{" "}
          <Link href="/pacto-voluntario">pacto voluntario</Link>.
        </p>

        <h2>El secreto profesional</h2>
        <p>
          Las psicólogas y psicólogos tienen el deber de guardar secreto
          profesional sobre lo que les confías. Lo que compartes en un
          acompañamiento es privado y no debe divulgarse, salvo en las
          situaciones excepcionales que la ley contempla, como cuando hay un
          riesgo grave para la vida o la seguridad de una persona.
        </p>

        <h2>Qué hacemos ante una situación de riesgo</h2>
        <p>
          Nido no es un servicio de emergencia y no responde al instante. Si una
          persona está en peligro inmediato, lo más importante es buscar ayuda
          que pueda llegar ahora.
        </p>
        <ul>
          <li>
            Te orientamos hacia ayuda que sí puede responder de inmediato. Mira{" "}
            <Link href="/emergencia">qué hacer ahora</Link> y los{" "}
            <Link href="/recursos">recursos de apoyo</Link> disponibles.
          </li>
          <li>
            Animamos a contactar a los servicios de emergencia de tu localidad y
            a acudir a una persona de confianza o al centro de salud más
            cercano.
          </li>
          <li>
            Cuando un profesional voluntario detecta un riesgo grave, su
            prioridad es derivar a ayuda presencial y de emergencia, dentro de
            lo que la ley y su deber profesional permiten.
          </li>
        </ul>
        <p className="hint">
          Los apartados sobre secreto profesional y situaciones de riesgo están
          pendientes de revisión clínica y jurídica por profesionales con
          competencia en Venezuela.
        </p>

        <h2>Condiciones y límites de Nido</h2>
        <article className="card">
          <ul>
            <li>
              El software para profesionales tiene un plan de 10 USD al mes y
              una prueba de 90 días sin tarjeta tras la aprobación del perfil.
              Ese plan no fija el precio de las consultas. Consulta las{" "}
              <Link href="/para-psicologos">
                condiciones del plan profesional
              </Link>
              .
            </li>
            <li>
              No es un servicio de emergencia ni promete tiempos de respuesta.
            </li>
            <li>
              Facilita el contacto y la organización de la consulta. La
              modalidad y las condiciones de atención se acuerdan con cada
              profesional; crear un contacto no confirma una sesión.
            </li>
            <li>
              No tiene reseñas, puntuaciones ni rankings de profesionales.
            </li>
            <li>
              No usa inteligencia artificial para dar apoyo: quien te acompaña
              siempre es una persona.
            </li>
            <li>
              El primer contacto desde un perfil puede hacerse sin crear una
              cuenta. Usar un alias no equivale a anonimato completo. Revisa la{" "}
              <Link href="/recursos/apoyo-emocional-anonimo">
                información de acceso y privacidad
              </Link>
              .
            </li>
          </ul>
        </article>

        <h2>¿Eres profesional de la salud mental?</h2>
        <p>
          Si quieres acompañar a quien más lo necesita, este es tu lugar. Conoce
          cómo colaborar en la{" "}
          <Link href="/psicologos">
            página de Ayuda Terremoto para profesionales
          </Link>{" "}
          y revisa el <Link href="/pacto-voluntario">pacto voluntario</Link> que
          aceptarás.
        </p>
        <p>
          <Link className="button human" href="/psicologos">
            Quiero ser voluntario/a
          </Link>{" "}
          <Link className="button secondary" href="/pacto-voluntario">
            Leer el pacto voluntario
          </Link>
        </p>
      </div>
    </section>
  );
}
