import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Ataque de pánico: qué hacer en el momento",
  description:
    "Un ataque de pánico asusta mucho pero pasa y no es peligroso. Qué hacer paso a paso para calmarlo, qué hacer después y cuándo pedir ayuda psicológica gratis.",
  alternates: { canonical: "/recursos/ataque-de-panico-que-hacer" },
  openGraph: {
    title: "Ataque de pánico: qué hacer en el momento | Nido",
    description:
      "Cómo calmar un ataque de pánico paso a paso, qué hacer después y cuándo pedir apoyo psicológico gratis y a distancia en Venezuela. El pánico se trata.",
    url: "/recursos/ataque-de-panico-que-hacer",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/ataque-de-panico-que-hacer"
          name="Ataque de pánico: qué hacer en el momento"
          description="Un ataque de pánico asusta mucho pero pasa y no es peligroso. Qué hacer paso a paso para calmarlo, qué hacer después y cuándo pedir ayuda psicológica gratis."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Ataque de pánico: qué hacer",
              path: "/recursos/ataque-de-panico-que-hacer",
            },
          ]}
        />
        <h1>Ataque de pánico: qué hacer en el momento</h1>
        <p className="lead">
          Un ataque de pánico es una oleada repentina de miedo muy intenso, con
          síntomas físicos fuertes. Asusta muchísimo —mucha gente siente que se
          va a morir o a desmayar—, pero es importante que sepas dos cosas:
          sube, llega a un pico y baja en unos minutos, y no es peligroso aunque
          lo parezca. Aquí tienes qué hacer mientras pasa.
        </p>

        <CrisisResources variant="callout" />

        <h2>Qué es (y por qué pasa)</h2>
        <p>
          En un ataque de pánico, la “alarma” del cuerpo se dispara sin que haya
          un peligro real. Por eso aparecen el corazón acelerado, la falta de
          aire, el mareo, el hormigueo, el sudor o la sensación de irrealidad:
          es tu cuerpo preparándose para algo que en realidad no está ahí. Es
          desagradable, pero esa misma alarma se apaga sola.
        </p>

        <h2>Qué hacer en el momento</h2>
        <ul>
          <li>
            <strong>Recuerda que va a pasar.</strong> Dilo para ti: “esto es un
            ataque de pánico, no es peligroso, va a bajar”. No te estás
            muriendo.
          </li>
          <li>
            <strong>Respira lento.</strong> Inhala por la nariz contando hasta 4
            y exhala despacio hasta 6. La exhalación larga le avisa al cuerpo
            que puede calmarse.
          </li>
          <li>
            <strong>Ancla en tus sentidos.</strong> Nombra 5 cosas que ves, 4
            que tocas, 3 que oyes. Volver al presente corta la espiral.
          </li>
          <li>
            <strong>No luches contra la ola, déjala pasar.</strong> Resistirte
            la alarga. Si puedes, suelta los hombros y deja que el cuerpo haga
            su curva y baje.
          </li>
          <li>
            <strong>Quédate donde estás si puedes.</strong> Salir corriendo
            enseña al miedo que el lugar era peligroso. No lo era.
          </li>
        </ul>

        <div className="notice">
          <p>
            <strong>Importante:</strong> si es la primera vez, o tienes dolor en
            el pecho, o no estás seguro/a de que sea pánico, es prudente
            descartar una causa médica. Busca atención médica o revisa las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>.
          </p>
        </div>

        <h2>Después del ataque</h2>
        <ul>
          <li>Date un rato para recuperarte: quedas cansado/a, es normal.</li>
          <li>
            Sé amable contigo: tener un ataque de pánico no es un fracaso.
          </li>
          <li>
            Si notas qué lo desencadenó, anótalo. Ayuda a entender el patrón.
          </li>
        </ul>

        <h2>Cuándo pedir ayuda</h2>
        <p>
          Un ataque aislado puede pasar y no repetirse. Conviene hablar con un
          profesional si se vuelven frecuentes, si empiezas a evitar lugares o
          situaciones por miedo a que ocurra otro, o si te limitan la vida. El
          pánico responde muy bien al apoyo psicológico: se aprende a manejarlo.
        </p>
        <div className="reassurance">
          <p>
            En Nido, psicólogos voluntarios verificados acompañan gratis y a
            distancia en Venezuela. No necesitas crear cuenta. Si quieres, mira
            antes{" "}
            <Link href="/recursos/psicologo-online-gratis-venezuela">
              cómo hablar con un psicólogo online gratis
            </Link>
            .
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=panico">
              busca un psicólogo para el pánico
            </Link>{" "}
            y elige tú.
          </p>
        </div>

        <h2>Seguir leyendo</h2>
        <ul>
          <li>
            <Link href="/recursos/ansiedad-despues-del-terremoto">
              Ansiedad y miedo después del terremoto: qué hacer
            </Link>
            .
          </li>
          <li>
            <Link href="/recursos/depresion-senales-y-ayuda">
              Depresión: señales y cómo pedir ayuda
            </Link>
            .
          </li>
          <li>
            <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>.
          </li>
        </ul>

        <p className="hint">
          Nido no atiende emergencias ni ofrece terapia dentro de la web. Es un
          puente gratuito hacia el acompañamiento de personas voluntarias
          verificadas en Venezuela.
        </p>
      </div>
    </section>
  );
}
