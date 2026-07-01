import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Burnout: agotamiento por estrés, señales y qué hacer",
  description:
    "El burnout es agotamiento por estrés sostenido del trabajo o de cuidar a otros. Cómo reconocerlo, qué ayuda a recuperarte y cómo pedir apoyo psicológico gratis.",
  alternates: { canonical: "/recursos/burnout-agotamiento-que-hacer" },
  openGraph: {
    title: "Burnout: agotamiento por estrés, señales y qué hacer | Nido",
    description:
      "Señales del burnout, qué ayuda a recuperarte del agotamiento y cómo pedir apoyo psicológico gratis y a distancia en Venezuela.",
    url: "/recursos/burnout-agotamiento-que-hacer",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/burnout-agotamiento-que-hacer"
          name="Burnout: agotamiento por estrés, señales y qué hacer"
          description="El burnout es agotamiento por estrés sostenido del trabajo o de cuidar a otros. Cómo reconocerlo, qué ayuda a recuperarte y cómo pedir apoyo psicológico gratis."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Burnout: agotamiento",
              path: "/recursos/burnout-agotamiento-que-hacer",
            },
          ]}
        />
        <h1>Burnout: agotamiento por estrés, señales y qué hacer</h1>
        <p className="lead">
          El burnout es el agotamiento que llega cuando el estrés se sostiene
          demasiado tiempo sin pausa: por el trabajo, por cuidar a otros o por
          cargar con todo. No es flojera ni falta de ganas; es un cuerpo y una
          mente que avisan que necesitan descanso. Reconocerlo a tiempo ayuda a
          recuperarte.
        </p>

        <CrisisResources variant="callout" />

        <h2>Qué es el burnout</h2>
        <p>
          Es un agotamiento profundo —emocional, físico y mental— por estrés
          prolongado, sobre todo cuando sientes que das y das sin reponer. Es
          muy común en quienes trabajan bajo presión y en quienes cuidan a otra
          persona (familiares, pacientes, o incluso acompañando a alguien que la
          está pasando mal).
        </p>

        <h2>Señales frecuentes</h2>
        <ul>
          <li>
            <strong>Agotamiento que no se va</strong> ni con el descanso normal.
          </li>
          <li>
            <strong>Distancia o cinismo:</strong> te sientes desconectado/a,
            irritable o “de piloto automático”.
          </li>
          <li>
            <strong>Sensación de no rendir</strong> ni hacer nada bien, aunque
            te esfuerces.
          </li>
          <li>
            Dolores de cabeza, tensión, insomnio o enfermarte con más facilidad.
          </li>
        </ul>

        <h2>Qué ayuda a recuperarte</h2>
        <ul>
          <li>
            <strong>Descanso de verdad.</strong> No solo dormir: también pausas
            sin pantallas ni pendientes, aunque sean cortas.
          </li>
          <li>
            <strong>Pon límites.</strong> Decir “no” o pedir ayuda no es fallar;
            es lo que te permite seguir sin romperte.
          </li>
          <li>
            <strong>Reparte la carga.</strong> Si cuidas a alguien, no tienes
            que ser el único sostén. Apóyate en otros.
          </li>
          <li>
            <strong>Recupera algo que te llene.</strong> Un rato para ti, algo
            que disfrutes, reconectar con lo que te importa.
          </li>
          <li>
            <strong>Cuida lo básico.</strong> Comer, dormir y moverte un poco
            son la base sobre la que te repones.
          </li>
        </ul>

        <h2>Cuándo pedir ayuda</h2>
        <p>
          Si el agotamiento no cede aunque descanses, o viene con tristeza
          profunda, ansiedad o desesperanza, hablar con un profesional ayuda a
          frenar antes de llegar más lejos. A veces el burnout se mezcla con
          depresión; mira también la guía de{" "}
          <Link href="/recursos/depresion-senales-y-ayuda">
            depresión: señales y cómo pedir ayuda
          </Link>
          . Y si quien se agota es porque acompaña a otra persona, la de{" "}
          <Link href="/recursos/acompanar-a-alguien-en-crisis">
            cómo acompañar sin hacerte daño tú
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
            Pedir apoyo cuando estás al límite no es rendirte: es cuidarte para
            poder seguir. En Nido, psicólogos voluntarios verificados acompañan
            gratis y a distancia en Venezuela. No necesitas crear cuenta.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=burnout">
              busca un psicólogo para el agotamiento
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
            <Link href="/recursos/estres-economico-y-salud-mental">
              Estrés económico: cómo cuidar tu salud mental
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
