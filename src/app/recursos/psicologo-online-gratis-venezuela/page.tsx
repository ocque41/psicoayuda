import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { GuideJsonLd } from "@/components/structured-data";

const title = "Apoyo psicológico gratuito en Venezuela: opciones y límites";
const description =
  "Dónde buscar opciones gratuitas o de bajo costo, qué confirmar antes de solicitar atención y cómo distinguir las consultas de Nido de Ayuda Terremoto.";
const path = "/recursos/psicologo-online-gratis-venezuela";

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
            { name: "Opciones gratuitas", path },
          ]}
        />
        <h1>{title}</h1>
        <p className="hint">
          Equipo editorial Nido · Elaboración asistida por IA. Información de
          acceso verificada el{" "}
          <time dateTime="2026-10-06">6 de octubre de 2026</time>.
        </p>
        <p className="lead">
          Si buscas un psicólogo online gratis en Venezuela, comprueba qué
          servicio ofrece cada organización, a quién está dirigido y si tiene
          cupos. En Nido, las condiciones de una consulta se acuerdan con el
          profesional. Ayuda Terremoto mantiene un recorrido gratuito separado,
          sujeto a disponibilidad voluntaria.
        </p>

        <h2>Dónde buscar opciones gratuitas o de bajo costo</h2>
        <p>
          La UCAB presentó{" "}
          <a href="https://elucabista.com/2025/05/27/psicomapa-la-nueva-herramienta-de-psicodata-para-encontrar-servicios-de-salud-mental-en-venezuela/">
            PsicoMapa, un directorio de servicios de salud mental en Venezuela
          </a>
          , con opciones gratuitas o de bajo costo. La publicación institucional
          está fechada en mayo de 2025. En la verificación de esta guía no
          pudimos acceder al mapa; consulta a la institución para comprobar su
          disponibilidad actual. Contacta al centro elegido para confirmar sus
          condiciones actuales; aparecer en un directorio no garantiza
          gratuidad, modalidad online ni una cita disponible.
        </p>
        <p>
          Cuando revises un servicio, busca su canal oficial y pregunta si
          atiende en tu localidad o a distancia. La información de una
          publicación o un resultado de búsqueda puede haber cambiado.
        </p>

        <h2>Qué significa «gratis» en cada opción</h2>
        <ul>
          <li>
            Pregunta si la gratuidad cubre el primer contacto, una orientación
            puntual o todas las sesiones acordadas.
          </li>
          <li>
            Confirma los requisitos de acceso, los cupos y el tiempo de espera.
            No des por hecho que una solicitud será aceptada o respondida de
            inmediato.
          </li>
          <li>
            Comprueba si el servicio es presencial, por mensajes o por
            videollamada, y qué necesitas para utilizarlo.
          </li>
          <li>
            Si tiene un costo reducido, pide el importe, la moneda y las
            condiciones de cancelación antes de reservar.
          </li>
        </ul>

        <h2>Cómo se distinguen las opciones de Nido</h2>
        <p>
          En el <Link href="/profesionales">directorio de Nido</Link> puedes
          consultar perfiles revisados y contactar sin crear una cuenta. Esa
          revisión del perfil no garantiza un resultado ni reemplaza la
          confirmación de las condiciones de atención. Acuerda modalidad,
          disponibilidad y precio con la persona profesional antes de reservar.
        </p>
        <p>
          <Link href="/ayuda">Ayuda Terremoto</Link> es el programa separado de
          acompañamiento voluntario gratuito para personas afectadas por el
          terremoto. Su disponibilidad depende de los profesionales voluntarios.
          Solicitarlo no equivale a tener una consulta confirmada.
        </p>
        <p>
          El{" "}
          <Link href="/para-psicologos">
            software para organizar la práctica profesional
          </Link>{" "}
          tiene un plan de 10 USD al mes y una prueba de 90 días sin tarjeta,
          que comienza tras la aprobación del perfil. Ese plan corresponde a las
          herramientas del profesional; no establece el precio de sus consultas
          ni convierte toda la atención en gratuita.
        </p>

        <h2>Una pregunta útil antes de reservar</h2>
        <blockquote>
          «¿El servicio tiene costo? ¿Qué incluye, qué disponibilidad hay y
          cuáles son las condiciones para confirmar o cambiar una cita?»
        </blockquote>
        <p>
          Puedes añadir el país desde el que recibirás atención, especialmente
          si estás de viaje o en el exterior. Para revisar ese caso, consulta la{" "}
          <Link href="/recursos/venezolanos-en-el-exterior">
            guía de acceso desde el exterior
          </Link>
          .
        </p>
        <p className="notice">
          Nido no es un servicio de emergencia. Si hay peligro inmediato,
          contacta los servicios de emergencia del lugar donde estás. La página
          de <Link href="/emergencia">ayuda inmediata</Link> reúne información
          adicional.
        </p>

        <h2>Fuentes y condiciones vigentes</h2>
        <ul>
          <li>
            <a href="https://elucabista.com/2025/05/27/psicomapa-la-nueva-herramienta-de-psicodata-para-encontrar-servicios-de-salud-mental-en-venezuela/">
              UCAB: presentación de PsicoMapa
            </a>
            , publicada el 27 de mayo de 2025.
          </li>
          <li>
            <Link href="/como-funciona">Cómo funciona Nido</Link>,{" "}
            <Link href="/para-psicologos">plan profesional</Link> y{" "}
            <Link href="/ayuda">Ayuda Terremoto</Link>, comprobados el 6 de
            octubre de 2026.
          </li>
        </ul>
        <p className="hint">
          Esta página describe acceso y condiciones de servicios. No determina
          qué atención clínica necesita una persona.
        </p>
      </article>
    </section>
  );
}
