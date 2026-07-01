import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Estrés económico: cómo cuidar tu salud mental",
  description:
    "Cuando el dinero no alcanza, la mente se cansa. Cómo sostener tu salud mental ante el estrés económico en Venezuela y dónde pedir apoyo psicológico gratis.",
  alternates: { canonical: "/recursos/estres-economico-y-salud-mental" },
  openGraph: {
    title: "Estrés económico: cómo cuidar tu salud mental | Nido",
    description:
      "El peso de las preocupaciones de dinero en la mente, formas de sostenerte y dónde pedir apoyo psicológico gratis y a distancia en Venezuela.",
    url: "/recursos/estres-economico-y-salud-mental",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/estres-economico-y-salud-mental"
          name="Estrés económico: cómo cuidar tu salud mental"
          description="Cuando el dinero no alcanza, la mente se cansa. Cómo sostener tu salud mental ante el estrés económico en Venezuela y dónde pedir apoyo psicológico gratis."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Estrés económico y salud mental",
              path: "/recursos/estres-economico-y-salud-mental",
            },
          ]}
        />
        <h1>
          Estrés económico: cómo cuidar tu salud mental cuando el dinero no
          alcanza
        </h1>
        <p className="lead">
          Las preocupaciones de dinero no solo cansan el bolsillo: pesan en la
          mente y en el cuerpo. Si vives con esa tensión constante por llegar a
          fin de mes, sostener a tu familia o un futuro incierto, lo que sientes
          tiene una explicación y no es debilidad. Esta guía es sobre cuidar tu
          ánimo —no sobre finanzas— y dónde apoyarte gratis.
        </p>

        <CrisisResources variant="callout" />

        <h2>El estrés económico afecta la mente</h2>
        <p>
          Vivir con la cuenta siempre ajustada mantiene al cuerpo en alerta,
          como si hubiera un peligro permanente. Por eso es tan común sentir:
        </p>
        <ul>
          <li>Ansiedad, tensión o un nudo que no se afloja.</li>
          <li>Insomnio o despertar de madrugada pensando en cuentas.</li>
          <li>Irritabilidad y roces más frecuentes con la familia.</li>
          <li>Desánimo, vergüenza o sensación de estar fallando.</li>
          <li>Agotamiento de cargar con todo sin descanso.</li>
        </ul>

        <h2>No es tu culpa</h2>
        <p>
          Que el dinero no alcance depende de muchísimas cosas que están fuera
          de tu control —la economía, los precios, las circunstancias—, no de tu
          valor como persona ni de “no esforzarte”. Cargas con un peso enorme y
          aun así sigues. Tratarte con dureza solo añade sufrimiento; tratarte
          con algo de compasión te deja fuerzas para seguir.
        </p>

        <h2>Cómo sostenerte mientras tanto</h2>
        <p>
          Esto no resuelve lo económico, pero ayuda a que la mente no se hunda
          con ello:
        </p>
        <ul>
          <li>
            <strong>Separa lo que puedes y lo que no controlas.</strong> Pon tu
            energía en el siguiente paso pequeño y concreto; soltar lo que no
            está en tus manos baja la angustia.
          </li>
          <li>
            <strong>Dosifica las malas noticias.</strong> Estar todo el día
            mirando precios o noticias del país alimenta la ansiedad. Infórmate,
            pero con límites.
          </li>
          <li>
            <strong>No lo cargues en silencio.</strong> Hablarlo con alguien de
            confianza alivia y, a veces, abre soluciones o apoyos que no veías.
          </li>
          <li>
            <strong>Apóyate en la comunidad.</strong> Las redes de apoyo mutuo,
            la familia y los vecinos sostienen más de lo que parece en tiempos
            difíciles.
          </li>
          <li>
            <strong>Protege lo básico.</strong> Dormir, comer algo y un momento
            de respiro al día no son lujos: son lo que te mantiene en pie.
          </li>
        </ul>

        <h2>Cuando el peso es demasiado</h2>
        <p>
          Si la preocupación por el dinero te quita el sueño todo el tiempo, te
          paraliza, o te trae desesperanza o tristeza profunda, hablar con un
          profesional ayuda. No te dará dinero, pero sí herramientas para que el
          estrés no te gane y para sostenerte. Mira también las guías de{" "}
          <Link href="/recursos/ansiedad-despues-del-terremoto">ansiedad</Link>{" "}
          y <Link href="/recursos/depresion-senales-y-ayuda">depresión</Link>.
        </p>
        <div className="notice">
          <p>
            Si aparecen pensamientos de hacerte daño o de no querer seguir, no
            estás solo/a y no debe esperar: mira las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>.
          </p>
        </div>

        <div className="reassurance">
          <p>
            En Nido, psicólogos voluntarios verificados acompañan gratis y a
            distancia en Venezuela. No necesitas crear cuenta ni pagar nada: el
            apoyo es sin coste.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=estrés">
              busca un psicólogo para el estrés
            </Link>{" "}
            y elige tú.
          </p>
        </div>

        <h2>Seguir leyendo</h2>
        <ul>
          <li>
            <Link href="/recursos/insomnio-como-dormir-mejor">
              Insomnio: cómo dormir mejor cuando la mente no para
            </Link>
            .
          </li>
          <li>
            <Link href="/recursos/psicologo-online-gratis-venezuela">
              Psicólogo online gratis en Venezuela: cómo empezar
            </Link>
            .
          </li>
          <li>
            <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>.
          </li>
        </ul>

        <p className="hint">
          Nido no atiende emergencias ni ofrece terapia dentro de la web, y no
          da asesoría financiera. Es un puente gratuito hacia el acompañamiento
          emocional de personas voluntarias verificadas en Venezuela.
        </p>
      </div>
    </section>
  );
}
