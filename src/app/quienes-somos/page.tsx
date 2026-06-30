import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { getPrivacyContactEmail } from "@/lib/contact";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Quiénes somos",
  description:
    "Nido es una iniciativa sin fines de lucro que conecta gratis a personas en Venezuela con psicólogas y psicólogos voluntarios verificados. Conoce nuestra misión.",
  alternates: { canonical: "/quienes-somos" },
};

export default function Page() {
  const contactEmail = getPrivacyContactEmail();

  return (
    <section className="section">
      <div className="container">
        <h1>Quiénes somos</h1>
        <p className="lead">
          {SITE_NAME} es una iniciativa sin fines de lucro que nace de una idea
          sencilla: en Venezuela hay muchísimas personas que necesitan ser
          escuchadas y muchísimos profesionales de la psicología dispuestos a
          tender la mano. Nosotros solo construimos el puente entre unas y
          otros, gratis y a distancia.
        </p>

        <CrisisResources variant="callout" />

        <h2>Nuestra misión</h2>
        <p>
          Creemos que pedir apoyo emocional no debería costar dinero, ni exigir
          trámites, ni dar miedo. Existimos para que cualquier persona en
          Venezuela —sin importar su edad, dónde viva o por lo que esté pasando—
          pueda dar el primer paso y encontrar a alguien preparado que la
          acompañe.
        </p>
        <p>
          No damos terapia dentro de esta página y no somos un servicio de
          emergencias. Lo que hacemos es <strong>conectar</strong>: recibimos tu
          solicitud, la cuidamos con discreción y la ponemos en manos de una
          psicóloga o un psicólogo voluntario verificado, que se comunicará
          contigo por fuera de esta plataforma. Ese acompañamiento es a
          distancia, para que llegue a cualquier estado del país e incluso a
          personas venezolanas en el exterior.
        </p>

        <h2>De dónde venimos</h2>
        <p>
          {SITE_NAME} surgió al ver dos realidades que casi nunca se encuentran.
          Por un lado, personas que cargan en silencio con la ansiedad, el
          duelo, la migración de un ser querido, el miedo o el cansancio, y que
          no saben a quién acudir o sienten que no pueden pagarlo. Por el otro,
          profesionales de la psicología con vocación de servicio que quieren
          ayudar y no siempre encuentran un canal seguro para hacerlo.
        </p>
        <p>
          Decidimos juntar esas dos manos. No para reemplazar a nadie, sino para
          abrir una puerta más: una entrada amable, gratuita y sin estigma hacia
          el apoyo psicológico.
        </p>

        <h2>Quién coordina y cómo nos gobernamos</h2>
        <p>
          Detrás de {SITE_NAME} hay un pequeño equipo de coordinación que cuida
          el día a día del proyecto. Lo describimos por sus funciones, no por
          nombres propios, porque lo que importa es el cuidado con el que se
          hace cada cosa:
        </p>
        <div className="grid grid-2">
          <article className="card">
            <h3>Coordinación general</h3>
            <p className="muted">
              Mantiene viva la misión, define las reglas de cuidado y responde
              por las decisiones del proyecto.
            </p>
          </article>
          <article className="card">
            <h3>Verificación de profesionales</h3>
            <p className="muted">
              Revisa de forma manual las credenciales de cada psicóloga o
              psicólogo antes de que pueda recibir solicitudes. Nadie acompaña
              sin pasar por aquí.
            </p>
          </article>
          <article className="card">
            <h3>Atención a las solicitudes</h3>
            <p className="muted">
              Recibe los mensajes de quienes piden apoyo con discreción y los
              orienta hacia la persona voluntaria adecuada.
            </p>
          </article>
          <article className="card">
            <h3>Privacidad y seguridad</h3>
            <p className="muted">
              Vela por que se pida la mínima información posible y por que los
              datos se traten con cuidado. Puedes escribirnos a{" "}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </p>
          </article>
        </div>
        <p className="hint">
          Texto pendiente de revisión por un profesional del derecho en
          Venezuela. La estructura de gobernanza y las responsabilidades aquí
          descritas se publicarán de forma más detallada conforme el proyecto
          crezca.
        </p>

        <h2>Por qué es gratis y voluntario</h2>
        <p>
          {SITE_NAME} no cobra, no vende publicidad y no tiene ánimo de lucro.
          El acompañamiento lo brindan profesionales que donan su tiempo de
          forma voluntaria, dentro de sus áreas de competencia y de su
          disponibilidad. A las personas que piden apoyo no se les solicita
          ningún dato de pago, jamás.
        </p>
        <ul className="reassurance">
          <li>
            Para pedir apoyo no necesitas crear una cuenta ni dar tu identidad
            completa.
          </li>
          <li>
            Nadie te pedirá dinero en ningún momento. Si alguien lo hace en
            nuestro nombre, no somos nosotros.
          </li>
          <li>
            Los profesionales entran con Google solo para verificar su identidad
            y pasan una revisión manual.
          </li>
        </ul>

        <h2>Nuestros límites son una elección ética</h2>
        <p>
          Hay cosas que {SITE_NAME} decide, a propósito, no hacer. No son
          carencias: son la forma en que protegemos a las personas que confían
          en nosotros. Preferimos hacer pocas cosas y hacerlas con cuidado.
        </p>
        <div className="grid grid-2">
          <article className="card">
            <h3>No cobramos, nunca</h3>
            <p className="muted">
              El apoyo es gratuito porque el cuidado no debería depender de
              cuánto dinero tengas.
            </p>
          </article>
          <article className="card">
            <h3>No reemplazamos la terapia ni las emergencias</h3>
            <p className="muted">
              Hay un chat privado para que la persona y un voluntario se
              conozcan y hablen; no hay videollamadas, ni terapia continua, ni
              un robot que responda. El acompañamiento real lo da una persona.
            </p>
          </article>
          <article className="card">
            <h3>No somos una emergencia</h3>
            <p className="muted">
              No respondemos al instante y no sustituimos a los servicios de
              urgencia. Si hay peligro inmediato, busca ayuda ahora mismo.
            </p>
          </article>
          <article className="card">
            <h3>Sin reseñas, sin rankings, sin vitrina</h3>
            <p className="muted">
              Nadie compite por estrellas. Queremos que profesionales y personas
              se encuentren sin presión ni exposición.
            </p>
          </article>
        </div>
        <p className="notice">
          {SITE_NAME} es un punto de partida, no un sustituto de la atención
          médica, psicológica o psiquiátrica formal ni de los servicios de
          emergencia. Cuando una situación lo requiera, te orientaremos hacia el
          recurso adecuado. Las pautas sobre confidencialidad, atención a
          personas menores de edad y deber de actuar ante un riesgo grave se
          aplican con prudencia y siempre buscando proteger a la persona.
        </p>
        <p className="hint">
          Texto pendiente de revisión por un profesional del derecho en
          Venezuela.
        </p>
        <p className="muted">
          Puedes conocer más en <Link href="/como-funciona">cómo funciona</Link>
          , <Link href="/seguridad">seguridad</Link>,{" "}
          <Link href="/privacidad">privacidad</Link> y{" "}
          <Link href="/transparencia">transparencia</Link>, donde publicaremos
          aquí nuestras cifras agregadas y anonimizadas a medida que el proyecto
          avance.
        </p>

        <h2>Da el primer paso</h2>
        <p className="lead">
          No importa si vienes a buscar apoyo o a ofrecerlo: en {SITE_NAME} hay
          un lugar para ti.
        </p>
        <p>
          <Link className="button" href="/ayuda">
            Quiero pedir apoyo
          </Link>{" "}
          <Link className="button human" href="/pro">
            Soy psicólogo/a y quiero ayudar
          </Link>
        </p>
        <p className="hint">
          Si en este momento tu vida o la de otra persona corre peligro, ve a{" "}
          <Link href="/emergencia">emergencia</Link> o consulta los{" "}
          <Link href="/recursos">recursos de apoyo</Link>.
        </p>
      </div>
    </section>
  );
}
