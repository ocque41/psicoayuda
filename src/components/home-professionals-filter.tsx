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
    padding: "6px 14px",
    borderRadius: "999px",
    border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent-strong)" : "var(--foreground)",
    fontWeight: active ? 650 : 500,
    fontSize: "0.9rem",
    lineHeight: 1.2,
    cursor: "pointer",
    fontFamily: "inherit",
    // No se encogen ni parten: la tira se desliza en horizontal en vez de apilarse.
    flex: "0 0 auto",
    whiteSpace: "nowrap",
    transition: "border-color 0.15s ease, background 0.15s ease",
  };
}

type TypeFilter = "all" | "psicologo" | "auxiliar";

/**
 * Filtros para la portada: por tipo (psicólogas/os con licencia vs auxiliares no
 * clínicos) y por área. El filtro por tipo solo aparece si hay de ambos, para no
 * ofrecer un filtro sin efecto. Filtra en cliente sobre la lista ya cargada (no
 * pega a la BD por clic).
 */
export function HomeProfessionalsFilter({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  const [type, setType] = useState<TypeFilter>("all");
  const [area, setArea] = useState<string | null>(null);

  // Solo ofrecemos el filtro por tipo si hay de ambos: con un único grupo, el
  // filtro no daría resultados distintos y solo añadiría ruido.
  const hasAux = useMemo(
    () => professionals.some((p) => p.nonClinicalHelper),
    [professionals],
  );
  const hasPsy = useMemo(
    () => professionals.some((p) => !p.nonClinicalHelper),
    [professionals],
  );

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
      professionals.filter((professional) => {
        if (type === "psicologo" && professional.nonClinicalHelper)
          return false;
        if (type === "auxiliar" && !professional.nonClinicalHelper)
          return false;
        if (area && !professional.supportAreas.includes(area)) return false;
        return true;
      }),
    [professionals, type, area],
  );

  const countLabel =
    type === "auxiliar"
      ? filtered.length === 1
        ? "1 auxiliar no clínico disponible"
        : `${filtered.length} auxiliares no clínicos disponibles`
      : type === "psicologo"
        ? filtered.length === 1
          ? "1 psicóloga o psicólogo disponible"
          : `${filtered.length} psicólogas y psicólogos disponibles`
        : filtered.length === 1
          ? "1 persona voluntaria disponible"
          : `${filtered.length} personas voluntarias disponibles`;

  return (
    <div>
      {hasAux && hasPsy ? (
        // biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label es ARIA válido para un grupo de filtros; un <fieldset> añadiría borde/legend innecesarios
        <div
          role="group"
          aria-label="Filtrar por tipo de acompañante"
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: "8px",
            overflowX: "auto",
            justifyContent: "flex-start",
            margin: "0 auto var(--space-2)",
            maxWidth: "var(--measure)",
            paddingBottom: "4px",
          }}
        >
          <button
            type="button"
            aria-pressed={type === "all"}
            onClick={() => setType("all")}
            style={chipStyle(type === "all")}
          >
            Todos
          </button>
          <button
            type="button"
            aria-pressed={type === "psicologo"}
            onClick={() => setType("psicologo")}
            style={chipStyle(type === "psicologo")}
          >
            Psicólogas y psicólogos
          </button>
          <button
            type="button"
            aria-pressed={type === "auxiliar"}
            onClick={() => setType("auxiliar")}
            style={chipStyle(type === "auxiliar")}
          >
            Auxiliares no clínicos
          </button>
        </div>
      ) : null}

      {/* biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label es ARIA válido para un grupo de filtros; un <fieldset> añadiría borde/legend innecesarios */}
      <div
        role="group"
        aria-label="Filtrar por lo que necesitas"
        style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: "8px",
          overflowX: "auto",
          justifyContent: "flex-start",
          margin: "0 auto var(--space-3)",
          maxWidth: "var(--measure)",
          paddingBottom: "4px",
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
        {countLabel}
        {area ? ` en ${areaLabel(area).toLowerCase()}` : ""}.
      </p>

      {filtered.length > 0 ? (
        <HomeProfessionalsStrip professionals={filtered} />
      ) : (
        <p className="muted">
          Ahora mismo no hay nadie disponible con ese filtro. Prueba con otro o{" "}
          <a href="/ayuda">deja tu solicitud</a> y te conectamos con alguien
          afín.
        </p>
      )}
    </div>
  );
}
