import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";

export const metadata: Metadata = {
  title:
    "Ayuda psicológica gratis para niñas, niños y adolescentes en Venezuela",
  description:
    "Cómo conseguir apoyo psicológico gratuito y a distancia en Venezuela para adolescentes y para madres, padres y cuidadores. Sin estigma y con acompañamiento de un adulto de confianza.",
  alternates: { canonical: "/recursos/ayuda-psicologica-para-ninos" },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Ayuda para niños y adolescentes",
              path: "/recursos/ayuda-psicologica-para-ninos",
            },
          ]}
        />
        <h1>
          Ayuda psicológica gratis para niñas, niños y adolescentes en Venezuela
        </h1>
        <p className="lead">
          Si eres adolescente y la estás pasando mal, o si eres mamá, papá o
          cuidas a alguien que está sufriendo, aquí te contamos cómo buscar
          apoyo psicológico gratuito y a distancia. Pedir ayuda es válido y es
          un acto de valentía.
        </p>

        <CrisisResources variant="callout" />

        <div className="card">
          <h2>Si eres adolescente</h2>
          <p>
            Sentir tristeza que no se va, angustia, miedo, rabia o ganas de
            aislarte no significa que estés exagerando ni que algo esté mal
            contigo. Son señales de que algo te pesa y de que mereces apoyo.
            Hablar con alguien que sepa escuchar puede ayudarte a entender lo
            que sientes y a sentirte menos solo o sola.
          </p>
          <p>
            Cuando puedas, apóyate en una persona adulta de confianza: tu mamá,
            tu papá, un familiar, una maestra, un profesor o alguien del centro
            de salud. No tienes que cargar esto a solas, y contarlo no te mete
            en problemas.
          </p>
          <p className="reassurance">
            No hace falta tener una razón grande para pedir ayuda. Si sientes
            que la necesitas, eso ya es suficiente.
          </p>
        </div>

        <div className="card">
          <h2>Si eres madre, padre o cuidador</h2>
          <p>
            A veces cuesta saber si lo que vive un hijo o hija es parte de
            crecer o algo que necesita acompañamiento. Vale la pena prestar
            atención cuando notas cambios que se sostienen en el tiempo:
          </p>
          <ul>
            <li>Tristeza, irritabilidad o llanto frecuente sin causa clara.</li>
            <li>
              Aislamiento: deja de ver amistades o de hacer lo que disfrutaba.
            </li>
            <li>
              Cambios fuertes en el sueño, el apetito o el rendimiento escolar.
            </li>
            <li>
              Quejas físicas seguidas (dolores de cabeza, de estómago) sin causa
              médica.
            </li>
            <li>Comentarios sobre no querer estar o sentirse una carga.</li>
          </ul>
          <p>
            Lo más importante es acercarte sin juzgar. Escuchar con calma,
            validar lo que siente y hacerle saber que no está solo o sola abre
            la puerta a que se deje acompañar. Buscar apoyo profesional no es
            señal de que lo estés haciendo mal: es una forma de cuidar.
          </p>
        </div>

        <div className="card">
          <h2>Cómo pedir apoyo con Nido</h2>
          <p>
            Nido es una organización sin fines de lucro que conecta, de forma
            gratuita, a personas en Venezuela con psicólogos voluntarios
            verificados que acompañan a distancia. No cobramos, no hace falta
            crear una cuenta y no pedimos tu ubicación.
          </p>
          <ol className="steps">
            <li>Cuentas cómo te sientes en un formulario breve y sencillo.</li>
            <li>
              Una persona voluntaria verificada revisa tu mensaje con cuidado.
            </li>
            <li>
              Te escribe a tu correo para acompañarte a distancia, sin coste.
            </li>
          </ol>
          <p>
            Si eres adolescente, lo ideal es que una persona adulta de confianza
            te acompañe en este paso. Y si cuidas a una niña, niño o
            adolescente, puedes pedir orientación tú mismo o tú misma.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Pedir apoyo
            </Link>
          </p>
          <p className="hint">
            El manejo formal de solicitudes de personas menores de edad está
            pendiente de revisión legal. Mientras tanto, lo más seguro es que un
            adulto de confianza acompañe el proceso.
          </p>
        </div>

        <div className="notice">
          <p>
            Nido es acompañamiento, no es un servicio de emergencia y no atiende
            en tiempo real. Si hay peligro inmediato para una niña, niño o
            adolescente, no esperes: mira las{" "}
            <Link href="/emergencia">líneas de ayuda inmediata</Link>, donde hay
            recursos que atienden especialmente a la niñez y la adolescencia.
          </p>
        </div>

        <div className="card">
          <h2>Preguntas frecuentes</h2>
          <div className="faq">
            <h3>¿Pedir ayuda me mete en problemas?</h3>
            <p>
              No. Buscar apoyo es algo bueno y cuidarse no tiene nada de malo.
              Hablar de lo que sientes es un derecho, no un castigo.
            </p>
            <h3>¿Tengo que crear una cuenta?</h3>
            <p>
              No. Quien pide apoyo no necesita registrarse. Solo cuentas cómo
              estás y dejas un correo para que te puedan responder.
            </p>
            <h3>¿Nido da terapia por chat o videollamada?</h3>
            <p>
              Nido conecta con profesionales voluntarios que acompañan a
              distancia. Hay un chat privado para conocerse y hablar, pero no es
              terapia continua ni videollamadas, ni hay respuestas automáticas.
            </p>
          </div>
        </div>

        <div className="card">
          <h2>Seguir explorando</h2>
          <ul>
            <li>
              <Link href="/como-funciona">Cómo funciona Nido</Link>
            </li>
            <li>
              <Link href="/recursos">
                Recursos de salud mental en Venezuela
              </Link>
            </li>
            <li>
              <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>
            </li>
            <li>
              <Link href="/quienes-somos">Quiénes somos</Link>
            </li>
            <li>
              <Link href="/emergencia">Líneas de ayuda inmediata</Link>
            </li>
          </ul>
          <p className="muted">
            Cuando estés listo o lista, da el paso. Acompañarte es justo lo que
            estamos aquí para hacer.
          </p>
        </div>
      </div>
    </section>
  );
}
