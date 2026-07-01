import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Estrés postraumático (TEPT): cuándo el susto no se va",
  description:
    "Cuando el miedo tras un evento difícil no cede, puede ser estrés postraumático. Señales del TEPT, qué ayuda y cómo pedir apoyo psicológico gratis.",
  alternates: { canonical: "/recursos/estres-postraumatico-tept" },
  openGraph: {
    title: "Estrés postraumático (TEPT): cuándo el susto no se va | Nido",
    description:
      "Señales del estrés postraumático tras un evento difícil, qué ayuda y cómo pedir apoyo psicológico gratis y a distancia en Venezuela. El TEPT se trata.",
    url: "/recursos/estres-postraumatico-tept",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/estres-postraumatico-tept"
          name="Estrés postraumático (TEPT): cuándo el susto no se va"
          description="Cuando el miedo tras un evento difícil no cede, puede ser estrés postraumático. Señales del TEPT, qué ayuda y cómo pedir apoyo psicológico gratis."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Estrés postraumático (TEPT)",
              path: "/recursos/estres-postraumatico-tept",
            },
          ]}
        />
        <h1>Estrés postraumático (TEPT): cuándo el susto no se va</h1>
        <p className="lead">
          Después de algo aterrador —un terremoto, un accidente, violencia o una
          pérdida violenta— es normal quedar muy afectado/a. Para la mayoría,
          esas reacciones se calman con las semanas. En algunas personas se
          quedan e interfieren con la vida: eso tiene un nombre, estrés
          postraumático (TEPT), y lo importante es que se puede tratar. No estás
          roto/a.
        </p>

        <CrisisResources variant="callout" />

        <h2>Reacciones normales y cuándo se quedan</h2>
        <p>
          En los primeros días y semanas tras un trauma, tener miedo, insomnio,
          recuerdos intrusivos o estar en alerta es una respuesta esperable (lo
          ves en la guía de{" "}
          <Link href="/recursos/ansiedad-despues-del-terremoto">
            ansiedad después del terremoto
          </Link>
          ). Se habla de estrés postraumático cuando, pasado más o menos un mes,
          esos síntomas siguen ahí, son intensos y te impiden hacer tu vida.
        </p>

        <h2>Señales del estrés postraumático</h2>
        <p>
          Si varias de estas se mantienen <strong>más de un mes</strong> y
          afectan tu día a día, conviene que lo valore un profesional:
        </p>
        <ul>
          <li>
            <strong>Revivirlo.</strong> Recuerdos que irrumpen, pesadillas o
            sentir como si volviera a pasar (flashbacks).
          </li>
          <li>
            <strong>Evitar.</strong> Esquivar lugares, personas o conversaciones
            que te lo recuerdan.
          </li>
          <li>
            <strong>Estar en guardia.</strong> Sobresaltos, irritabilidad,
            dificultad para dormir o concentrarte, sensación de peligro
            constante.
          </li>
          <li>
            <strong>Ánimo y pensamiento.</strong> Culpa, miedo, sentirte
            distante de los demás o incapaz de sentir cosas buenas.
          </li>
        </ul>
        <p className="muted">
          Esto te ayuda a orientarte, no a diagnosticarte: solo un profesional
          puede valorarlo. Si te reconoces aquí, tomarlo en serio es el primer
          paso.
        </p>

        <h2>No estás roto/a</h2>
        <p>
          El TEPT no es debilidad ni locura: es una respuesta humana a algo que
          desbordó tu capacidad de afrontarlo. Le pasa a personas fuertes y
          valientes. Y, sobre todo, se trata: con apoyo adecuado, la mayoría
          mejora.
        </p>

        <h2>Qué ayuda mientras tanto</h2>
        <ul>
          <li>
            <strong>Rutinas y seguridad.</strong> Recuperar horarios y entornos
            previsibles le devuelve al cuerpo algo de calma.
          </li>
          <li>
            <strong>Anclaje al presente.</strong> Cuando llega un recuerdo,
            recuerda dónde y cuándo estás: “eso ya pasó, ahora estoy a salvo”.
          </li>
          <li>
            <strong>No te aísles.</strong> Apóyate en personas de confianza, a
            tu ritmo. No tienes que contar nada que no quieras.
          </li>
          <li>
            <strong>No te fuerces a “revivirlo” solo/a.</strong> Procesar el
            trauma se hace mejor acompañado por un profesional.
          </li>
        </ul>

        <h2>El TEPT se trata: pide ayuda</h2>
        <p>
          El estrés postraumático responde bien al apoyo psicológico. Hablar con
          un profesional ayuda a procesar lo vivido y a recuperar tu vida. En
          Nido, psicólogos voluntarios verificados acompañan gratis y a
          distancia en Venezuela, sin que tengas que crear cuenta. Si quieres,
          mira primero{" "}
          <Link href="/recursos/psicologo-online-gratis-venezuela">
            cómo hablar con un psicólogo online gratis
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
            Pedir ayuda tras un trauma no es revivir el dolor por gusto: es
            darte la oportunidad de soltar el peso con alguien que sabe
            acompañar.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=trauma">
              busca un psicólogo con experiencia en trauma
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
            <Link href="/recursos/ataque-de-panico-que-hacer">
              Ataque de pánico: qué hacer en el momento
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
