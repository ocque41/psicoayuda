"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";

type Filter = { key: string; label: string };
type Entry = { id: string; areas: string[]; node: ReactNode };

// Filtro por tema en el cliente. Antes vivía en la URL (`?area=`), pero leer
// searchParams en el server volvía la página dinámica en cada request y anulaba
// el `revalidate = 60` (causa del Error 1102 / exceededCpu). Con estado local la
// página vuelve a ser estática/ISR y las tarjetas siguen renderizadas en el
// servidor (llegan como `entries[].node`); aquí solo elegimos cuáles se muestran.
export function DirectoryFilter({
  filters,
  entries,
}: {
  filters: Filter[];
  entries: Entry[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const activeLabel = filters.find((f) => f.key === active)?.label;
  const visible = active
    ? entries.filter((entry) => entry.areas.includes(active))
    : entries;

  return (
    <>
      <nav
        className="pro-filters"
        aria-label="Filtrar por tema"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          margin: "0 0 var(--space-6)",
        }}
      >
        <button
          type="button"
          className={active ? "button secondary" : "button"}
          aria-pressed={!active}
          onClick={() => setActive(null)}
        >
          Todas
        </button>
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={active === filter.key ? "button" : "button secondary"}
            aria-pressed={active === filter.key}
            onClick={() => setActive(filter.key)}
          >
            {filter.label}
          </button>
        ))}
      </nav>

      <p className="muted">
        {visible.length}{" "}
        {visible.length === 1 ? "persona disponible" : "personas disponibles"}
        {activeLabel ? ` en “${activeLabel}”` : ""}.
      </p>

      {visible.length === 0 ? (
        <div className="card">
          <p>
            Ahora mismo no hay voluntarios disponibles en “{activeLabel}”.{" "}
            <button
              type="button"
              onClick={() => setActive(null)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--link, inherit)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Ver todas las personas
            </button>{" "}
            o <Link href="/ayuda">deja tu solicitud</Link> y te conectamos con
            alguien afín.
          </p>
        </div>
      ) : (
        <div className="grid grid-2">{visible.map((entry) => entry.node)}</div>
      )}

      <p className="reassurance">
        ¿Prefieres que te conectemos sin elegir? Deja tu mensaje en{" "}
        <Link href="/ayuda">pedir apoyo</Link> y le llega a todo el equipo
        voluntario.
      </p>
    </>
  );
}
