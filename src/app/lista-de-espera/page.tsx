import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyNotice } from "@/components/emergency-notice";
import { PartnersShowcase } from "@/components/partners-showcase";
import { WaitlistPanel } from "@/components/waitlist-panel";

export const metadata: Metadata = {
  title: "Lista de espera de apoyo psicológico",
  description:
    "Explora otras opciones de apoyo psicológico: la lista general de espera y las organizaciones aliadas, según disponibilidad. Ayuda Terremoto mantiene su programa gratuito separado.",
  alternates: { canonical: "/lista-de-espera" },
  openGraph: {
    title: "Lista de espera de apoyo psicológico | Nido",
    description:
      "Anótate en la lista general de espera o explora organizaciones aliadas. Las solicitudes se revisan según disponibilidad, sin garantía de cupo ni plazo.",
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
            Ayuda Terremoto ofrece acompañamiento gratuito a personas afectadas
            por el terremoto. La lista de espera general atiende solicitudes por
            otros motivos según disponibilidad. Si necesitas apoyo por otro
            motivo, este es tu camino: déjanos tu correo y cuéntanos qué
            necesitas.
          </p>

          <EmergencyNotice />

          <WaitlistPanel source="lista-de-espera" />

          <h2>Qué pasa después de anotarte</h2>
          <ol className="steps">
            <li>
              <span>
                <strong>Guardamos tu anotación.</strong> Tu correo, el título y
                la descripción quedan en el panel privado del equipo de
                coordinación. No se publican.
              </span>
            </li>
            <li>
              <span>
                <strong>Revisamos según disponibilidad.</strong> El equipo puede
                contactarte por correo para explorar opciones de apoyo. La lista
                no garantiza un cupo ni un plazo de respuesta y no requiere
                crear una cuenta.
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
            lista: busca ayuda presencial o los servicios de emergencia de tu
            ubicación. Consulta los{" "}
            <Link href="/emergencia">recursos de ayuda inmediata</Link>.
          </p>

          <p className="reassurance">
            Si buscas apoyo por el terremoto, el programa separado de{" "}
            <Link href="/ayuda">Ayuda Terremoto</Link> ofrece acompañamiento
            gratuito según disponibilidad. También puedes{" "}
            <Link href="/profesionales">explorar el catálogo general</Link>.
          </p>
        </div>
      </section>

      <PartnersShowcase />
    </>
  );
}
