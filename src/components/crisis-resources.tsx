/**
 * Bloque de recursos de crisis verificados. Sirve para dos usos:
 *  - `variant="callout"`: aviso compacto para incrustar en /ayuda, /gracias…
 *  - `variant="full"`: listado completo para /emergencia y /recursos.
 *
 * Usa un verde suave de marca en estilos en línea para no depender de cambios
 * en globals.css y mantenerse sereno (sin rojo de alarma). El verde es el único
 * color de acento de la marca.
 */

import {
  EMERGENCY_CONTACTS,
  RESOURCE_DIRECTORIES,
  RESOURCES_LAST_VERIFIED,
  SUPPORT_LINES,
  type SupportResource,
} from "@/lib/resources";

const SAFETY = "#245f47";
const SAFETY_SOFT = "#e6f1ea";
const SAFETY_BORDER = "#c5ddc5";

function ResourceCard({ resource }: { resource: SupportResource }) {
  return (
    <article
      className="card"
      style={{ background: "#fff", borderColor: SAFETY_BORDER }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>
        {resource.name}
        {resource.forMinors ? (
          <span
            style={{
              marginLeft: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: SAFETY,
              background: SAFETY_SOFT,
              borderRadius: 999,
              padding: "2px 8px",
              verticalAlign: "middle",
            }}
          >
            Niños y adolescentes
          </span>
        ) : null}
      </h3>
      <p style={{ marginTop: 0 }}>{resource.description}</p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 8px",
          display: "grid",
          gap: 4,
        }}
      >
        {resource.contacts.map((c) => (
          <li key={`${resource.id}-${c.label}-${c.value}`}>
            <strong>{c.label}:</strong>{" "}
            {c.href ? (
              <a
                href={c.href}
                target={c.href.startsWith("http") ? "_blank" : undefined}
                rel={
                  c.href.startsWith("http") ? "noopener noreferrer" : undefined
                }
              >
                {c.value}
              </a>
            ) : (
              c.value
            )}
          </li>
        ))}
      </ul>
      {resource.hours ? (
        <p className="hint" style={{ margin: "0 0 4px" }}>
          Horario: {resource.hours}
        </p>
      ) : null}
      <p className="hint" style={{ margin: 0 }}>
        Fuente: {resource.source}
      </p>
    </article>
  );
}

export function CrisisResources({
  variant = "full",
}: {
  variant?: "callout" | "full";
}) {
  return (
    <section
      aria-label="Si estás en peligro ahora"
      style={{
        border: `1px solid ${SAFETY_BORDER}`,
        borderLeft: `4px solid ${SAFETY}`,
        borderRadius: 14,
        background: SAFETY_SOFT,
        padding: variant === "callout" ? "16px 18px" : "20px 22px",
        marginBottom: 24,
      }}
    >
      <h2 style={{ marginTop: 0, color: SAFETY, fontWeight: 700 }}>
        Si estás en peligro ahora mismo
      </h2>
      <p style={{ marginTop: 0 }}>
        Nido es apoyo de acompañamiento gratuito y a distancia, pero{" "}
        <strong>no es un servicio de emergencia</strong> y no responde al
        instante. Si tu vida o la de otra persona corre peligro en este momento,
        busca ayuda inmediata:
      </p>
      <p style={{ margin: "0 0 14px" }}>
        Llama de inmediato al <strong>911</strong>, la línea única nacional de
        emergencias (policía, bomberos y ambulancia). Si puedes, acude a una
        persona de confianza o al centro de salud más cercano.
      </p>

      {variant === "callout" ? (
        <p style={{ margin: 0 }}>
          <a href="/emergencia">
            <strong>Ver líneas de ayuda y qué hacer ahora →</strong>
          </a>
        </p>
      ) : (
        <>
          <h3 style={{ color: SAFETY }}>Emergencia inmediata</h3>
          <div className="grid grid-2" style={{ marginBottom: 18 }}>
            {EMERGENCY_CONTACTS.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>

          <h3 style={{ color: SAFETY }}>
            Líneas de apoyo psicológico gratuitas
          </h3>
          <div className="grid grid-2" style={{ marginBottom: 18 }}>
            {SUPPORT_LINES.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>

          <h3 style={{ color: SAFETY }}>
            Directorios para encontrar más ayuda
          </h3>
          <div className="grid grid-2" style={{ marginBottom: 14 }}>
            {RESOURCE_DIRECTORIES.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>

          <p className="hint" style={{ margin: 0 }}>
            Última verificación de estos recursos: {RESOURCES_LAST_VERIFIED}.
            Los teléfonos y horarios pueden cambiar; si un número no responde,
            usa los directorios para encontrar una alternativa cercana.
          </p>
        </>
      )}
    </section>
  );
}
