import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { QuickExit, QuickExitNote } from "@/components/quick-exit";
import { MINORS_RESOURCES, SEISMIC_SOURCE } from "@/lib/resources";

export const metadata: Metadata = {
  title: "Líneas de ayuda psicológica y emergencia en Venezuela",
  description:
    "Qué hacer en una emergencia o peligro inmediato en Venezuela: servicios de emergencia y líneas de apoyo psicológico gratuitas. Nido no atiende emergencias.",
  alternates: { canonical: "/emergencia" },
  robots: { index: true, follow: true },
};

export default function EmergencyPage() {
  return (
    <section className="section">
      <div className="container">
        <QuickExit />
        <h1>Si estás en peligro ahora</h1>
        <p className="lead">
          Lo primero es tu seguridad. Si sientes que tu vida o la de otra
          persona está en riesgo en este momento, no esperes una respuesta por
          correo: busca ayuda inmediata con estas opciones.
        </p>

        <CrisisResources variant="full" />

        <div className="card">
          <h2>Información oficial sobre los sismos</h2>
          <p>{SEISMIC_SOURCE.description}</p>
          <ul>
            {SEISMIC_SOURCE.contacts.map((c) => (
              <li key={c.label}>
                <strong>{c.label}:</strong>{" "}
                {c.href ? (
                  <a href={c.href} target="_blank" rel="noopener noreferrer">
                    {c.value}
                  </a>
                ) : (
                  c.value
                )}
              </li>
            ))}
          </ul>
          <p className="hint">Fuente: {SEISMIC_SOURCE.source}</p>
        </div>

        <div className="card">
          <h2>Si quien necesita ayuda es un niño, niña o adolescente</h2>
          <p>
            También mereces ayuda y no estás solo/a. Si puedes, busca a una
            persona adulta de confianza. Y si estás en peligro ahora, usa las
            líneas de arriba: algunas atienden especialmente a niñas, niños y
            adolescentes.
          </p>
          <ul>
            {MINORS_RESOURCES.map((r) => (
              <li key={r.id}>
                <strong>{r.name}:</strong>{" "}
                {r.contacts
                  .filter((c) => c.label !== "Sitio web")
                  .map((c) => c.value)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Por qué Nido no atiende emergencias</h2>
          <p>
            Nido conecta a personas con psicólogas y psicólogos voluntarios para
            un acompañamiento gratuito y a distancia. Ese contacto puede tardar
            horas y depende de la disponibilidad de las personas voluntarias,
            así que <strong>no sustituye a un servicio de emergencia</strong> ni
            a la atención médica presencial. Preferimos decírtelo con claridad
            para que, en un momento de peligro, busques la ayuda que de verdad
            llega rápido.
          </p>
          <p>
            Cuando te sientas a salvo, si quieres acompañamiento puedes{" "}
            <Link href="/ayuda">pedir apoyo aquí</Link>.
          </p>
        </div>

        <QuickExitNote />
      </div>
    </section>
  );
}
