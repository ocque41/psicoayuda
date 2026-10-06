import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { GuideJsonLd } from "@/components/structured-data";

const title = "Apoyo psicológico para venezolanos en el exterior";
const description =
  "Qué confirmar para contactar a un profesional desde el exterior: país de atención, disponibilidad, horarios, costos y privacidad. Sin prometer cobertura mundial.";
const path = "/recursos/venezolanos-en-el-exterior";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: path },
  openGraph: { title: `${title} | Nido`, description, url: path },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Nido`,
    description,
  },
};

export default function Page() {
  return (
    <section className="section">
      <article className="container" style={{ maxWidth: "760px" }}>
        <GuideJsonLd
          path={path}
          name={title}
          description={description}
          contentType="WebPage"
          modifiedAt="2026-10-06"
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            { name: "Venezolanos en el exterior", path },
          ]}
        />
        <h1>{title}</h1>
        <p className="hint">
          Equipo editorial Nido · Elaboración asistida por IA. Información de
          acceso verificada el{" "}
          <time dateTime="2026-10-06">6 de octubre de 2026</time>.
        </p>
        <p className="lead">
          Si estás fuera de Venezuela y buscas atención en español, indica el
          país desde el que recibirás la consulta y confirma con el profesional
          si puede atenderte allí. Encontrar un perfil o una hora disponible no
          garantiza cobertura en cualquier país, una consulta gratuita ni una
          cita confirmada.
        </p>

        <h2>Empieza por el país donde estarás</h2>
        <p>
          Puedes explorar el{" "}
          <Link href="/profesionales">directorio de Nido</Link> y contactar
          desde un perfil sin crear una cuenta. En el mensaje inicial, menciona
          el país donde estarás durante la atención, incluso si estás de viaje.
          La disponibilidad y las condiciones deben confirmarse con el
          profesional antes de reservar.
        </p>
        <p>
          Si cambias de país entre encuentros, comunícalo antes de la siguiente
          cita. No basta con que ambos hablen español o con que el profesional
          tenga un perfil revisado en Nido para dar por confirmada la atención
          desde tu ubicación.
        </p>

        <h2>Qué acordar antes de una consulta</h2>
        <ul>
          <li>
            <strong>Disponibilidad:</strong> pregunta si el profesional recibe
            nuevas consultas y desde qué países puede atender.
          </li>
          <li>
            <strong>Modalidad:</strong> confirma cómo será el encuentro y qué
            conexión o dispositivo necesitas.
          </li>
          <li>
            <strong>Fecha y hora:</strong> deja por escrito la fecha y la zona
            horaria de ambos. Una diferencia horaria puede cambiar en otra
            fecha.
          </li>
          <li>
            <strong>Importe y moneda:</strong> pide el precio de la consulta, el
            método acordado y las condiciones de cambio o cancelación.
          </li>
          <li>
            <strong>Datos y privacidad:</strong> pregunta qué información se
            necesita para empezar y cómo se gestionará.
          </li>
        </ul>
        <p>
          Puedes escribir: «Estaré en [país] durante la consulta. ¿Puedes
          atenderme desde allí? ¿Qué modalidad, horario, precio y condiciones
          debemos confirmar?».
        </p>

        <h2>Costos y programa gratuito</h2>
        <p>
          La consulta se acuerda con cada profesional. El plan de software de
          Nido para organizar la práctica tiene un precio distinto y no
          establece el precio que paga quien consulta. Revisa las condiciones en{" "}
          <Link href="/como-funciona">cómo funciona Nido</Link>.
        </p>
        <p>
          <Link href="/ayuda">Ayuda Terremoto</Link> es el programa separado de
          acompañamiento voluntario gratuito para personas afectadas por el
          terremoto. Pregunta por sus condiciones y disponibilidad; no supongas
          que cubre cualquier solicitud desde el exterior.
        </p>

        <h2>Otras fuentes según tu situación</h2>
        <p>
          Si buscas información relacionada con desplazamiento, refugio o asilo,{" "}
          <a href="https://help.unhcr.org/global/es/buscando-ayuda-con-acnur/">
            ACNUR Help permite consultar información y contactos por país
          </a>
          . Comprueba la página del lugar donde estás y los requisitos del
          servicio correspondiente. Este enlace no garantiza una consulta
          psicológica ni que cualquier persona pueda acceder a todos los
          programas.
        </p>
        <p>
          Para información de acceso al sistema local de salud, consulta los
          canales oficiales del país donde resides. Las condiciones y los
          servicios disponibles cambian entre lugares.
        </p>

        <h2>Cuida el acceso al contacto</h2>
        <p>
          Contactar sin cuenta no equivale a anonimato completo ni garantiza
          acceso permanente. Revisa la{" "}
          <Link href="/recursos/apoyo-emocional-anonimo">
            guía de contacto, privacidad y recuperación
          </Link>{" "}
          antes de cambiar de navegador o dispositivo. Guarda de forma privada
          cualquier enlace o código de acceso.
        </p>
        <p className="notice">
          Nido no es un servicio de emergencia. Si hay peligro inmediato,
          contacta los servicios de emergencia del país donde estás; una línea
          de otro país puede no servir desde tu ubicación.
        </p>

        <h2>Fuentes y fecha de verificación</h2>
        <ul>
          <li>
            <Link href="/como-funciona">Cómo funciona Nido</Link>,{" "}
            <Link href="/preguntas-frecuentes">preguntas frecuentes</Link> y{" "}
            <Link href="/privacidad">privacidad</Link>.
          </li>
          <li>
            <a href="https://help.unhcr.org/global/es/buscando-ayuda-con-acnur/">
              ACNUR: buscando ayuda y contactos por país
            </a>
            .
          </li>
        </ul>
        <p className="hint">
          Fuentes comprobadas el 6 de octubre de 2026. Esta guía trata de acceso
          y coordinación; no evalúa necesidades clínicas ni certifica
          habilitación profesional para un país.
        </p>
      </article>
    </section>
  );
}
