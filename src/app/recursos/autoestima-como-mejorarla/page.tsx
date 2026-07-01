import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Autoestima baja: cómo empezar a quererte mejor",
  description:
    "Si te hablas con dureza o sientes que no vales, la autoestima se puede reconstruir. Por qué baja, pasos para cuidarla y cómo pedir apoyo psicológico gratis en Venezuela.",
  alternates: { canonical: "/recursos/autoestima-como-mejorarla" },
  openGraph: {
    title: "Autoestima baja: cómo empezar a quererte mejor | Nido",
    description:
      "Por qué baja la autoestima, pasos sencillos para cuidarla y cómo pedir apoyo psicológico gratis y a distancia en Venezuela. Quererte mejor se aprende.",
    url: "/recursos/autoestima-como-mejorarla",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/autoestima-como-mejorarla"
          name="Autoestima baja: cómo empezar a quererte mejor"
          description="Si te hablas con dureza o sientes que no vales, la autoestima se puede reconstruir. Por qué baja, pasos para cuidarla y cómo pedir apoyo psicológico gratis en Venezuela."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Autoestima: cómo mejorarla",
              path: "/recursos/autoestima-como-mejorarla",
            },
          ]}
        />
        <h1>Autoestima baja: cómo empezar a quererte mejor</h1>
        <p className="lead">
          Si por dentro te hablas con dureza, te comparas todo el tiempo o
          sientes que no vales lo suficiente, no estás roto/a ni eres así “para
          siempre”. La autoestima no es algo con lo que se nace fijo: se aprende
          y se puede reconstruir, paso a paso. Aquí tienes por dónde empezar a
          tratarte con más amabilidad.
        </p>

        <CrisisResources variant="callout" />

        <h2>Qué es la autoestima</h2>
        <p>
          Es la forma en que te valoras y te tratas a ti mismo/a. Cuando está
          baja, esa voz interior se vuelve dura y exigente: nota cada error,
          ignora lo bueno y te repite que no eres suficiente. Lo importante es
          que esa voz aprendida también se puede ablandar y cambiar.
        </p>

        <h2>De dónde viene la autoestima baja</h2>
        <ul>
          <li>
            Críticas, comparaciones o exigencia excesiva, a veces desde niño/a.
          </li>
          <li>Experiencias dolorosas, rechazos o etapas muy difíciles.</li>
          <li>Compararte con vidas “ideales”, sobre todo en redes sociales.</li>
          <li>Épocas de tristeza o ansiedad, que tiñen de gris cómo te ves.</li>
        </ul>

        <h2>Pasos para cuidarla</h2>
        <ul>
          <li>
            <strong>Escucha tu voz interior.</strong> Nota cuándo te hablas con
            dureza y prueba a responderte como le hablarías a un buen amigo.
          </li>
          <li>
            <strong>Metas pequeñas y posibles.</strong> Cumplir cosas
            alcanzables le demuestra a tu mente, con hechos, que sí puedes.
          </li>
          <li>
            <strong>Reconoce lo bueno.</strong> Anota un logro o algo que
            hiciste bien al día, por pequeño que sea. Cuenta.
          </li>
          <li>
            <strong>Cuida con quién estás.</strong> Acércate a quien te trata
            con respeto y pon límites a quien te rebaja.
          </li>
          <li>
            <strong>Compara menos.</strong> Reduce el tiempo en redes si te
            dejan sintiéndote peor; ves la vida editada de otros, no la real.
          </li>
        </ul>

        <h2>Cuándo pedir ayuda</h2>
        <p>
          Si la autoestima baja viene con tristeza profunda, ansiedad o la
          sensación de que no vales nada, hablar con un profesional ayuda mucho:
          a veces detrás hay algo que se puede atender. Mira también las guías
          de <Link href="/recursos/depresion-senales-y-ayuda">depresión</Link> y{" "}
          <Link href="/recursos/ansiedad-despues-del-terremoto">ansiedad</Link>.
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
            Quererte mejor se aprende, y no tienes que hacerlo solo/a. En Nido,
            psicólogos voluntarios verificados acompañan gratis y a distancia en
            Venezuela. No necesitas crear cuenta.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=autoestima">
              busca un psicólogo para la autoestima
            </Link>{" "}
            y elige tú.
          </p>
        </div>

        <h2>Seguir leyendo</h2>
        <ul>
          <li>
            <Link href="/recursos/soledad-que-hacer">
              Soledad: qué hacer cuando te sientes solo/a
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
          Nido no atiende emergencias ni ofrece terapia dentro de la web. Es un
          puente gratuito hacia el acompañamiento de personas voluntarias
          verificadas en Venezuela.
        </p>
      </div>
    </section>
  );
}
