import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CrisisResources } from "@/components/crisis-resources";
import { GuideJsonLd } from "@/components/structured-data";

export const metadata: Metadata = {
  title: "Psicólogo online gratis en Venezuela: cómo empezar",
  description:
    "Habla gratis con un psicólogo voluntario online en Venezuela, a distancia y en español. Sin crear cuenta, confidencial y sin costo. Aquí te explicamos cómo.",
  alternates: { canonical: "/recursos/psicologo-online-gratis-venezuela" },
  openGraph: {
    title: "Psicólogo online gratis en Venezuela | Nido",
    description:
      "Cómo hablar gratis con un psicólogo voluntario online en Venezuela, a distancia, confidencial y sin crear cuenta.",
    url: "/recursos/psicologo-online-gratis-venezuela",
  },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <GuideJsonLd
          path="/recursos/psicologo-online-gratis-venezuela"
          name="Psicólogo online gratis en Venezuela: cómo empezar"
          description="Habla gratis con un psicólogo voluntario online en Venezuela, a distancia y en español. Sin crear cuenta, confidencial y sin costo. Aquí te explicamos cómo."
        />
        <Breadcrumbs
          trail={[
            { name: "Recursos", path: "/recursos" },
            {
              name: "Psicólogo online gratis",
              path: "/recursos/psicologo-online-gratis-venezuela",
            },
          ]}
        />
        <h1>
          Psicólogo online gratis en Venezuela: cómo hablar con uno a distancia
        </h1>
        <p className="lead">
          Si buscas un psicólogo o psicóloga en Venezuela pero no puedes pagar
          una consulta, no estás sin opciones. En Nido, profesionales
          voluntarios verificados acompañan en línea, en español y sin coste, a
          personas que están pasando por un momento difícil. Aquí te contamos
          qué es la atención psicológica online, para quién sirve y cómo
          empezar.
        </p>

        <CrisisResources variant="callout" />

        <h2>¿Qué es la atención psicológica online?</h2>
        <p>
          Es recibir apoyo de una persona profesional de la psicología a
          distancia, por internet, sin tener que ir a un consultorio. Funciona
          desde un teléfono o una computadora con conexión, y por eso llega a
          cualquier estado del país —Caracas, Maracaibo, Valencia, Barquisimeto,
          Maracay y el resto— e incluso a personas venezolanas en el exterior.
          La cercanía no la da la distancia física, sino que alguien te escuche
          con atención y sin juzgar.
        </p>

        <h2>¿Para quién es?</h2>
        <p>
          No hace falta estar en crisis para pedir apoyo. Hablar con un
          profesional puede ayudarte si te reconoces en algo de esto:
        </p>
        <ul>
          <li>Tristeza, angustia o un vacío que no se va.</li>
          <li>Ansiedad, estrés o insomnio que te superan.</li>
          <li>Un duelo, una pérdida o un cambio difícil de sostener.</li>
          <li>
            Miedo o malestar después de una situación dura, como un terremoto.
          </li>
          <li>
            La sensación de no poder con todo y de no tener con quién hablar.
          </li>
        </ul>

        <h2>Cómo hablar con un psicólogo gratis, paso a paso</h2>
        <ol className="steps">
          <li>
            <strong>Cuéntanos cómo estás.</strong> Completas un formulario breve
            en menos de un minuto. No necesitas crear cuenta, ni dar tu nombre,
            cédula o ubicación exacta: solo un correo para que puedan
            escribirte.
          </li>
          <li>
            <strong>Una persona voluntaria te lee.</strong> Un psicólogo o
            psicóloga voluntaria verificada revisa tu solicitud dentro de sus
            áreas de competencia.
          </li>
          <li>
            <strong>Te escriben a tu correo.</strong> Te acompañan a distancia,
            de forma gratuita y confidencial.
          </li>
        </ol>
        <p>
          <Link className="button human" href="/ayuda">
            Pedir apoyo ahora
          </Link>
        </p>

        <h2>Qué esperar (y qué no)</h2>
        <p>
          Nido es apoyo emocional de acompañamiento: una persona profesional que
          escucha, ordena lo que sientes y te ayuda a dar los siguientes pasos.
          Es importante que sepas también lo que <em>no</em> es, para que
          busques la ayuda correcta cuando haga falta:
        </p>
        <ul>
          <li>
            No es un servicio de emergencias en tiempo real. Si tú o alguien
            está en peligro inmediato, mira las{" "}
            <Link href="/emergencia">líneas de ayuda y qué hacer ahora</Link>.
          </li>
          <li>
            No sustituye una psicoterapia formal ni la atención médica
            presencial cuando se necesitan.
          </li>
          <li>
            No se cobra ni se piden datos de pago: la atención la donan personas
            voluntarias.
          </li>
        </ul>

        <h2>Es confidencial y puedes ser anónimo</h2>
        <p>
          Para pedir apoyo no necesitas dar tu identidad. Pedimos la mínima
          información necesaria y tu mensaje solo lo ven el equipo de
          coordinación y, si corresponde, la persona voluntaria que te acompañe.
          Si te frena la vergüenza o el miedo a que te identifiquen, lee cómo
          funciona el{" "}
          <Link href="/recursos/apoyo-emocional-anonimo">
            apoyo emocional anónimo
          </Link>
          .
        </p>

        <h2>Elige con quién hablar</h2>
        <p>
          Puedes ver a las personas voluntarias disponibles y elegir a quien
          sientas más afín por su área de apoyo, o dejar tu mensaje y que le
          llegue a todo el equipo.
        </p>
        <ul>
          <li>
            <Link href="/profesionales">
              Ver psicólogas y psicólogos voluntarios disponibles
            </Link>
            .
          </li>
          <li>
            <Link href="/como-funciona">Cómo funciona Nido paso a paso</Link>.
          </li>
          <li>
            <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>.
          </li>
        </ul>

        <div className="reassurance">
          <p>
            Dar el primer paso cuesta, y aun así puede cambiar mucho. No tienes
            que poder con todo tú solo/a.
          </p>
          <p>
            <Link className="button human" href="/ayuda">
              Hablar con un psicólogo gratis
            </Link>
          </p>
        </div>

        <p className="hint">
          Nido no atiende emergencias ni ofrece terapia dentro de la web. Es un
          puente gratuito hacia el acompañamiento de personas voluntarias
          verificadas en Venezuela.
        </p>
      </div>
    </section>
  );
}
