import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Cómo acompañar a alguien en un mal momento",
  description:
    "Guía cálida para acompañar a un familiar, pareja o amigo que está triste, ansioso o en duelo: cómo escuchar sin juzgar, qué decir y cómo cuidarte tú.",
  alternates: { canonical: "/recursos/acompanar-a-alguien-en-crisis" },
  openGraph: {
    title:
      "Cómo acompañar a alguien que está pasando por un mal momento | Nido",
    description:
      "Guía cálida para acompañar a un familiar, pareja o amigo que está triste, ansioso o en duelo: cómo escuchar sin juzgar, qué decir y cómo cuidarte tú.",
    url: "/recursos/acompanar-a-alguien-en-crisis",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/acompanar-a-alguien-en-crisis"
          name="Cómo acompañar a alguien que está pasando por un mal momento"
          description="Guía cálida para acompañar a un familiar, pareja o amigo que está triste, ansioso o en duelo: cómo escuchar sin juzgar, qué decir y cómo cuidarte tú."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Acompañar a alguien en crisis",
              path: "/recursos/acompanar-a-alguien-en-crisis",
            },
          ]}
        />
        <h1>Cómo acompañar a alguien que está pasando por un mal momento</h1>
        <p className="lead">
          Cuando alguien que quieres está triste, con angustia, en duelo o con
          pensamientos difíciles, no hace falta tener las palabras perfectas. Lo
          que más ayuda casi siempre es tu presencia: estar, escuchar y no
          soltarle la mano. Aquí te dejamos formas sencillas de acompañar sin
          hacerte daño tú en el camino.
        </p>

        <CrisisResources variant="callout" />

        <h2>Escuchar sin juzgar</h2>
        <p>
          La mayoría de las veces, la persona no busca que le resuelvas la vida,
          sino sentir que no está sola. Acércate con calma, sin prisa por
          arreglarlo todo. Escuchar de verdad es un regalo enorme y casi
          cualquiera puede darlo.
        </p>
        <ul>
          <li>
            Pregunta con cariño y deja espacio: “¿Cómo te sientes de verdad?”,
            “Estoy aquí, cuéntame lo que necesites”.
          </li>
          <li>
            Valida lo que siente aunque tú lo verías distinto: “Tiene sentido
            que te sientas así”, “Debe ser muy duro cargar con esto”.
          </li>
          <li>
            Respeta los silencios. No tienes que llenarlos. A veces estar al
            lado, sin hablar, ya acompaña.
          </li>
          <li>
            Cuida la confianza: lo que te cuenta es suyo. No lo conviertas en
            tema de conversación con otros.
          </li>
        </ul>

        <h2>Qué decir y qué es mejor evitar</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>Frases que acompañan</h3>
            <ul>
              <li>“No estás solo, cuentas conmigo.”</li>
              <li>“Gracias por confiarme esto.”</li>
              <li>“No tienes que poder con todo de una vez.”</li>
              <li>“¿Qué te ayudaría ahora mismo?”</li>
            </ul>
          </div>
          <div className="card">
            <h3>Mejor evitar</h3>
            <ul>
              <li>“Échale ganas”, “otros están peor”.</li>
              <li>“Ya se te va a pasar” o restarle importancia.</li>
              <li>Dar consejos o sermones que nadie pidió.</li>
              <li>Comparar su dolor con el tuyo o con el de otros.</li>
            </ul>
          </div>
        </div>
        <p className="muted">
          Si dudas entre decir algo o callar, una opción honesta siempre sirve:
          “No sé bien qué decir, pero estoy aquí contigo”.
        </p>

        <h2>Cómo sugerirle pedir apoyo</h2>
        <p>
          Acompañar no es cargar tú solo con todo. Hablar con una persona
          profesional puede aliviar mucho, y tú puedes ser el puente con cariño,
          sin presionar.
        </p>
        <ul>
          <li>
            Nómbralo con suavidad: “¿Has pensado en hablar con alguien que sepa
            acompañarte en esto?”.
          </li>
          <li>
            Quítale el peso del estigma: pedir ayuda es un acto de cuidado, no
            de debilidad.
          </li>
          <li>
            Ofrécete a dar el primer paso a su lado: pueden mirar juntos los{" "}
            <Link href="/recursos">recursos disponibles</Link> sin compromiso.
          </li>
        </ul>
        <div className="reassurance">
          <p>
            En Nido conectamos gratis a personas en Venezuela con psicólogos
            voluntarios verificados, en remoto. Quien pide ayuda no necesita
            crear cuenta: solo cuenta cómo está en un formulario breve y una
            persona voluntaria le escribe para acompañarle.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo
            </Link>
          </p>
        </div>

        <h2>Señales para buscar ayuda urgente</h2>
        <p>
          Hay momentos que no pueden esperar. Si la persona habla de quitarse la
          vida, de hacerse daño o de no querer seguir, si se está poniendo en
          peligro, o si sientes que su vida corre riesgo ahora mismo, esto no es
          algo que debas resolver tú solo.
        </p>
        <div className="notice">
          <p>
            En una situación así, no la dejes sola, quédate cerca y busca ayuda
            inmediata. Revisa las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>{" "}
            para actuar cuanto antes.
          </p>
        </div>

        <h2>Cuídate tú también</h2>
        <p>
          Para sostener a alguien, tú también necesitas estar entero. Acompañar
          mucho tiempo cansa, y eso no te hace mala persona: te hace humano.
        </p>
        <ul>
          <li>
            Pon límites sanos: puedes estar sin estar disponible las 24 horas.
          </li>
          <li>
            Apóyate en otras personas de confianza; no tienes que ser el único
            sostén.
          </li>
          <li>Descansa, come y date tus pausas: cuidarte también es cuidar.</li>
          <li>
            Si te sientes desbordado, tú también puedes pedir apoyo para ti.
          </li>
        </ul>

        <h2>Seguir aprendiendo</h2>
        <p>
          Acompañar bien se aprende poco a poco. Si quieres entender mejor cómo
          funciona este apoyo o resolver dudas, puedes seguir leyendo:
        </p>
        <ul>
          <li>
            <Link href="/como-funciona">Cómo funciona Nido paso a paso</Link>.
          </li>
          <li>
            <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>.
          </li>
          <li>
            <Link href="/quienes-somos">Quiénes somos</Link>.
          </li>
          <li>
            <Link href="/recursos">Más recursos de apoyo emocional</Link>.
          </li>
        </ul>

        <p className="hint">
          Nido no atiende emergencias ni ofrece terapia dentro de la web. Es un
          puente gratuito hacia el acompañamiento de personas voluntarias
          verificadas.
        </p>
      </div>
    </section>
  );
}
