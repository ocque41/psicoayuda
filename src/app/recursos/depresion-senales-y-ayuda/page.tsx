import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Depresión: señales y cómo pedir ayuda en Venezuela",
  description:
    "Cómo reconocer las señales de la depresión, qué puedes hacer hoy y cómo pedir apoyo psicológico gratis y a distancia en Venezuela. No estás solo y la depresión se trata.",
  alternates: { canonical: "/recursos/depresion-senales-y-ayuda" },
  openGraph: {
    title: "Depresión: señales y cómo pedir ayuda en Venezuela | Nido",
    description:
      "Señales frecuentes de la depresión, qué puedes hacer y cómo pedir apoyo psicológico gratis y a distancia en Venezuela. La depresión se trata y no es tu culpa.",
    url: "/recursos/depresion-senales-y-ayuda",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/depresion-senales-y-ayuda"
          name="Depresión: señales y cómo pedir ayuda en Venezuela"
          description="Cómo reconocer las señales de la depresión, qué puedes hacer hoy y cómo pedir apoyo psicológico gratis y a distancia en Venezuela. No estás solo y la depresión se trata."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Depresión: señales y ayuda",
              path: "/recursos/depresion-senales-y-ayuda",
            },
          ]}
        />
        <h1>Depresión: señales y cómo pedir ayuda en Venezuela</h1>
        <p className="lead">
          La depresión no es tristeza pasajera, debilidad ni falta de voluntad:
          es un problema de salud frecuente y que se trata. Si llevas un buen
          tiempo sintiéndote hundido/a, sin fuerzas o sin ganas de nada, esto te
          puede orientar para reconocer lo que pasa y dar un primer paso. No
          estás solo/a.
        </p>

        <CrisisResources variant="callout" />

        <h2>Qué es la depresión (y qué no)</h2>
        <p>
          Todos tenemos días bajos, y la tristeza ante una pérdida o una
          dificultad es normal. La depresión es distinta: es un malestar
          persistente que se sostiene la mayor parte del día, casi todos los
          días, durante semanas, y que afecta tu forma de pensar, dormir, comer
          y funcionar. No se quita “echándole ganas”, y por eso pedir apoyo no
          es rendirse: es cuidarte.
        </p>

        <h2>Señales frecuentes</h2>
        <p>
          Si varias de estas se mantienen durante{" "}
          <strong>dos semanas o más</strong> y te cuesta hacer tu vida, conviene
          hablar con un profesional:
        </p>
        <ul>
          <li>Ánimo bajo, tristeza o vacío casi todos los días.</li>
          <li>
            Perder el interés o el disfrute por cosas que antes te gustaban.
          </li>
          <li>Cansancio o falta de energía, todo cuesta el doble.</li>
          <li>Dormir de más o de menos; comer de más o de menos.</li>
          <li>
            Dificultad para concentrarte, decidir o recordar cosas simples.
          </li>
          <li>Sentirte inútil, culpable o que eres una carga.</li>
          <li>Irritabilidad, ganas de llorar o de aislarte de todos.</li>
        </ul>
        <p className="muted">
          Esto te ayuda a orientarte, no a diagnosticarte: solo un profesional
          puede valorar lo que te pasa. Lo importante es que, si te reconoces
          aquí, lo tomes en serio y busques apoyo.
        </p>

        <h2>No es tu culpa</h2>
        <p>
          La depresión tiene muchas causas —lo que vives, el agotamiento, las
          pérdidas, la biología— y ninguna de ellas es “falta de carácter”.
          Frases como “otros están peor” o “es cuestión de actitud” no ayudan y
          no son ciertas. Mereces apoyo igual que con cualquier otra dolencia.
        </p>

        <h2>Qué puedes hacer hoy</h2>
        <p>
          Mientras das el paso de pedir ayuda, estos gestos pequeños pueden
          sostenerte. No “curan” la depresión, pero suman:
        </p>
        <ul>
          <li>
            <strong>Un paso a la vez.</strong> Divide el día en cosas mínimas:
            levantarte, tomar agua, una ducha. Cada una cuenta.
          </li>
          <li>
            <strong>No te aísles del todo.</strong> Un mensaje a alguien de
            confianza, aunque sea corto, rompe el encierro.
          </li>
          <li>
            <strong>Muévete un poco.</strong> Una caminata breve o algo de luz
            natural ayudan al ánimo más de lo que parece.
          </li>
          <li>
            <strong>Cuida lo básico.</strong> Comer algo y horarios de sueño más
            estables le dan al cuerpo dónde apoyarse.
          </li>
          <li>
            <strong>Sé amable contigo.</strong> No te exijas rendir igual que
            siempre. Estás atravesando algo difícil.
          </li>
        </ul>

        <h2>Cómo pedir ayuda</h2>
        <p>
          Hablar con una persona profesional ayuda a entender lo que te pasa y a
          encontrar salidas. En Nido, psicólogos voluntarios verificados
          acompañan gratis y a distancia en Venezuela. No necesitas crear
          cuenta: cuentas cómo estás en un formulario breve y una persona
          voluntaria te escribe a tu correo. Si quieres, primero mira{" "}
          <Link href="/recursos/psicologo-online-gratis-venezuela">
            cómo hablar con un psicólogo online gratis
          </Link>
          .
        </p>
        <div className="notice">
          <p>
            Si tienes pensamientos de hacerte daño o de no querer seguir
            viviendo, no estás solo/a y esto no debe esperar: mira ahora las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer</Link>.
          </p>
        </div>

        <div className="reassurance">
          <p>
            La depresión se trata, y mejorar es posible. Dar el primer paso, aun
            cuando cuesta, es un acto de valentía hacia ti.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
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
            <Link href="/recursos/acompanar-a-alguien-en-crisis">
              Cómo acompañar a alguien que está pasando por un mal momento
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
