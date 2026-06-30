import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Insomnio: cómo dormir mejor cuando la mente no para",
  description:
    "Si no puedes dormir por estrés, ansiedad o preocupaciones, hay hábitos que ayudan. Qué hacer de noche cuando la mente no para y cuándo pedir apoyo psicológico gratis.",
  alternates: { canonical: "/recursos/insomnio-como-dormir-mejor" },
  openGraph: {
    title: "Insomnio: cómo dormir mejor cuando la mente no para | Nido",
    description:
      "Hábitos de sueño que ayudan, qué hacer cuando la mente no para de noche y cuándo pedir apoyo psicológico gratis y a distancia en Venezuela.",
    url: "/recursos/insomnio-como-dormir-mejor",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/insomnio-como-dormir-mejor"
          name="Insomnio: cómo dormir mejor cuando la mente no para"
          description="Si no puedes dormir por estrés, ansiedad o preocupaciones, hay hábitos que ayudan. Qué hacer de noche cuando la mente no para y cuándo pedir apoyo psicológico gratis."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Insomnio: cómo dormir mejor",
              path: "/recursos/insomnio-como-dormir-mejor",
            },
          ]}
        />
        <h1>Insomnio: cómo dormir mejor cuando la mente no para</h1>
        <p className="lead">
          Pasar la noche dando vueltas, con la cabeza acelerada o despertándote
          de madrugada es agotador, y muy común cuando hay estrés, ansiedad,
          preocupaciones o se ha vivido algo difícil. La buena noticia: con
          algunos cambios sencillos el sueño suele mejorar. Aquí tienes por
          dónde empezar.
        </p>

        <CrisisResources variant="callout" />

        <h2>Por qué cuesta dormir</h2>
        <p>
          El sueño es de lo primero que se resiente cuando la mente está en
          alerta. Las preocupaciones, una rutina irregular, las pantallas hasta
          tarde, el exceso de café o haber vivido un susto reciente mantienen al
          cuerpo “encendido” cuando debería ir apagándose. No es falta de
          voluntad: es tu sistema intentando protegerte a destiempo.
        </p>

        <h2>Hábitos que ayudan</h2>
        <ul>
          <li>
            <strong>Horarios estables.</strong> Acuéstate y levántate a horas
            parecidas, incluso si dormiste mal. Regula tu reloj interno.
          </li>
          <li>
            <strong>Ritual de bajada.</strong> Media hora antes, baja luces y
            ritmo: lee algo tranquilo, estírate, respira lento.
          </li>
          <li>
            <strong>Menos pantallas y café.</strong> Evita el móvil en la cama y
            la cafeína por la tarde; ambos espantan el sueño.
          </li>
          <li>
            <strong>La cama, para dormir.</strong> Si la usas para trabajar o
            ver videos, tu mente deja de asociarla con descansar.
          </li>
          <li>
            <strong>Luz de día.</strong> Recibir luz natural por la mañana ayuda
            a que el cuerpo sepa cuándo toca dormir de noche.
          </li>
        </ul>

        <h2>Cuando la mente no para de noche</h2>
        <ul>
          <li>
            <strong>No te quedes peleando con el sueño.</strong> Si llevas ~20
            minutos despierto/a, levántate, haz algo calmado con poca luz y
            vuelve cuando tengas sueño.
          </li>
          <li>
            <strong>Aparca las preocupaciones.</strong> Anótalas en un papel
            “para mañana”. Sacarlas de la cabeza baja sus vueltas.
          </li>
          <li>
            <strong>Respira lento.</strong> Exhalaciones largas (inhala 4,
            exhala 6) le indican al cuerpo que puede soltar.
          </li>
          <li>
            <strong>No mires el reloj.</strong> Calcular “cuántas horas me
            quedan” aumenta la angustia y aleja el sueño.
          </li>
        </ul>

        <h2>Cuándo pedir ayuda</h2>
        <p>
          Si el insomnio se mantiene varias semanas, te afecta el día a día, o
          viene de la mano de ansiedad, tristeza o algo difícil que viviste,
          hablar con un profesional ayuda. Muchas veces el sueño mejora cuando
          se atiende lo que hay debajo. Si además el malestar emocional es
          fuerte, mira las guías de{" "}
          <Link href="/recursos/ansiedad-despues-del-terremoto">ansiedad</Link>{" "}
          y <Link href="/recursos/depresion-senales-y-ayuda">depresión</Link>.
        </p>
        <div className="reassurance">
          <p>
            En Nido, psicólogos voluntarios verificados acompañan gratis y a
            distancia en Venezuela. No necesitas crear cuenta.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo ahora
            </Link>
          </p>
          <p className="muted">
            O{" "}
            <Link href="/profesionales?q=insomnio">
              busca un psicólogo para el insomnio
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
