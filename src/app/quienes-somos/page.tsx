import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "Quiénes somos",
  description:
    "Nido conecta a personas con profesionales de psicología y ayuda a organizar el acompañamiento. Conoce nuestra misión.",
  alternates: { canonical: "/quienes-somos" },
};
export default function Page() {
  return (
    <section className="section">
      <div className="container">
        <h1>Un lugar para empezar</h1>
        <p className="lead">
          Nido nace para acercar a quienes necesitan apoyo y a profesionales que
          pueden acompañarlos. Queremos que dar el primer paso sea sencillo,
          humano y discreto.
        </p>
        <h2>Nuestra misión</h2>
        <p>
          Ayudarte a encontrar a alguien afín a lo que necesitas y darle a tu
          profesional un espacio para cuidar la continuidad: conversaciones,
          agenda y seguimiento por paciente.
        </p>
        <div className="grid grid-3">
          <article className="card">
            <h2>Elegir con claridad</h2>
            <p>
              Perfiles revisados, áreas de apoyo e idiomas para tomar una
              decisión informada. La compatibilidad se confirma al hablar con el
              profesional.
            </p>
          </article>
          <article className="card">
            <h2>Acompañar con cuidado</h2>
            <p>
              El equipo revisa credenciales y atiende las dudas de los
              profesionales. Cada profesional ofrece atención dentro de sus
              competencias y condiciones de ejercicio.
            </p>
          </article>
          <article className="card">
            <h2>Respetar tu ritmo</h2>
            <p>
              Comparte lo que necesites para empezar. Tú eliges con quién hablar
              y acuerdas los próximos pasos.
            </p>
          </article>
        </div>
        <h2>Ayuda Terremoto</h2>
        <p>
          Conservamos un programa separado de acompañamiento voluntario gratuito
          para las personas afectadas por el terremoto, según disponibilidad.
        </p>
        <Link href="/ayuda">Conocer Ayuda Terremoto</Link>
        <p>
          Para otras opciones de apoyo, puedes consultar las{" "}
          <Link href="/alianzas">organizaciones aliadas</Link> o{" "}
          <Link href="/lista-de-espera">la lista general de espera</Link>, según
          disponibilidad y sin garantía de cupo ni plazo.
        </p>
        <h2>Habla con nosotros</h2>
        <p>
          Si necesitas orientación sobre la plataforma, puedes contactar al
          equipo.
        </p>
        <Link className="button human" href="/contacto">
          Contactar al equipo
        </Link>
        <p className="safety-note">
          Nido no atiende emergencias en tiempo real.{" "}
          <Link href="/emergencia">Recursos para ayuda inmediata</Link>
        </p>
      </div>
    </section>
  );
}
