import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Ansiedad y miedo después del terremoto: qué hacer",
  description:
    "Miedo, ansiedad, insomnio o sobresaltos tras un terremoto en Venezuela son reacciones normales. Técnicas sencillas para calmarte y cuándo pedir ayuda gratis.",
  alternates: {
    canonical: "/recursos/ansiedad-despues-del-terremoto",
  },
  openGraph: {
    title: "Ansiedad y miedo después del terremoto: qué hacer | Nido",
    description:
      "Reacciones normales tras un sismo en Venezuela y técnicas sencillas para calmar la ansiedad, dormir mejor y saber cuándo pedir apoyo psicológico gratis.",
    url: "/recursos/ansiedad-despues-del-terremoto",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/ansiedad-despues-del-terremoto"
          name="Ansiedad y miedo después del terremoto: qué hacer"
          description="Miedo, ansiedad, insomnio o sobresaltos tras un terremoto en Venezuela son reacciones normales. Técnicas sencillas para calmarte y cuándo pedir ayuda gratis."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Ansiedad después del terremoto",
              path: "/recursos/ansiedad-despues-del-terremoto",
            },
          ]}
        />
        <h1>Ansiedad y miedo después del terremoto: qué hacer</h1>
        <p className="lead">
          Después de un terremoto es muy común sentir miedo, ansiedad,
          sobresaltos, insomnio o no poder dejar de revivir lo que pasó. Son
          reacciones normales ante algo que no fue normal, y para la mayoría de
          las personas mejoran con apoyo y tiempo. Aquí tienes formas sencillas
          de calmarte en los próximos días y cómo saber cuándo conviene pedir
          ayuda.
        </p>

        <CrisisResources variant="callout" />

        <h2>Lo que sientes tiene sentido</h2>
        <p>
          Tras un sismo, el cuerpo queda en alerta porque vivió un peligro real.
          No es debilidad ni exageración: es tu sistema intentando protegerte.
          Algunas reacciones frecuentes en los días y semanas siguientes:
        </p>
        <ul>
          <li>Miedo a que vuelva a temblar, sobresalto con cualquier ruido.</li>
          <li>Ansiedad, palpitaciones o sensación de falta de aire.</li>
          <li>Dificultad para dormir, pesadillas o revivir lo ocurrido.</li>
          <li>Irritabilidad, llanto fácil, sensación de estar “en guardia”.</li>
          <li>Dificultad para concentrarte o tomar decisiones.</li>
        </ul>

        <h2>Para calmar la ansiedad ahora mismo</h2>
        <p>
          Cuando la ansiedad sube, ayuda traer al cuerpo de vuelta a la calma
          con algo concreto. Prueba una de estas:
        </p>
        <ul>
          <li>
            <strong>Respiración lenta.</strong> Inhala contando hasta 4, sostén
            hasta 4 y exhala despacio hasta 6. Repite unas cuantas veces:
            alargar la exhalación ayuda a bajar la activación.
          </li>
          <li>
            <strong>Anclaje 5-4-3-2-1.</strong> Nombra 5 cosas que ves, 4 que
            puedes tocar, 3 que oyes, 2 que hueles y 1 que saboreas. Volver a
            los sentidos te trae al presente, donde ahora estás a salvo.
          </li>
          <li>
            <strong>Pies en el suelo.</strong> Siente el contacto de tus pies
            con el piso y de tu espalda con el asiento. Recuerda en voz baja:
            “esto ya pasó, ahora estoy aquí”.
          </li>
        </ul>

        <h2>En los próximos días</h2>
        <ul>
          <li>
            <strong>Rutina sencilla.</strong> Horarios más o menos fijos para
            comer, dormir y descansar dan al cuerpo una sensación de seguridad.
          </li>
          <li>
            <strong>Dosifica las noticias.</strong> Mantente informado/a, pero
            evita pasar horas viendo imágenes del sismo: alimenta el miedo.
          </li>
          <li>
            <strong>No te aísles.</strong> Hablar con personas de confianza, aun
            de cosas cotidianas, alivia. No tienes que cargar esto en silencio.
          </li>
          <li>
            <strong>Cuida el sueño.</strong> Baja la intensidad de luces y
            pantallas antes de dormir; si te despiertas en alerta, respira lento
            y recuerda dónde estás.
          </li>
          <li>
            <strong>Sé amable contigo.</strong> Estar mal unos días no significa
            que “no lo estés llevando bien”. Date tiempo.
          </li>
        </ul>

        <h2>Cómo ayudar a niñas, niños y mayores</h2>
        <p>
          Los más pequeños y las personas mayores pueden asustarse más o
          expresarlo de otra forma (rabietas, apego, silencio, molestias
          físicas). Ayuda mantener cerca a sus personas de confianza, explicar
          lo que pasa con palabras simples y honestas, y volver pronto a las
          rutinas. Si te preocupa cómo está un menor, mira la guía de{" "}
          <Link href="/recursos/ayuda-psicologica-para-ninos">
            ayuda psicológica para niñas, niños y adolescentes
          </Link>
          .
        </p>

        <h2>Cuándo pedir ayuda</h2>
        <p>
          Conviene hablar con un profesional si, pasadas unas semanas, el
          malestar no cede o te impide hacer tu vida. Presta atención a estas
          señales:
        </p>
        <ul>
          <li>El miedo o la angustia no bajan o van a más con el tiempo.</li>
          <li>No logras dormir, comer o cumplir con lo básico del día.</li>
          <li>Te aíslas, sientes desesperanza o que nada tiene sentido.</li>
          <li>Usas alcohol u otras sustancias para soportar lo que sientes.</li>
        </ul>
        <div className="notice">
          <p>
            Si aparecen pensamientos de hacerte daño o de no querer seguir, no
            estás solo/a y esto no debe esperar: mira las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>.
          </p>
        </div>

        <div className="reassurance">
          <p>
            Hablar con alguien que escucha sin juzgar ayuda a ordenar lo que
            sientes y a recuperar fuerzas. En Nido, psicólogos voluntarios
            verificados acompañan gratis y a distancia en Venezuela. No
            necesitas crear cuenta.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=ansiedad">
              busca un psicólogo para la ansiedad
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
