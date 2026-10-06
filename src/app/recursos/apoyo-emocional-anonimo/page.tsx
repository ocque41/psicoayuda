import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { GuideJsonLd } from "@/components/structured-data";

const title = "Contactar sin cuenta en Nido: privacidad y datos";
const description =
  "Qué datos se piden al contactar a un profesional, qué implica usar un alias y cuáles son los límites de privacidad y recuperación del acceso en Nido.";
const path = "/recursos/apoyo-emocional-anonimo";

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
            { name: "Contacto y privacidad", path },
          ]}
        />
        <h1>{title}</h1>
        <p className="hint">
          Equipo editorial Nido · Elaboración asistida por IA. Información de
          acceso verificada el{" "}
          <time dateTime="2026-10-06">6 de octubre de 2026</time>.
        </p>
        <p className="lead">
          Puedes contactar a un profesional desde su perfil en Nido sin crear
          una cuenta. El alias y el correo son opcionales en ese primer
          contacto. Esto no equivale a anonimato completo: el contenido de un
          mensaje, un correo o el uso de un dispositivo compartido pueden
          identificarte.
        </p>

        <h2>Qué pide el contacto desde un perfil</h2>
        <p>
          Empieza en el{" "}
          <Link href="/profesionales">directorio de profesionales</Link>. Revisa
          el perfil y utiliza su opción de contacto. Puedes elegir un alias o
          dejarlo sin completar; el correo tampoco es obligatorio para iniciar
          este recorrido. Indica el país desde el que recibirás atención para
          que el profesional pueda confirmar si puede atenderte allí.
        </p>
        <p>
          No necesitas incluir tu cédula ni tu dirección exacta en el primer
          mensaje. Comparte sólo la información que quieras comunicar para ese
          contacto. Si después acuerdas una consulta, pregunta qué datos
          adicionales necesitará el profesional y para qué.
        </p>

        <h2>Alias, confidencialidad y anonimato son cosas distintas</h2>
        <p>
          Usar un alias permite no mostrar tu nombre en el primer contacto. No
          oculta por sí solo la información que escribes, los datos técnicos
          necesarios para el servicio ni la identidad que pueda revelar tu
          correo. Tampoco determina qué documentación necesitará una consulta
          posterior.
        </p>
        <p>
          La <Link href="/privacidad">política de privacidad de Nido</Link>{" "}
          distingue los mensajes del chat, los metadatos y los formularios. El
          chat utiliza cifrado de extremo a extremo; esto no significa que toda
          la información de Nido tenga ese mismo cifrado. Datos como
          participantes, fechas y tamaño de mensajes son metadatos, y los
          formularios de solicitud o coordinación no son el chat cifrado.
        </p>
        <p>
          Antes de enviar información, revisa qué recorrido estás usando y qué
          datos solicita. Ayuda Terremoto y el contacto directo desde un perfil
          tienen formularios y condiciones distintos.
        </p>

        <h2>Cómo volver al contacto</h2>
        <p>
          El acceso sin cuenta depende de una sesión del navegador. Guardar la
          dirección de la página no sustituye esa sesión ni garantiza que puedas
          entrar desde otro dispositivo. Borrar las cookies, cambiar de
          navegador o dejar vencer la sesión puede interrumpir el acceso.
        </p>
        <p>
          Si has dejado un correo, el recorrido de{" "}
          <Link href="/acceso">recuperar acceso</Link> puede utilizarlo para
          enviarte un enlace privado de entrada. Ese enlace permite recuperar el
          acceso, pero no sustituye el código de recuperación del chat: guarda
          ese código por separado para poder leer el historial cifrado en otro
          dispositivo. Sin un correo guardado, no debes contar con la
          recuperación por correo.
        </p>
        <p>
          Mantén privados los enlaces de entrada y el código de recuperación.
          Quien obtenga los medios de acceso necesarios podría entrar a tu
          consulta. Si pierdes el código, no debes contar con que un correo o un
          enlace permitan recuperar los mensajes cifrados.
        </p>
        <p>
          En un dispositivo compartido, considera quién puede ver el navegador,
          el historial y el correo. No hay una garantía de que el uso del
          servicio pase inadvertido.
        </p>

        <h2>Contactar sin cuenta no fija el precio</h2>
        <p>
          Acuerda con el profesional la disponibilidad, la modalidad, el precio
          y las condiciones antes de reservar. El programa{" "}
          <Link href="/ayuda">Ayuda Terremoto</Link> ofrece acompañamiento
          voluntario gratuito por un recorrido separado. Puedes consultar las{" "}
          <Link href="/recursos/psicologo-online-gratis-venezuela">
            opciones gratuitas y sus límites
          </Link>
          .
        </p>
        <p className="notice">
          Nido no es un servicio de emergencia. Si hay peligro inmediato,
          contacta los servicios de emergencia del lugar donde estás.
        </p>

        <h2>Fuentes del funcionamiento descrito</h2>
        <p>
          <Link href="/como-funciona">Cómo funciona Nido</Link>,{" "}
          <Link href="/preguntas-frecuentes">preguntas frecuentes</Link> y{" "}
          <Link href="/privacidad">política de privacidad</Link>. Información
          contrastada con el funcionamiento del producto el 6 de octubre de
          2026; puede cambiar si se actualiza el servicio.
        </p>
        <p className="hint">
          Esta página explica acceso y privacidad del producto. No ofrece una
          garantía de anonimato ni una evaluación clínica.
        </p>
      </article>
    </section>
  );
}
