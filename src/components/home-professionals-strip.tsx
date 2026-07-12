import Link from "next/link";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { professionalResponseSignal } from "@/lib/response-bucket";

function areaName(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
}

// Carrusel de la home: misma interacción que el carrusel de aliados
// (scroll horizontal, snap y fade lateral). El detalle y el contacto viven en
// /profesionales (fichas completas).
export function HomeProfessionalsStrip({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  return (
    <ul
      aria-label="Psicólogas y psicólogos voluntarios"
      className="professionals-carousel"
      // tabIndex=0: Firefox y Safari no hacen enfocables por teclado los
      // contenedores con overflow; sin esto no se podría desplazar con teclado
      // (WCAG 2.1.1). El aria-label le da nombre.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: contenedor con overflow enfocable por teclado (WCAG 2.1.1)
      tabIndex={0}
    >
      {professionals.map((professional) => {
        const signal = professionalResponseSignal(professional);
        const initial = professional.name.charAt(0).toUpperCase() || "·";
        return (
          <li className="professional-slide" key={professional.id}>
            <Link
              href="/profesionales"
              className="card professional-carousel-link"
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
                  <h3>{professional.name}</h3>
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
