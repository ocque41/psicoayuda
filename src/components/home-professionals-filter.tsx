"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { HomeProfessionalsStrip } from "@/components/home-professionals-strip";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";

function areaLabel(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
}

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: "999px",
    border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent-strong)" : "var(--foreground)",
    fontWeight: active ? 650 : 500,
    fontSize: "0.95rem",
    lineHeight: 1.2,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "border-color 0.15s ease, background 0.15s ease",
  };
}

/**
 * Filtro por área para la portada: en vez de un buscador de texto, muestra chips
 * con las áreas de las personas voluntarias disponibles; al elegir una, la tira
 * de abajo se reduce a quienes acompañan en esa área. "Todas" limpia el filtro.
 * Filtra en cliente sobre la lista ya cargada (no pega a la BD por clic).
 */
export function HomeProfessionalsFilter({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  const [area, setArea] = useState<string | null>(null);

  // Áreas presentes entre las personas disponibles, las más comunes primero (así
  // los filtros con resultados salen antes). Solo se ofrecen filtros que existen.
  const areas = useMemo(() => {
    const count = new Map<string, number>();
    for (const professional of professionals) {
      for (const code of professional.supportAreas) {
        count.set(code, (count.get(code) ?? 0) + 1);
      }
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code);
  }, [professionals]);

  const filtered = useMemo(
    () =>
      area
        ? professionals.filter((professional) =>
            professional.supportAreas.includes(area),
          )
        : professionals,
    [professionals, area],
  );

  return (
    <div>
      {/* biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label es ARIA válido para un grupo de filtros; un <fieldset> añadiría borde/legend innecesarios */}
      <div
        role="group"
        aria-label="Filtrar por lo que necesitas"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          justifyContent: "center",
          margin: "0 auto var(--space-4)",
          maxWidth: "var(--measure)",
        }}
      >
        <button
          type="button"
          aria-pressed={area === null}
          onClick={() => setArea(null)}
          style={chipStyle(area === null)}
        >
          Todas
        </button>
        {areas.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={area === code}
            onClick={() =>
              setArea((current) => (current === code ? null : code))
            }
            style={chipStyle(area === code)}
          >
            {areaLabel(code)}
          </button>
        ))}
      </div>

      <p className="muted" aria-live="polite">
        {filtered.length === 1
          ? "1 psicóloga o psicólogo disponible"
          : `${filtered.length} psicólogas y psicólogos disponibles`}
        {area ? ` en ${areaLabel(area).toLowerCase()}` : ""}.
      </p>

      {filtered.length > 0 ? (
        <HomeProfessionalsStrip professionals={filtered} />
      ) : (
        <p className="muted">
          Ahora mismo no hay nadie disponible en esa área. Prueba con otra o{" "}
          <a href="/ayuda">deja tu solicitud</a> y te conectamos con alguien
          afín.
        </p>
      )}
    </div>
  );
}
