"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { professionalResponseSignal } from "@/lib/response-bucket";

function areaName(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
}

// Carrusel de la home: muestra 3 fichas a la vez y avanza solo, suave, de una en
// una (aparecen "poco a poco"). Pausa al pasar el ratón/tocar y respeta
// prefers-reduced-motion. El scroll manual sigue disponible. El detalle y el
// contacto viven en /profesionales (fichas completas). Layout inline; el aspecto
// reutiliza clases existentes (.card/.avatar/.chips/.badge).
export function HomeProfessionalsStrip({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let paused = false;
    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };
    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);

    const id = window.setInterval(() => {
      if (paused) return;
      const first = el.querySelector("li");
      const step = first
        ? first.getBoundingClientRect().width + 16
        : el.clientWidth;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({
        left: atEnd ? 0 : el.scrollLeft + step,
        behavior: "smooth",
      });
    }, 3500);

    return () => {
      window.clearInterval(id);
      el.removeEventListener("pointerenter", pause);
      el.removeEventListener("pointerleave", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
    };
  }, []);

  return (
    <ul
      ref={trackRef}
      aria-label="Psicólogas y psicólogos voluntarios"
      // tabIndex=0: Firefox y Safari no hacen enfocables por teclado los
      // contenedores con overflow; sin esto no se podría desplazar con teclado
      // (WCAG 2.1.1). El aria-label le da nombre.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: contenedor con overflow enfocable por teclado (WCAG 2.1.1)
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
            style={{
              // 3 visibles en escritorio (2 huecos de 16px); en móvil el mínimo
              // manda y el carrusel se desliza mostrando ~1,5 fichas.
              flex: "0 0 calc((100% - 32px) / 3)",
              minWidth: "240px",
              scrollSnapAlign: "start",
            }}
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
