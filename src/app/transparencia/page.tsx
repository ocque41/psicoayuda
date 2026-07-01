import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Transparencia e impacto",
  description:
    "Cómo se sostiene Nido sin fines de lucro: software de código abierto, bajo coste técnico, coordinación voluntaria y nuestro compromiso de publicar el impacto de forma anonimizada.",
  alternates: { canonical: "/transparencia" },
};

export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>Transparencia e impacto</h1>
        <p className="lead">
          Nido es un proyecto sin fines de lucro. Aquí te contamos, con
          honestidad, cómo nos sostenemos, quién coordina el trabajo y qué nos
          comprometemos a publicar. La confianza no se pide: se muestra.
        </p>

        <article className="card">
          <h2>Sin fines de lucro, de verdad</h2>
          <p>
            Nadie paga por pedir apoyo y nadie cobra por darlo. No vendemos
            datos, no mostramos publicidad y no buscamos rentabilidad. Cada
            psicóloga y psicólogo que acompaña lo hace de forma voluntaria,
            donando su tiempo y su experiencia a quien más lo necesita.
          </p>
          <p>
            Nuestro único objetivo es que una persona en Venezuela que necesita
            ser escuchada pueda conectar, gratis y a distancia, con alguien
            preparado para acompañarla.
          </p>
        </article>

        <article className="card">
          <h2>Cómo nos sostenemos</h2>
          <p>
            Mantener Nido cuesta muy poco porque está construido para gastar
            poco. Usamos software de código abierto y servicios técnicos de bajo
            coste, de modo que el dinero deja de ser una barrera para ayudar.
          </p>
          <ul>
            <li>
              <strong>Código abierto:</strong> la plataforma se apoya en
              herramientas libres, sin licencias costosas que encarezcan el
              servicio.
            </li>
            <li>
              <strong>Infraestructura ligera:</strong> al pedir solo la
              información mínima necesaria, almacenamos menos y gastamos menos.
            </li>
            <li>
              <strong>Trabajo voluntario:</strong> tanto el acompañamiento como
              la coordinación se sostienen sobre personas que donan su tiempo.
            </li>
          </ul>
          <p className="muted">
            El bajo coste técnico se cubre con aportes voluntarios y trabajo
            donado. Cuando exista una vía formal para colaborar o donar, la
            publicaremos aquí con total claridad.
          </p>
        </article>

        <article className="card">
          <h2>Gobernanza y coordinación</h2>
          <p>
            Un equipo de coordinación se encarga de verificar manualmente las
            credenciales de cada profesional voluntario, de cuidar las normas de
            convivencia y de acompañar el funcionamiento cotidiano del proyecto.
          </p>
          <p>
            Tomamos decisiones priorizando siempre el bienestar y la seguridad
            de las personas que piden apoyo, dentro de los límites de lo que
            Nido es: un puente de acompañamiento, no un servicio de emergencias
            ni un sustituto de la atención clínica o presencial.
          </p>
        </article>

        <article className="card">
          <h2>Nuestro impacto</h2>
          <p>
            Creemos que la transparencia también es contar lo que hacemos. No
            inventamos cifras: cuando tengamos datos confiables, los
            compartiremos aquí.
          </p>
          <p className="muted">
            Publicaremos aquí, de forma agregada y anonimizada, cuántas personas
            pidieron apoyo y cuántas fueron acompañadas. Ninguna de esas cifras
            permitirá identificar a una persona concreta.
          </p>
          <ul>
            <li>Personas que pidieron apoyo a través de Nido: por publicar.</li>
            <li>
              Personas acompañadas por un profesional voluntario: por publicar.
            </li>
            <li>
              Profesionales voluntarios verificados activos: por publicar.
            </li>
          </ul>
          <p className="hint">
            Texto pendiente de revisión por un profesional del derecho en
            Venezuela.
          </p>
        </article>

        <article className="card">
          <h2>Privacidad por diseño</h2>
          <p>
            Quien pide apoyo no necesita crear una cuenta ni dar su nombre,
            cédula o ubicación exacta. Cuidar tus datos es parte de cuidarte a
            ti. Puedes leer en detalle qué información pedimos, para qué la
            usamos y cuánto tiempo la guardamos.
          </p>
          <p>
            <Link className="button secondary" href="/privacidad">
              Leer nuestra privacidad
            </Link>{" "}
            <Link className="button secondary" href="/quienes-somos">
              Conocer quiénes somos
            </Link>
          </p>
        </article>
      </div>
    </section>
  );
}
