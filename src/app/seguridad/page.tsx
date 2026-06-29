import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";

export const metadata: Metadata = {
  title: "Cómo verificamos y cuidamos",
  description:
    "Cómo verificamos manualmente a los profesionales de Nido, el código de conducta público, el secreto profesional y qué hacemos ante una situación de riesgo.",
  alternates: { canonical: "/seguridad" },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>Cómo verificamos y cuidamos</h1>
        <p className="lead">
          Nido conecta a personas en Venezuela con psicólogas y psicólogos
          voluntarios, de forma gratuita y a distancia. Para que confíes en
          quien te acompaña, cada profesional pasa una verificación hecha por
          personas, una a una. Aquí te contamos cómo cuidamos a quien pide ayuda
          y a quien la ofrece.
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
              Verificamos que la persona es quien dice ser. El acceso es con
              Google y revisamos su identidad antes de aprobar el perfil, para
              que detrás de cada acompañamiento haya una persona real y
              responsable.
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

        <h2>El código de conducta que aceptan</h2>
        <p>
          Antes de poder acompañar a nadie, cada profesional acepta un código de
          conducta público. Estos son sus compromisos:
        </p>
        <article className="card">
          <ul>
            <li>
              <strong>Servicio gratuito.</strong> No cobran a las personas que
              acompañan a través de Nido, ni les piden datos de pago.
            </li>
            <li>
              <strong>No captación de clientes.</strong> No usan la plataforma
              para conseguir clientes pagos, hacer publicidad ni desviar a las
              personas hacia consultas privadas.
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
        <p className="hint">
          Texto pendiente de revisión por un profesional del derecho en
          Venezuela.
        </p>

        <h2>Qué hacemos ante una situación de riesgo</h2>
        <p>
          Nido es apoyo de acompañamiento, no un servicio de emergencia y no
          responde al instante. Si una persona está en peligro inmediato, lo más
          importante es buscar ayuda que pueda llegar ahora.
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
          Texto pendiente de revisión por un profesional del derecho en
          Venezuela.
        </p>

        <h2>Lo que Nido nunca hace</h2>
        <article className="card">
          <ul>
            <li>
              No cobra a nadie: ni a quien pide ayuda ni a quien la ofrece.
            </li>
            <li>
              No es un servicio de emergencia ni promete tiempos de respuesta.
            </li>
            <li>
              No ofrece terapia dentro de la app: no hay chat, llamadas ni
              videollamadas en la plataforma.
            </li>
            <li>
              No tiene reseñas, puntuaciones ni rankings de profesionales.
            </li>
            <li>
              No usa inteligencia artificial para dar apoyo: quien te acompaña
              siempre es una persona.
            </li>
            <li>
              No pide a las personas que solicitan ayuda crear una cuenta ni dar
              su identidad completa.
            </li>
          </ul>
        </article>

        <h2>¿Eres profesional de la salud mental?</h2>
        <p>
          Si quieres acompañar a quien más lo necesita, este es tu lugar. Conoce
          cómo unirte y verificarte en la{" "}
          <Link href="/pro">página para profesionales</Link> y revisa el{" "}
          <Link href="/pacto-voluntario">pacto voluntario</Link> que aceptarás.
        </p>
        <p>
          <Link className="button human" href="/pro">
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
