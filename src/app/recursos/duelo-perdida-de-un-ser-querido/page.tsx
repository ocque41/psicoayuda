import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";

export const metadata: Metadata = {
  title: "Duelo: cómo sobrellevar la pérdida de un ser querido",
  description:
    "Perder a alguien que amas duele de formas difíciles de explicar. Qué es normal en el duelo, cómo sobrellevarlo y cuándo pedir apoyo psicológico gratis en Venezuela.",
  alternates: {
    canonical: "/recursos/duelo-perdida-de-un-ser-querido",
  },
  openGraph: {
    title: "Duelo: cómo sobrellevar la pérdida de un ser querido | Nido",
    description:
      "Qué es normal sentir en el duelo, formas suaves de sobrellevar la pérdida y cuándo pedir apoyo psicológico gratis y a distancia en Venezuela.",
    url: "/recursos/duelo-perdida-de-un-ser-querido",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Duelo por la pérdida de un ser querido",
              path: "/recursos/duelo-perdida-de-un-ser-querido",
            },
          ]}
        />
        <h1>Duelo: cómo sobrellevar la pérdida de un ser querido</h1>
        <p className="lead">
          Perder a alguien que amas deja un vacío que no se llena con palabras.
          El duelo es la forma en que el cariño aprende a vivir con la ausencia,
          y no hay una manera “correcta” ni un plazo para atravesarlo. Aquí te
          contamos qué suele ser normal, cómo cuidarte mientras duele y cuándo
          conviene pedir apoyo.
        </p>

        <CrisisResources variant="callout" />

        <h2>El duelo no es una línea recta</h2>
        <p>
          No existen “etapas” fijas que haya que cumplir en orden. El duelo
          viene en olas: hay días en que respiras y otros en que la pena vuelve
          con fuerza, a veces por un olor, una canción o una fecha. Eso no es
          retroceder: es parte del proceso. Cada persona lo vive a su ritmo y de
          su manera.
        </p>
        <p>Es común sentir, en distintos momentos:</p>
        <ul>
          <li>Tristeza profunda, llanto o, a ratos, una extraña calma.</li>
          <li>Rabia, culpa o pensar una y otra vez en “lo que pude hacer”.</li>
          <li>Cansancio, falta de apetito o dificultad para dormir.</li>
          <li>Sensación de irrealidad, o de seguir esperando a la persona.</li>
          <li>Alivio, si hubo una enfermedad larga: también es válido.</li>
        </ul>

        <h2>Formas suaves de sobrellevarlo</h2>
        <ul>
          <li>
            <strong>Date permiso para sentir.</strong> No tienes que ser fuerte
            todo el tiempo ni “superarlo” rápido. Llorar no es debilidad.
          </li>
          <li>
            <strong>Cuida lo básico.</strong> Comer algo, hidratarte y descansar
            sostienen al cuerpo cuando el ánimo no puede. Pasos pequeños.
          </li>
          <li>
            <strong>Apóyate en quien te quiere.</strong> Acepta compañía y ayuda
            concreta. No tienes que cargar la pena en silencio.
          </li>
          <li>
            <strong>Dale un lugar al recuerdo.</strong> Hablar de la persona,
            escribirle, mirar fotos o mantener un pequeño ritual ayuda a
            despedirte a tu manera.
          </li>
          <li>
            <strong>Respeta tus tiempos.</strong> No te exijas decisiones
            grandes ni “volver a la normalidad” antes de tiempo.
          </li>
        </ul>

        <h2>Cómo acompañar a alguien en duelo</h2>
        <p>
          Si quien sufre la pérdida es otra persona, lo que más ayuda casi
          siempre es tu presencia: estar, escuchar y no apurar su proceso. Evita
          frases como “ya tenía su edad” o “tienes que ser fuerte”. Mejor:
          “estoy aquí”, “cuéntame de él/ella”. Tienes más ideas en la guía de{" "}
          <Link href="/recursos/acompanar-a-alguien-en-crisis">
            cómo acompañar a alguien que está pasando por un mal momento
          </Link>
          .
        </p>

        <h2>Cuándo pedir ayuda profesional</h2>
        <p>
          El dolor del duelo suele ir cambiando con el tiempo, aunque no
          desaparezca del todo. Conviene buscar apoyo si, pasados varios meses,
          el sufrimiento sigue igual de intenso y te impide vivir, o si notas:
        </p>
        <ul>
          <li>Que no logras retomar nada de tu vida cotidiana ni cuidarte.</li>
          <li>Aislamiento total, desesperanza o sentir que nada importa.</li>
          <li>
            Culpa que te aplasta o la idea de que no mereces seguir adelante.
          </li>
        </ul>
        <div className="notice">
          <p>
            Si aparecen pensamientos de hacerte daño o de no querer seguir
            viviendo, no estás solo/a y no debe esperar: mira las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>.
          </p>
        </div>

        <div className="reassurance">
          <p>
            Hablar de tu pérdida con alguien que escucha sin juzgar puede
            aliviar el peso y ayudarte a encontrar tu manera de seguir. En Nido,
            psicólogos voluntarios verificados acompañan gratis y a distancia en
            Venezuela. No necesitas crear cuenta.
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
            <Link href="/recursos/psicologo-online-gratis-venezuela">
              Psicólogo online gratis en Venezuela: cómo empezar
            </Link>
            .
          </li>
          <li>
            <Link href="/recursos/ansiedad-despues-del-terremoto">
              Ansiedad y miedo después del terremoto: qué hacer
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
