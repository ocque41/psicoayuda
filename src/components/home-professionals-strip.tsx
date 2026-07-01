import Link from "next/link";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { professionalResponseSignal } from "@/lib/response-bucket";

function areaName(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
}

// Carrusel compacto para la home: una tira horizontal de mini-fichas que se
// desliza. El detalle y el contacto viven en /profesionales (fichas completas).
// Estilos en línea a propósito: globals.css tiene cambios de otras sesiones sin
// commitear; reutilizamos clases existentes (.card/.avatar/.chips/.badge) para
// el aspecto y solo el layout de la tira va inline.
export function HomeProfessionalsStrip({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  return (
    // tabIndex=0: Firefox y Safari no hacen enfocables por teclado los
    // contenedores con overflow, así que sin esto un usuario de teclado no podría
    // desplazar la tira horizontalmente (WCAG 2.1.1). El aria-label le da nombre.
    <ul
      aria-label="Psicólogas y psicólogos voluntarios"
      tabIndex={0}
      style={{
        display: "flex",
        gap: "16px",
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        listStyle: "none",
        padding: "4px 4px 12px",
        margin: "0 0 var(--space-4)",
      }}
    >
      {professionals.map((professional) => {
        const signal = professionalResponseSignal(professional);
        const initial = professional.name.charAt(0).toUpperCase() || "·";
        return (
          <li
            key={professional.id}
            style={{ flex: "0 0 min(260px, 80vw)", scrollSnapAlign: "start" }}
          >
            <Link
              href="/profesionales"
              className="card"
              style={{
                display: "block",
                height: "100%",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div className="pro-card-head">
                {professional.photo ? (
                  // biome-ignore lint/performance/noImgElement: avatar es un data URL pequeño desde la BD; next/image no aplica
                  <img
                    className="avatar"
                    src={professional.photo}
                    alt=""
                    aria-hidden="true"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <span className="avatar" aria-hidden="true">
                    {initial}
                  </span>
                )}
                <div>
                  <h3 style={{ margin: 0 }}>{professional.name}</h3>
                  {professional.city ? (
                    <p className="muted pro-loc">
                      {professional.city}
                      {professional.country ? `, ${professional.country}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className={`badge badge-${signal.tone}`}>{signal.label}</p>

              {professional.supportAreas.length ? (
                <ul className="chips" aria-label="Áreas de especialización">
                  {professional.supportAreas.slice(0, 2).map((area) => (
                    <li key={area}>{areaName(area)}</li>
                  ))}
                </ul>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
