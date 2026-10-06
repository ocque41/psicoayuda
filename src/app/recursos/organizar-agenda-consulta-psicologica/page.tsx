import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";

const description =
  "Organiza citas, zonas horarias, cambios y condiciones de consulta. Incluye una plantilla de confirmación y pautas para calendarios externos.";
export const metadata: Metadata = {
  title: "Cómo organizar la agenda de una consulta psicológica",
  description,
  alternates: { canonical: "/recursos/organizar-agenda-consulta-psicologica" },
  openGraph: {
    title: "Cómo organizar la agenda de una consulta psicológica | Nido",
    description,
    url: "/recursos/organizar-agenda-consulta-psicologica",
  },
};

export default function Page() {
  return (
    <section className="section">
      <article className="container" style={{ maxWidth: "760px" }}>
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Organizar la agenda",
              path: "/recursos/organizar-agenda-consulta-psicologica",
            },
          ]}
        />
        <h1>
          Cómo organizar la agenda de una consulta psicológica: horarios,
          cambios de cita y condiciones
        </h1>
        <p className="hint">
          Equipo editorial Nido · Elaboración asistida por IA. Fuentes y
          ejemplos horarios verificados el{" "}
          <time dateTime="2026-10-06">6 de octubre de 2026</time>.
        </p>
        <p className="lead">
          Para organizar tu agenda, elige un registro principal de citas,
          configura la zona horaria de cada encuentro y confirma por escrito
          fecha, hora, duración, importe, moneda y condiciones de cambio. Cuando
          reprogramas, actualiza ese registro y vuelve a confirmar. Así puedes
          consultar qué está acordado sin reconstruirlo entre varios mensajes.
        </p>
        <p>
          Esta guía está dirigida a psicólogos que organizan su práctica en
          Venezuela o coordinan citas con venezolanos en el exterior. Los
          ejemplos son ficticios y se refieren a organización administrativa.
        </p>
        <h2>1. Decide dónde queda la cita vigente</h2>
        <p>
          Puedes recibir una solicitud por distintos medios, pero necesitas un
          lugar donde quede el horario definitivo. Escoge una agenda principal y
          usa los mensajes para acordar cambios; después, refleja el acuerdo en
          esa agenda.
        </p>
        <p>
          Distingue tres situaciones: una hora que estás proponiendo, una cita
          confirmada por ambas partes y una cita cancelada. Una propuesta
          pendiente no debe parecer una cita confirmada. Si retienes un horario
          mientras esperas respuesta, aclara cuánto tiempo lo reservas y qué
          ocurre si no recibes confirmación.
        </p>
        <p>
          Antes de ofrecer horas, bloquea los periodos que ya están ocupados,
          los descansos y el tiempo administrativo que necesitas. La duración de
          una sesión y el intervalo entre sesiones son decisiones de tu
          práctica; esta guía no fija una duración clínica adecuada.
        </p>
        <p>
          <strong>Ejemplo ficticio:</strong> un servicio configurado con 50
          minutos de duración y un intervalo administrativo de 10 minutos ocupa
          de 15:00 a 16:00 en la agenda, aunque la sesión termine a las 15:50.
          El intervalo no se añade al tiempo de atención prometido ni al importe
          sin haberlo acordado.
        </p>
        <h2>2. Confirma la zona horaria, especialmente entre países</h2>
        <p>
          «El jueves a las tres» puede significar horas distintas para dos
          personas. Anota la fecha completa y la hora que corresponde a cada
          ubicación.
        </p>
        <p>
          Una zona horaria identificada por ciudad, como{" "}
          <code>America/Caracas</code> o <code>Europe/Madrid</code>, contiene
          reglas sobre sus cambios de hora. Un desfase como UTC−04:00 solo
          indica una diferencia respecto de UTC. No describe por sí solo todos
          los cambios de una ubicación. La{" "}
          <a href="https://www.iana.org/time-zones">
            base de zonas horarias de IANA
          </a>{" "}
          se actualiza cuando cambian esas reglas.
        </p>
        <p>
          Según los datos consultados el 6 de octubre de 2026, Caracas usa
          UTC−04:00 sin cambio estacional. Madrid cambia entre UTC+01:00 y
          UTC+02:00. Estas reglas permiten calcular el siguiente ejemplo; no
          convierten la diferencia entre países en una cifra permanente.
          Fuentes:{" "}
          <a href="https://data.iana.org/time-zones/tzdb-2026e/southamerica">
            IANA, Caracas
          </a>{" "}
          e{" "}
          <a href="https://data.iana.org/time-zones/tzdb-2026e/europe">
            IANA, Madrid
          </a>
          .
        </p>
        <section
          className="table-wrap"
          aria-label="Ejemplo ficticio de horarios Caracas y Madrid"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: permite desplazar la tabla con teclado cuando desborda en móvil.
          tabIndex={0}
        >
          <table>
            <caption>La diferencia horaria cambia en octubre de 2026</caption>
            <thead>
              <tr>
                <th scope="col">Fecha del ejemplo ficticio</th>
                <th scope="col">Hora en Caracas</th>
                <th scope="col">Hora en Madrid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>8 de octubre de 2026</td>
                <td>15:00, UTC−04:00</td>
                <td>21:00, UTC+02:00</td>
              </tr>
              <tr>
                <td>29 de octubre de 2026</td>
                <td>15:00, UTC−04:00</td>
                <td>20:00, UTC+01:00</td>
              </tr>
            </tbody>
          </table>
        </section>
        <p>
          Una cita semanal que mantiene las 15:00 de Caracas puede cambiar de
          hora en Madrid. Acuerden qué ubicación fija la hora de la serie y
          revisen la siguiente cita cuando haya un cambio estacional o un viaje.
          Si una persona está en otro país con varias zonas, usa su ciudad de
          referencia; «hora de España» o «hora de Estados Unidos» puede ser
          insuficiente.
        </p>
        <p>
          En Google Calendar, desde un ordenador, puedes abrir o crear el
          evento, entrar en sus opciones y seleccionar{" "}
          <strong>Zona horaria</strong> junto a la hora. Cada invitado lo verá
          según la zona configurada en su calendario. Comprueba con la otra
          persona la hora que aparece; Google advierte que cambios recientes de
          las reglas horarias pueden afectar a eventos creados anteriormente.{" "}
          <a href="https://support.google.com/calendar/answer/37064?co=GENIE.Platform%3DDesktop&amp;hl=es">
            Ayuda oficial sobre zonas horarias
          </a>
          .
        </p>
        <p>
          Coordinar los relojes no confirma la habilitación profesional para
          atender desde o hacia un país. El profesional debe comprobar por
          separado el ámbito de su atención antes de aceptar la cita.
        </p>
        <h2>3. Confirma las condiciones antes de la sesión</h2>
        <p>
          Envía una confirmación breve que permita detectar un error antes del
          encuentro. Incluye:
        </p>
        <ul>
          <li>
            Fecha, hora de inicio y zona horaria; añade la hora de la otra
            persona cuando sea distinta.
          </li>
          <li>Duración acordada y modalidad.</li>
          <li>
            Importe y moneda completos. El símbolo «$» sin indicar moneda puede
            resultar ambiguo.
          </li>
          <li>
            Medio de pago acordado y momento en que corresponde pagar, si hay un
            coste.
          </li>
          <li>
            Cómo solicitar cambios, con qué anticipación y qué condiciones se
            han acordado para cancelaciones o ausencias.
          </li>
          <li>Canal y horario para comunicar incidencias de coordinación.</li>
        </ul>
        <p>
          Si la atención no tiene coste, indícalo expresamente para esa
          atención. Si tiene coste, separa el precio de la consulta de cualquier
          suscripción a una herramienta que use el profesional. Cada profesional
          acuerda las consultas y sus precios con la persona que atiende;{" "}
          <Link href="/como-funciona">cómo funciona Nido</Link> explica ese
          recorrido.
        </p>
        <p>
          No hace falta fijar aquí una política universal de 24 o 48 horas.
          Necesitas condiciones propias claras y conocidas antes de la cita. Si
          cambian, acuerda desde cuándo se aplican; evita tratar un mensaje
          nuevo como aceptación de condiciones anteriores.
        </p>
        <h2>4. Usa una plantilla corta de confirmación</h2>
        <p>
          <strong>
            Plantilla administrativa; los campos son ficticios y deben adaptarse
            al acuerdo real:
          </strong>
        </p>
        <blockquote className="notice">
          <p>
            Te confirmo la cita para el [día, mes y año], de [hora de inicio] a
            [hora de fin], en [ciudad y zona horaria]. En tu ubicación
            corresponde a [fecha y horas locales]. La duración acordada es
            [minutos] y la modalidad es [modalidad]. El importe es [cantidad y
            moneda / sin coste para esta atención], con [medio y momento de pago
            acordados]. Para pedir un cambio, utiliza [canal] según [condiciones
            previamente acordadas]. ¿Me confirmas que la fecha, ambas horas y
            estas condiciones coinciden con lo que acordamos?
          </p>
        </blockquote>
        <p>
          Guarda la confirmación en el canal autorizado para coordinar la cita.
          No añadas el motivo de consulta, un diagnóstico ni notas clínicas a
          este mensaje administrativo. Cuando haya un enlace privado de acceso,
          compártelo exclusivamente con la persona correspondiente por la vía
          acordada.
        </p>
        <h2>5. Cuando cambie la cita, cierra el horario anterior</h2>
        <p>
          Un cambio queda completo cuando ambas partes saben cuál es la nueva
          cita y la agenda refleja ese acuerdo.
        </p>
        <ol>
          <li>
            Comprueba que el horario propuesto está disponible y que su duración
            encaja.
          </li>
          <li>
            Confirma la fecha nueva y sus horas locales, además de cualquier
            condición que cambie.
          </li>
          <li>
            Actualiza la cita en la agenda principal. Distingue una
            reprogramación de una cancelación sin nueva fecha.
          </li>
          <li>
            Revisa las copias que hayas creado en otros calendarios y los
            recordatorios que dependían de la hora anterior.
          </li>
          <li>
            Envía una confirmación final que identifique el nuevo horario como
            vigente.
          </li>
        </ol>
        <p>
          Si modificas una serie recurrente, comprueba si el cambio afecta solo
          a un encuentro o a los siguientes. Después revisa la próxima fecha
          visible, no solo el primer evento de la serie.
        </p>
        <h2>6. Mantén los datos sensibles fuera del calendario externo</h2>
        <p>
          Para una copia en un calendario externo, un título neutro como
          «Sesión» o «Cita» puede ser suficiente. Evita nombres, correos,
          teléfonos, motivos de consulta, diagnósticos, notas y enlaces que den
          acceso a espacios privados. Un código también puede identificar a una
          persona si permite vincularlo fácilmente con otra lista: no lo
          consideres anónimo por defecto.
        </p>
        <p>
          Revisa quién puede ver el calendario y qué permisos tiene. Marcar un
          evento como privado no oculta sus detalles a todas las personas:
          Google permite verlos a quienes tienen determinados permisos de
          edición y gestión. Además, una invitación puede mostrar cierta
          información del evento. La{" "}
          <a href="https://support.google.com/calendar/answer/34580?co=GENIE.Platform%3DDesktop&amp;hl=es">
            documentación de visibilidad de Google Calendar
          </a>{" "}
          explica esas diferencias. Revisa también qué muestran las
          notificaciones en pantallas compartidas.
        </p>
        <h2>7. Una copia ICS necesita revisión después de los cambios</h2>
        <p>
          Un archivo <code>.ics</code> permite trasladar eventos entre
          calendarios. En Google Calendar puedes importarlo desde un ordenador,
          en <strong>Configuración → Importar y exportar</strong>. Elige el
          archivo y el calendario de destino. Google aclara que los eventos
          importados no quedan sincronizados con el calendario de origen;
          tampoco se importan los datos de invitados y conferencia.{" "}
          <a href="https://support.google.com/calendar/answer/37118?hl=es">
            Instrucciones oficiales de importación
          </a>
          .
        </p>
        <p>
          Por eso, si luego reprogramas o cancelas en tu agenda principal,
          revisa también la copia. No des por actualizado un evento por haber
          descargado el archivo una vez. Después de importar, verifica una cita
          de ejemplo: fecha, zona horaria, comienzo, fin y título. Evita volver
          a importar un conjunto sin comprobar qué eventos ya están presentes.
        </p>
        <p>
          Si necesitas exportar un calendario de Google, la opción está
          disponible en ordenador y exige permisos para gestionar ese
          calendario; una organización puede restringirla. El archivo descargado
          contiene eventos, así que guárdalo en un lugar con acceso controlado.{" "}
          <a href="https://support.google.com/calendar/answer/37111?hl=es">
            Instrucciones oficiales de exportación
          </a>
          .
        </p>
        <h2>Lista de comprobación antes de dar la cita por confirmada</h2>
        <ul>
          <li>
            Hay una sola agenda principal y el estado de la cita está claro.
          </li>
          <li>Ambas partes han confirmado fecha y hora en sus ubicaciones.</li>
          <li>La zona horaria y la próxima fecha recurrente son correctas.</li>
          <li>Duración, importe, moneda y modalidad están acordados.</li>
          <li>
            Las condiciones de cambios, cancelaciones y ausencias se comunicaron
            previamente.
          </li>
          <li>
            La copia externa y los recordatorios reflejan el horario vigente.
          </li>
          <li>
            Los títulos y detalles del calendario no incluyen información
            clínica o identificadores innecesarios.
          </li>
        </ul>
        <p>
          <Link href="/para-psicologos">Nido para psicólogos</Link> presenta el
          espacio para organizar agenda y servicios después de la aprobación del
          perfil. Puedes consultar también las{" "}
          <Link href="/preguntas-frecuentes">preguntas frecuentes de Nido</Link>
          . El método de esta guía sirve para revisar tus acuerdos con
          independencia de la herramienta que utilices.
        </p>
        <p>
          Esta guía describe organización administrativa. No determina la
          duración, frecuencia o modalidad clínica adecuada, ni establece
          condiciones jurídicas universales. Las funciones de las herramientas y
          las reglas horarias pueden cambiar: la fecha indicada corresponde a la
          verificación realizada, no a una garantía sobre fechas futuras.
        </p>
      </article>
    </section>
  );
}
