import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice } from "@/components/emergency-notice";
import { PartnersShowcase } from "@/components/partners-showcase";
import { WaitlistPanel } from "@/components/waitlist-panel";

export const metadata: Metadata = {
  title: "Lista de espera de apoyo psicológico",
  description:
    "La ayuda gratuita de Nido está reservada para las víctimas del terremoto. Si necesitas apoyo psicológico por otro motivo, anótate en la lista de espera o encuentra ayuda en una asociación aliada.",
  alternates: { canonical: "/lista-de-espera" },
  openGraph: {
    title: "Lista de espera de apoyo psicológico | Nido",
    description:
      "¿No eres víctima del terremoto y necesitas apoyo psicológico? Anótate en la lista de espera o encuentra ayuda en una de las asociaciones aliadas.",
    url: "/lista-de-espera",
  },
};

// ISR breve: la página es estática, pero el escaparate de aliados lee de D1.
// Sin revalidación, la copia prerenderizada (sin BD en build) se quedaría
// vacía hasta la siguiente edición en /admin (mismo criterio que /alianzas).
export const revalidate = 60;

export default function Page() {
  return (
    <>
      <section className="section">
        <div className="container">
          <h1>Lista de espera de apoyo psicológico</h1>
          <p className="lead">
            Nido acompaña gratis, a distancia y con personas voluntarias
            verificadas. Hoy, toda la capacidad gratuita está reservada para las
            víctimas del terremoto. Si necesitas apoyo por otro motivo, este es
            tu camino: déjanos tu correo y cuéntanos qué necesitas.
          </p>

          <EmergencyNotice />

          <WaitlistPanel source="lista-de-espera" />

          <h2>Qué pasa después de anotarte</h2>
          <ol className="steps">
            <li>
              <span>
                <strong>Guardamos tu anotación.</strong> Tu correo, el título y
                la descripción quedan solo en el panel privado del equipo de
                coordinación. No se publican ni se comparten con nadie más.
              </span>
            </li>
            <li>
              <span>
                <strong>Te escribimos cuando haya un cupo.</strong> Cuando se
                libere un espacio voluntario para acompañarte, te avisamos a tu
                correo. No necesitas crear una cuenta ni volver a entrar aquí.
              </span>
            </li>
            <li>
              <span>
                <strong>Mientras tanto, tienes alternativas.</strong> Puedes
                escribir directamente a una de las{" "}
                <Link href="/alianzas">organizaciones aliadas</Link> o revisar
                los <Link href="/recursos">recursos de apoyo</Link> mientras
                esperas.
              </span>
            </li>
          </ol>
          <p className="hint">
            ¿Tu situación es urgente o estás en peligro? No esperes por esta
            lista: llama al <strong>911</strong> o consulta las{" "}
            <Link href="/emergencia">líneas de ayuda inmediata</Link>.
          </p>

          <p className="reassurance">
            ¿Eres víctima del terremoto? Entonces no necesitas la lista de
            espera: la ayuda es gratuita para ti ahora mismo.{" "}
            <Link href="/ayuda">Pide apoyo aquí</Link> o{" "}
            <Link href="/profesionales">elige con quién hablar</Link>.
          </p>
        </div>
      </section>

      <PartnersShowcase />
    </>
  );
}
