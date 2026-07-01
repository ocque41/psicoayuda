import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Apoyo psicológico para venezolanos en el exterior",
  description:
    "Si eres venezolano migrante y sientes duelo, soledad o estrés de adaptación, Nido te conecta gratis con un psicólogo voluntario, a distancia y en español.",
  alternates: { canonical: "/recursos/venezolanos-en-el-exterior" },
  openGraph: {
    title: "Apoyo psicológico para venezolanos en el exterior | Nido",
    description:
      "Si eres venezolano migrante y sientes duelo, soledad o estrés de adaptación, Nido te conecta gratis con un psicólogo voluntario, a distancia y en español.",
    url: "/recursos/venezolanos-en-el-exterior",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/venezolanos-en-el-exterior"
          name="Apoyo psicológico para venezolanos en el exterior"
          description="Si eres venezolano migrante y sientes duelo, soledad o estrés de adaptación, Nido te conecta gratis con un psicólogo voluntario, a distancia y en español."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Venezolanos en el exterior",
              path: "/recursos/venezolanos-en-el-exterior",
            },
          ]}
        />
        <h1>Apoyo psicológico para venezolanos en el exterior</h1>

        <p className="lead">
          Irte de Venezuela no siempre se siente como empezar de cero: a veces
          se siente como cargar dos vidas a la vez. Si estás lejos y te pesa la
          distancia, la soledad o la sensación de no terminar de adaptarte, no
          estás solo. Aquí te contamos qué te puede estar pasando y cómo Nido te
          conecta, sin costo, con un psicólogo voluntario venezolano que te
          atiende a distancia y en tu mismo español.
        </p>

        <CrisisResources variant="callout" />

        <h2>El duelo migratorio es real (aunque nadie lo nombre)</h2>
        <p>
          Migrar también es despedirse: de tu casa, de tu gente, de las calles
          que conocías, del tú que eras allá. A eso se le llama duelo
          migratorio, y es normal sentirlo aunque hayas tomado la mejor decisión
          de tu vida. Puede aparecer como tristeza que va y viene, rabia,
          cansancio, o esa nostalgia que te agarra con una canción o un olor.
          Sentirlo no significa que estés mal ni que seas malagradecido:
          significa que querías lo que dejaste.
        </p>

        <h2>Señales de que vale la pena buscar apoyo</h2>
        <ul>
          <li>Te sientes solo o aislado, aunque estés rodeado de gente.</li>
          <li>
            Te cuesta dormir, comer o concentrarte por la preocupación
            constante.
          </li>
          <li>
            La distancia de tu familia te genera culpa, angustia o tristeza que
            no baja.
          </li>
          <li>
            Sientes que el estrés de adaptarte (idioma, papeles, trabajo) te
            sobrepasa.
          </li>
          <li>
            Tienes ganas de hablar con alguien que de verdad entienda de dónde
            vienes.
          </li>
        </ul>

        <h2>Cosas que ayudan en el día a día</h2>
        <p>
          Mientras decides pedir acompañamiento, hay gestos pequeños que
          sostienen:
        </p>
        <ul>
          <li>
            Mantén rituales que te conecten con casa: una comida, una llamada
            fija, tu música.
          </li>
          <li>
            Pon en palabras lo que sientes. Escribirlo o contárselo a alguien de
            confianza alivia.
          </li>
          <li>
            Cuida lo básico: dormir, moverte y salir un rato, aunque sea
            poquito.
          </li>
          <li>
            Date permiso de extrañar sin castigarte. Adaptarse toma tiempo y no
            es una carrera.
          </li>
        </ul>
        <p className="reassurance">
          Pedir ayuda no es debilidad. Es una forma de cuidarte para poder
          seguir.
        </p>

        <h2>Te atendemos a distancia, en español, desde cualquier país</h2>
        <p>
          En Nido todo el acompañamiento es en remoto y en español, así que no
          importa en qué país estés viviendo ahora: si tienes conexión, podemos
          conectarte con un psicólogo voluntario. No necesitas crear una cuenta
          ni pagar nada. Nido no cobra y no da terapia dentro de una app: lo que
          hacemos es ponerte en contacto con un profesional verificado que
          decide contigo cómo seguir.
        </p>
        <p>
          Si quieres,{" "}
          <Link href="/profesionales">
            mira a las psicólogas y psicólogos voluntarios
          </Link>{" "}
          y elige tú con quién hablar, estés donde estés.
        </p>
        <p className="muted">
          Nido no es un servicio de emergencia. Si estás en tu país de
          residencia y atraviesas una crisis o sientes que tu vida corre
          peligro, usa los servicios de emergencia locales de donde vives ahora.
          Puedes ver más en <Link href="/emergencia">emergencia</Link>.
        </p>

        <h2>Cómo pedir apoyo</h2>
        <ol className="steps">
          <li>
            Entras a la página de apoyo y nos cuentas brevemente cómo estás.
          </li>
          <li>
            Revisamos tu solicitud para conectarte con un psicólogo voluntario
            verificado.
          </li>
          <li>
            El profesional te contacta y juntos acuerdan cómo continuar el
            acompañamiento.
          </li>
        </ol>

        <div className="trust-strip">
          <p>
            Gratis · Psicólogos voluntarios verificados · A distancia y en
            español · Sin crear cuenta
          </p>
        </div>

        <p className="hint">
          Da el primer paso cuando te sientas listo. Estamos para acompañarte.
        </p>

        <p>
          <Link className="button human" href="/ayuda">
            Pedir apoyo
          </Link>
        </p>

        <div className="notice">
          <p>
            ¿Quieres saber más antes de escribirnos? Mira{" "}
            <Link href="/como-funciona">cómo funciona</Link>, resuelve dudas en{" "}
            <Link href="/preguntas-frecuentes">preguntas frecuentes</Link>,
            conoce a <Link href="/quienes-somos">quiénes somos</Link> o explora
            otros <Link href="/recursos">recursos</Link>.
          </p>
        </div>

        <h2 className="faq">Preguntas frecuentes</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>¿Sirve si vivo fuera de Venezuela?</h3>
            <p>
              Sí. La atención es a distancia y en español, así que puedes pedir
              apoyo desde el país donde estés viviendo.
            </p>
          </div>
          <div className="card">
            <h3>¿Tiene algún costo?</h3>
            <p>
              No. Nido es una ONG sin fines de lucro y el acompañamiento es
              completamente gratuito.
            </p>
          </div>
          <div className="card">
            <h3>¿Tengo que crear una cuenta?</h3>
            <p>
              No. Quien pide ayuda no crea cuenta. Solo nos cuentas cómo estás
              para poder conectarte.
            </p>
          </div>
          <div className="card">
            <h3>¿Y si es una emergencia?</h3>
            <p>
              Nido no atiende emergencias. Usa los servicios locales de tu país
              de residencia y revisa <Link href="/emergencia">emergencia</Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
