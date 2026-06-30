import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";

export const metadata: Metadata = {
  title: "Apoyo emocional gratis y anónimo, sin dar tu nombre",
  description:
    "Pide apoyo psicológico gratis en Venezuela sin crear cuenta, sin dar tu nombre, cédula ni ubicación exacta. Solo un correo de contacto. Confidencial y digno.",
  alternates: { canonical: "/recursos/apoyo-emocional-anonimo" },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Apoyo emocional anónimo",
              path: "/recursos/apoyo-emocional-anonimo",
            },
          ]}
        />
        <h1>Apoyo emocional gratis y anónimo, sin dar tu nombre</h1>
        <p className="lead">
          Si te frena la vergüenza o el miedo a que te identifiquen, respira:
          para pedir apoyo en Nido no necesitas dar tu nombre, tu cédula ni
          decir dónde vives. Pedir ayuda no te expone.
        </p>

        <CrisisResources variant="callout" />

        <p>
          Muchas personas en Venezuela quieren hablar con alguien, pero algo las
          detiene: el qué dirán, el temor a que se sepa, la idea de que pedir
          ayuda es de débiles. Nada de eso es cierto. Buscar apoyo cuando la
          tristeza, la angustia o el estrés te pesan es un acto de valentía y de
          cuidado hacia ti. Y se puede hacer de forma reservada.
        </p>

        <ul className="trust-strip" aria-label="Lo esencial">
          <li>Gratis</li>
          <li>Sin cuenta</li>
          <li>Confidencial</li>
          <li>A distancia</li>
        </ul>

        <div className="card">
          <h2>Pedir apoyo sin crear cuenta ni dar tu nombre</h2>
          <p>
            En Nido, quien necesita ayuda no crea ningún usuario ni contraseña.
            No te pedimos tu nombre real, ni tu cédula, ni tu dirección, ni una
            ubicación exacta. Llenas un formulario breve para contarnos cómo
            estás, dejas un correo donde podamos escribirte, y listo. Una
            persona voluntaria verificada te responde por ahí para acompañarte a
            distancia, sin coste.
          </p>
          <p>
            Puedes usar un correo que no lleve tu nombre completo si así te
            sientes más tranquilo o tranquila. Lo importante es que sea uno que
            revises, para no perder la respuesta.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo
            </Link>
          </p>
        </div>

        <div className="card">
          <h2>Qué datos te pedimos y por qué</h2>
          <p>Pedimos lo mínimo, y cada cosa tiene un motivo claro:</p>
          <ul>
            <li>
              <strong>Un correo de contacto:</strong> es la única forma de que
              la persona voluntaria pueda escribirte y empezar el
              acompañamiento. Sin un correo no hay manera de responderte.
            </li>
            <li>
              <strong>Cómo te sientes:</strong> nos cuentas con tus palabras qué
              te trae aquí, para orientar el apoyo. Comparte solo lo que
              quieras; no tienes que dar detalles que te incomoden.
            </li>
          </ul>
          <p>
            No te pedimos nombre legal, cédula, número de teléfono ni ubicación
            precisa. No necesitamos saber dónde estás para acompañarte.
          </p>
        </div>

        <div className="card">
          <h2>Confidencialidad: tu historia es tuya</h2>
          <p>
            Lo que escribes lo lee la persona voluntaria que te acompaña, que es
            profesional verificado y trata tu caso con reserva. Nido no es un
            servicio que publica, califica ni comparte tu mensaje, y no usamos
            chats públicos ni reseñas. Tampoco hay videollamadas ni inteligencia
            artificial atendiéndote: detrás siempre hay una persona real.
          </p>
          <p>
            Si en algún momento prefieres no seguir, no tienes que dar
            explicaciones. El paso lo marcas tú.
          </p>
        </div>

        <div className="card">
          <h2>Cómo empezar, paso a paso</h2>
          <ol className="steps">
            <li>
              <span>
                Entra a <Link href="/ayuda">pedir apoyo</Link> y cuéntanos
                brevemente cómo estás.
              </span>
            </li>
            <li>
              <span>
                Deja un correo donde puedas recibir la respuesta. No hace falta
                nada más.
              </span>
            </li>
            <li>
              <span>
                Una persona voluntaria verificada revisa tu mensaje y te escribe
                para acompañarte a distancia, sin coste.
              </span>
            </li>
          </ol>
          <p className="reassurance">
            Detrás de Nido hay psicólogas y psicólogos voluntarios reales que
            donan su tiempo. La respuesta no es inmediata, pero llega con
            cuidado y respeto.
          </p>
        </div>

        <div className="notice">
          <p>
            Nido es acompañamiento gratuito a distancia, no un servicio de
            emergencia ni terapia dentro de la app. Si necesitas ayuda
            inmediata, revisa las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>.
            Puedes ver más orientación en nuestros{" "}
            <Link href="/recursos">recursos de salud mental</Link>.
          </p>
        </div>

        <div className="faq">
          <article className="card">
            <h3>¿Tengo que decir mi nombre verdadero?</h3>
            <p>
              No. Para pedir apoyo no pedimos tu nombre real ni tu cédula. Solo
              un correo de contacto y, si quieres, lo que desees contarnos.
            </p>
          </article>
          <article className="card">
            <h3>¿Pedir ayuda me mete en problemas?</h3>
            <p>
              No. Pedir apoyo es algo privado entre tú y la persona que te
              acompaña. No te expone ni te compromete a nada.
            </p>
          </article>
          <article className="card">
            <h3>¿Tiene algún costo?</h3>
            <p>
              No. Nido es gratis. Nunca te pediremos pagos ni datos bancarios.
            </p>
          </article>
        </div>

        <p className="hint">
          ¿Quieres saber más antes de escribir? Lee las{" "}
          <Link href="/preguntas-frecuentes">preguntas frecuentes</Link>,
          entérate de <Link href="/como-funciona">cómo funciona Nido</Link> y
          conoce a <Link href="/quienes-somos">quiénes somos</Link>.
        </p>

        <p>
          <Link className="button human" href="/ayuda">
            Pedir apoyo
          </Link>
        </p>
      </div>
    </section>
  );
}
