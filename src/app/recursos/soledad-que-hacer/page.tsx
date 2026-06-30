import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Soledad: qué hacer cuando te sientes solo/a",
  description:
    "Sentirte solo/a duele y es más común de lo que crees. Por qué pasa, pasos pequeños para reconectar y cuándo pedir apoyo psicológico gratis y a distancia en Venezuela.",
  alternates: { canonical: "/recursos/soledad-que-hacer" },
  openGraph: {
    title: "Soledad: qué hacer cuando te sientes solo/a | Nido",
    description:
      "Por qué te puedes sentir solo/a, pasos pequeños para reconectar y cuándo pedir apoyo psicológico gratis y a distancia en Venezuela.",
    url: "/recursos/soledad-que-hacer",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/soledad-que-hacer"
          name="Soledad: qué hacer cuando te sientes solo/a"
          description="Sentirte solo/a duele y es más común de lo que crees. Por qué pasa, pasos pequeños para reconectar y cuándo pedir apoyo psicológico gratis y a distancia en Venezuela."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Soledad: qué hacer",
              path: "/recursos/soledad-que-hacer",
            },
          ]}
        />
        <h1>Soledad: qué hacer cuando te sientes solo/a</h1>
        <p className="lead">
          Sentirte solo/a duele, y es mucho más común de lo que parece: le pasa
          a personas de todas las edades y situaciones. No es un defecto tuyo ni
          significa que “algo está mal contigo”. Es una señal de que necesitas
          conexión, y la conexión se puede reconstruir, paso a paso. No estás
          tan solo/a como ahora sientes.
        </p>

        <CrisisResources variant="callout" />

        <h2>Estar solo/a no es lo mismo que sentirse solo/a</h2>
        <p>
          Puedes estar rodeado de gente y aun así sentir un vacío, o vivir con
          poca compañía y sentirte en paz. La soledad que duele tiene que ver
          con la <strong>falta de conexión</strong> —de sentirte visto,
          escuchado y acompañado—, no con cuántas personas tienes alrededor. Por
          eso la salida no es “tener más gente”, sino encuentros que de verdad
          te lleguen.
        </p>

        <h2>Por qué te puedes sentir así</h2>
        <ul>
          <li>Una mudanza, la migración o la distancia de los tuyos.</li>
          <li>Una pérdida, una ruptura o un cambio grande de vida.</li>
          <li>Épocas de mucho estrés, tristeza o ansiedad, que aíslan.</li>
          <li>Vergüenza o miedo a molestar, que frenan el acercarse.</li>
        </ul>

        <h2>Pasos pequeños para reconectar</h2>
        <ul>
          <li>
            <strong>Empieza por una persona.</strong> Un mensaje corto a alguien
            de confianza ya rompe el aislamiento. No tiene que ser profundo.
          </li>
          <li>
            <strong>Contacto pequeño y seguido.</strong> Saludar a un vecino,
            una llamada breve, un audio. La cercanía se construye en lo
            cotidiano.
          </li>
          <li>
            <strong>Compartir una actividad.</strong> Un grupo, un voluntariado,
            algo que te guste: conectar “haciendo” pesa menos que “de frente”.
          </li>
          <li>
            <strong>Usa lo digital a tu favor.</strong> Si estás lejos, una
            videollamada con los tuyos sostiene el vínculo de verdad.
          </li>
          <li>
            <strong>Sé paciente y amable contigo.</strong> Reconectar lleva
            tiempo; cada pequeño paso cuenta, aunque cueste.
          </li>
        </ul>

        <h2>Cuando la soledad pesa demasiado</h2>
        <p>
          Si la soledad se vuelve constante, te trae desesperanza o se mezcla
          con tristeza profunda y ganas de aislarte de todo, hablar con un
          profesional ayuda. A veces detrás hay una depresión que se puede
          atender; mira la guía de{" "}
          <Link href="/recursos/depresion-senales-y-ayuda">
            depresión: señales y cómo pedir ayuda
          </Link>
          . Y si estás lejos de Venezuela, la de{" "}
          <Link href="/recursos/venezolanos-en-el-exterior">
            apoyo para venezolanos en el exterior
          </Link>
          .
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
            Hablar con alguien que escucha sin juzgar alivia y ayuda a tejer de
            nuevo el vínculo. En Nido, psicólogos voluntarios verificados
            acompañan gratis y a distancia en Venezuela. No necesitas crear
            cuenta.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=soledad">
              busca un psicólogo para la soledad
            </Link>{" "}
            y elige tú.
          </p>
        </div>

        <h2>Seguir leyendo</h2>
        <ul>
          <li>
            <Link href="/recursos/psicologo-online-gratis-venezuela">
              Psicólogo online gratis en Venezuela: cómo empezar
            </Link>
            .
          </li>
          <li>
            <Link href="/recursos/duelo-perdida-de-un-ser-querido">
              Duelo: cómo sobrellevar la pérdida de un ser querido
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
