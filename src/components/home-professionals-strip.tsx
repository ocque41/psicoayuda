import Link from "next/link";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { professionalResponseSignal } from "@/lib/response-bucket";

function areaName(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
}

// Rejilla responsive para la home: mini-fichas que se acomodan en columnas según
// el ancho (sin tira horizontal que corte la última tarjeta). El detalle y el
// contacto viven en /profesionales (fichas completas). Estilos de layout inline;
// el aspecto reutiliza clases existentes (.card/.avatar/.chips/.badge).
export function HomeProfessionalsStrip({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  return (
    <ul
      aria-label="Psicólogas y psicólogos voluntarios"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
        gap: "16px",
        listStyle: "none",
        padding: 0,
        margin: "0 0 var(--space-4)",
      }}
    >
      {professionals.map((professional) => {
        const signal = professionalResponseSignal(professional);
        const initial = professional.name.charAt(0).toUpperCase() || "·";
        return (
          <li key={professional.id}>
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

              {professional.nonClinicalHelper ? (
                <p
                  className="badge badge-new"
                  title="Acompaña de forma no clínica; no es un profesional con licencia."
                >
                  Auxiliar no clínico
                </p>
              ) : null}

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
