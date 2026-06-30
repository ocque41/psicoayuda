import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Así funciona Nido: pide apoyo psicológico gratis y sin crear cuenta, o únete como profesional voluntario verificado. Acompañamiento a distancia en Venezuela.",
  alternates: { canonical: "/como-funciona" },
  openGraph: {
    title: "Cómo funciona | Nido",
    description:
      "Dos caminos sencillos: pedir apoyo psicológico gratis sin crear cuenta, o sumarte como profesional voluntario verificado. Todo a distancia, en Venezuela.",
    url: "/como-funciona",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>Cómo funciona Nido</h1>
        <p className="lead">
          Nido conecta, de forma gratuita y a distancia, a personas en Venezuela
          que necesitan apoyo emocional con psicólogas y psicólogos voluntarios
          verificados. Hay dos caminos: el de quien busca apoyo y el de quien
          quiere ayudar. Aquí te contamos los dos, paso a paso.
        </p>

        <ul className="trust-strip" aria-label="Lo esencial de Nido">
          <li>Gratis</li>
          <li>Confidencial</li>
          <li>Sin crear cuenta para pedir apoyo</li>
          <li>Voluntarios verificados</li>
          <li>100% a distancia</li>
        </ul>

        <CrisisResources variant="callout" />

        <h2>Dos caminos, según para qué llegues</h2>
        <div className="grid grid-2">
          <article className="card">
            <h3>Si buscas apoyo</h3>
            <p>
              No necesitas crear una cuenta ni dar tu nombre completo, tu cédula
              o tu dirección. Solo un correo para que alguien pueda escribirte.
              Sea cual sea tu situación —y por grave o pequeña que la sientas—
              eres bienvenida o bienvenido aquí.
            </p>
            <ol className="steps">
              <li>
                <span>
                  <strong>Pides apoyo, sin cuenta.</strong> Cuentas en pocas
                  líneas cómo estás y nos dejas un correo de contacto. Nada más.
                </span>
              </li>
              <li>
                <span>
                  <strong>El equipo revisa tu mensaje.</strong> Una persona del
                  equipo de coordinación lo lee con cuidado y respeto para
                  entender cómo acompañarte mejor.
                </span>
              </li>
              <li>
                <span>
                  <strong>Una persona voluntaria verificada te escribe.</strong>{" "}
                  Te contacta por correo una psicóloga o psicólogo voluntario
                  cuyas credenciales ya revisamos.
                </span>
              </li>
              <li>
                <span>
                  <strong>Se abre un chat privado en Nido.</strong> Ahí se
                  conocen y empiezan a hablar a distancia. Desde ese chat
                  ustedes deciden si siguen por ese medio u otro que acuerden.
                </span>
              </li>
            </ol>
            <p>
              <Link className="button" href="/ayuda">
                Pedir apoyo
              </Link>
            </p>
          </article>

          <article className="card">
            <h3>Si eres profesional</h3>
            <p>
              Si eres psicóloga, psicólogo o profesional de la salud mental,
              este es tu lugar para acompañar a quien más lo necesita. Tú
              decides tu disponibilidad y a cuántas personas puedes acompañar.
            </p>
            <ol className="steps">
              <li>
                <span>
                  <strong>Entras con Google.</strong> Usamos tu cuenta solo para
                  confirmar tu identidad profesional. No publicamos nada en tu
                  nombre.
                </span>
              </li>
              <li>
                <span>
                  <strong>Verificamos tu credencial.</strong> Revisamos tu
                  formación y registro profesional de forma manual, antes de que
                  puedas recibir solicitudes.
                </span>
              </li>
              <li>
                <span>
                  <strong>Recibes solicitudes afines.</strong> Te llegan
                  peticiones acordes con tus áreas de competencia y tu
                  disponibilidad. Tú decides cuáles tomar.
                </span>
              </li>
              <li>
                <span>
                  <strong>Acompañas en remoto.</strong> Contactas a la persona y
                  la acompañas a distancia, dentro de tu ética y tus límites
                  profesionales.
                </span>
              </li>
            </ol>
            <p>
              <Link className="button human" href="/pro">
                Quiero ser voluntario/a
              </Link>
            </p>
          </article>
        </div>

        <h2>¿Cuánto tarda?</h2>
        <p className="reassurance">
          Detrás de Nido hay personas voluntarias reales que donan su tiempo,
          así que la respuesta no es inmediata: suele tomar horas, y a veces
          algo más. No respondemos al instante ni garantizamos un tiempo exacto.
          Si lo que necesitas es ayuda urgente, no esperes por nosotros.
        </p>
        <p className="hint">
          Te escribiremos al correo que nos dejes. Revisa también tu carpeta de
          correo no deseado por si acaso.
        </p>

        <h2>Qué NO es Nido</h2>
        <div className="notice">
          <ul>
            <li>
              <strong>No es un servicio de emergencia.</strong> No respondemos
              al instante. Si tu vida o la de otra persona corre peligro ahora
              mismo, busca ayuda inmediata en{" "}
              <Link href="/emergencia">líneas de emergencia y recursos</Link>.
            </li>
            <li>
              <strong>Nido no es terapia continua ni emergencia.</strong> Tienes
              un chat privado para conocer a la persona voluntaria y coordinar
              el acompañamiento; no hay videollamadas ni sesiones clínicas
              dentro de la plataforma.
            </li>
            <li>
              <strong>No cobramos nada.</strong> Es un proyecto sin fines de
              lucro. Nunca te pediremos datos de pago.
            </li>
            <li>
              <strong>
                No reemplaza la atención médica ni la psicoterapia formal.
              </strong>{" "}
              Es apoyo emocional de acompañamiento, no un diagnóstico ni un
              tratamiento clínico.
            </li>
          </ul>
        </div>
        <p className="hint">
          Texto pendiente de revisión por un profesional del derecho en
          Venezuela.
        </p>

        <h2>Antes de empezar</h2>
        <p>
          Si quieres conocer más sobre cómo cuidamos tu información, quiénes
          estamos detrás y qué esperamos de cada persona voluntaria, aquí tienes
          por dónde seguir.
        </p>
        <ul>
          <li>
            <Link href="/seguridad">Cómo cuidamos tu seguridad</Link>
          </li>
          <li>
            <Link href="/privacidad">Qué hacemos con tus datos</Link>
          </li>
          <li>
            <Link href="/quienes-somos">Quiénes somos</Link>
          </li>
          <li>
            <Link href="/pacto-voluntario">El pacto del voluntariado</Link>
          </li>
          <li>
            <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>
          </li>
        </ul>

        <p>
          <Link className="button" href="/ayuda">
            Pedir apoyo
          </Link>{" "}
          <Link className="button secondary" href="/pro">
            Quiero ayudar como profesional
          </Link>
        </p>
      </div>
    </section>
  );
}
