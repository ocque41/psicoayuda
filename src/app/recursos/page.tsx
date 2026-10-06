import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import {
  EmergencyPriorityBar,
  EmergencyResourcesDirectory,
} from "@/components/emergency-resources";
import { QuickExit, QuickExitNote } from "@/components/quick-exit";
import { getAbuseContactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Recursos de salud mental en Venezuela",
  description:
    "Guías de apoyo psicológico para Venezuela y venezolanos en el exterior, recursos para organizar la consulta y el programa separado Ayuda Terremoto.",
  alternates: { canonical: "/recursos" },
  openGraph: {
    title: "Recursos de salud mental en Venezuela | Nido",
    description:
      "Guías para buscar apoyo y organizar la consulta. La atención se acuerda con cada profesional; Ayuda Terremoto mantiene su recorrido gratuito separado.",
    url: "/recursos",
  },
};

export default function ResourcesPage() {
  const abuseEmail = getAbuseContactEmail();

  return (
    <section className="section">
      <div className="container">
        <QuickExit />
        <Breadcrumbs trail={[{ name: "Recursos", path: "/recursos" }]} />
        <h1>Recursos de salud mental y apoyo psicológico en Venezuela</h1>
        <p className="lead">
          Lecturas para personas que buscan apoyo en Venezuela o desde el
          exterior, y recursos para profesionales que quieren organizar su
          consulta.
        </p>

        <EmergencyPriorityBar />
        <EmergencyResourcesDirectory />

        <div className="card">
          <h2>Cómo encontrar apoyo con Nido</h2>
          <p>
            Puedes{" "}
            <Link href="/profesionales">explorar perfiles revisados</Link> y
            contactar a un profesional sin crear una cuenta. Antes de reservar,
            acuerda con esa persona la modalidad, la disponibilidad, el precio y
            las condiciones de atención. Confirma que puede atenderte en el país
            desde el que recibirás atención, también si estás de viaje.
          </p>
          <p>
            Ayuda Terremoto es un programa separado de acompañamiento voluntario
            gratuito para personas afectadas por el terremoto, según
            disponibilidad. La gratuidad del programa no describe todas las
            consultas del catálogo.
          </p>
          <p>
            <Link className="button human" href="/profesionales">
              Explorar profesionales
            </Link>{" "}
            <Link className="button secondary" href="/ayuda">
              Solicitar Ayuda Terremoto
            </Link>
          </p>
        </div>

        <div className="card">
          <h2>¿Cuándo buscar apoyo psicológico?</h2>
          <p>
            No hace falta estar en crisis para pedir ayuda. Hablar con alguien
            puede servir si te sientes con tristeza o angustia que no se va, si
            atraviesas un duelo, si el estrés o el insomnio te superan, o si
            simplemente necesitas que alguien te escuche. Pedir apoyo es un acto
            de cuidado, no de debilidad.
          </p>
        </div>

        <CrisisResources variant="full" />

        <div className="card">
          <h2>Qué hace Nido</h2>
          <p>
            Nido facilita encontrar profesionales y ofrece un espacio para
            organizar la consulta. No atiende emergencias en tiempo real. ¿Eres
            profesional de psicología?{" "}
            <Link href="/para-psicologos">Conoce el espacio profesional</Link>.
          </p>
        </div>

        <div className="card">
          <h2>Otras iniciativas de apoyo</h2>
          <p>
            <strong>Contigo</strong> es una iniciativa de acompañamiento
            emocional y psicológico gratuito con terapeutas voluntarios en
            Venezuela, surgida para apoyar a quienes viven los terremotos.
            Acompañan por WhatsApp, videollamada, llamada o en persona.
          </p>
          <p>
            <a
              className="button secondary"
              href="https://contigo-venezuela.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              data-track="aliado"
              data-track-label="Contigo Venezuela ↗"
            >
              Visitar Contigo ↗
            </a>
          </p>
        </div>

        <div className="card">
          <h2>Guías de apoyo</h2>
          <p>
            Lecturas breves y cálidas, escritas con cuidado, para distintos
            momentos.
          </p>

          <h3>Cómo te sientes</h3>
          <ul>
            <li>
              <Link href="/recursos/ansiedad-despues-del-terremoto">
                Ansiedad y miedo después del terremoto: qué hacer
              </Link>
            </li>
            <li>
              <Link href="/recursos/depresion-senales-y-ayuda">
                Depresión: señales y cómo pedir ayuda en Venezuela
              </Link>
            </li>
            <li>
              <Link href="/recursos/ataque-de-panico-que-hacer">
                Ataque de pánico: qué hacer en el momento
              </Link>
            </li>
            <li>
              <Link href="/recursos/insomnio-como-dormir-mejor">
                Insomnio: cómo dormir mejor cuando la mente no para
              </Link>
            </li>
            <li>
              <Link href="/recursos/soledad-que-hacer">
                Soledad: qué hacer cuando te sientes solo/a
              </Link>
            </li>
            <li>
              <Link href="/recursos/autoestima-como-mejorarla">
                Autoestima baja: cómo empezar a quererte mejor
              </Link>
            </li>
            <li>
              <Link href="/recursos/estres-economico-y-salud-mental">
                Estrés económico: cómo cuidar tu salud mental
              </Link>
            </li>
            <li>
              <Link href="/recursos/burnout-agotamiento-que-hacer">
                Burnout: agotamiento por estrés, señales y qué hacer
              </Link>
            </li>
            <li>
              <Link href="/recursos/estres-postraumatico-tept">
                Estrés postraumático (TEPT): cuándo el susto no se va
              </Link>
            </li>
            <li>
              <Link href="/recursos/duelo-perdida-de-un-ser-querido">
                Duelo: cómo sobrellevar la pérdida de un ser querido
              </Link>
            </li>
          </ul>

          <h3>Cómo conseguir apoyo</h3>
          <ul>
            <li>
              <Link href="/recursos/psicologo-online-gratis-venezuela">
                Psicólogo online gratis en Venezuela: cómo empezar
              </Link>
            </li>
            <li>
              <Link href="/recursos/apoyo-emocional-anonimo">
                Apoyo emocional gratis y anónimo, sin dar tu nombre
              </Link>
            </li>
          </ul>

          <h3>Acompañar y situaciones concretas</h3>
          <ul>
            <li>
              <Link href="/recursos/acompanar-a-alguien-en-crisis">
                Cómo acompañar a alguien que está pasando por un mal momento
              </Link>
            </li>
            <li>
              <Link href="/recursos/ayuda-psicologica-para-ninos">
                Ayuda psicológica gratis para niñas, niños y adolescentes
              </Link>
            </li>
            <li>
              <Link href="/recursos/venezolanos-en-el-exterior">
                Apoyo psicológico para venezolanos en el exterior
              </Link>
            </li>
          </ul>
        </div>

        <div className="card">
          <h2>Organizar tu práctica profesional</h2>
          <p>
            Guías administrativas para aclarar la agenda y las condiciones de
            cada encuentro.
          </p>
          <ul>
            <li>
              <Link href="/recursos/organizar-agenda-consulta-psicologica">
                Cómo organizar la agenda de una consulta psicológica
              </Link>
            </li>
          </ul>
          <p>
            <Link href="/para-psicologos">Conocer Nido para psicólogos</Link>
          </p>
        </div>

        <div className="card">
          <h2>Si eres menor de edad</h2>
          <p>
            También mereces ayuda y eres bienvenido/a. Pedir apoyo no te mete en
            problemas. Si puedes, busca a una persona adulta de confianza que te
            acompañe. Y si estás en peligro ahora mismo, mira las{" "}
            <Link href="/emergencia">líneas de ayuda inmediata</Link>: algunas
            atienden especialmente a niñas, niños y adolescentes.
          </p>
        </div>

        <div className="card">
          <h2>Reportar abuso</h2>
          <p>
            Para reportar abuso, uso indebido o una conducta insegura, escribe
            a: <a href={`mailto:${abuseEmail}`}>{abuseEmail}</a>.
          </p>
        </div>

        <QuickExitNote />
      </div>
    </section>
  );
}
