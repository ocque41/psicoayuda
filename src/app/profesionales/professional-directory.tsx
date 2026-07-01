"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { CrisisResources } from "@/components/crisis-resources";
import { needCategories, needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import {
  buildSearchBlob,
  detectCrisis,
  matchesFilters,
  queryTokens,
} from "@/lib/search";
import { FeedProfessionalCard } from "./professional-card";

// Especialidades e idiomas filtrables ("otro" se omite como opción de filtro).
const FILTER_AREAS = needCategories.filter((area) => area !== "otro");

// Atajos de búsqueda: las necesidades más comunes, a un toque. Cada uno solo
// rellena la barra (no es un filtro aparte) y cae en los sinónimos de abajo, así
// que devuelve resultados. Ayuda a quien no sabe con qué palabra empezar.
const QUICK_SEARCHES = [
  "Ansiedad",
  "Duelo",
  "Niños",
  "Pareja",
  "Insomnio",
  "Autoestima",
  "Terremoto",
];

// La lógica de búsqueda (diccionarios + normalización + match + crisis) vive en
// `@/lib/search`, con tests que blindan los términos cabecera y la detección de
// riesgo. Aquí solo se orquesta el estado de UI.
/**
 * Directorio público con barra de búsqueda + filtros, todo en el cliente sobre
 * la lista (pública, pequeña) que llega ya renderizada del servidor: búsqueda
 * por palabras clave instantánea, sin acentos, sin recargas, conservando el SSR
 * que ven los buscadores. Si la búsqueda sugiere riesgo, antepone los recursos
 * de crisis verificados.
 */
export function ProfessionalDirectory({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const searchId = useId();
  const areaId = useId();

  // Si llega ?q= (p. ej. desde el buscador de la portada), precarga la consulta.
  // En efecto de cliente para no tocar el SSR/ISR ni provocar mismatch.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQuery(initial);
  }, []);

  // Refleja la búsqueda en la URL (?q=) para poder compartir o guardar un
  // resultado filtrado. `replaceState` no navega, no recarga y no ensucia el
  // historial: solo mantiene la barra de direcciones en sincronía.
  useEffect(() => {
    const url = new URL(window.location.href);
    const trimmed = query.trim();
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [query]);

  // Índice de búsqueda: el blob normalizado se calcula UNA vez por lista, no en
  // cada tecla → la búsqueda es instantánea aunque crezca el equipo.
  const indexed = useMemo(
    () => professionals.map((pro) => ({ pro, blob: buildSearchBlob(pro) })),
    [professionals],
  );

  const filtered = useMemo(() => {
    const words = queryTokens(query);
    return indexed
      .filter(({ pro, blob }) => {
        if (words.length && !words.every((word) => blob.includes(word))) {
          return false;
        }
        return matchesFilters(pro, { area, onlyAvailable });
      })
      .map(({ pro }) => pro);
  }, [indexed, query, area, onlyAvailable]);

  // Riesgo: si la consulta sugiere autolesión/suicidio, anteponemos los recursos
  // de crisis (Nido no atiende emergencias en tiempo real).
  const crisisIntent = useMemo(() => detectCrisis(query), [query]);

  const hasFilters = query.trim() !== "" || area !== "" || onlyAvailable;

  function clearFilters() {
    setQuery("");
    setArea("");
    setOnlyAvailable(false);
  }

  // Sin voluntarios aprobados todavía: mensaje cálido, no un vacío seco.
  if (professionals.length === 0) {
    return (
      <div className="card">
        <p>
          Aún estamos sumando voluntarios verificados. Mientras tanto, puedes{" "}
          <Link href="/ayuda">dejar tu solicitud</Link> y una persona del equipo
          te contactará por correo.
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        aria-label="Buscar y filtrar profesionales"
        onSubmit={(event) => event.preventDefault()}
        style={{ margin: "0 0 var(--space-6)" }}
      >
        <div className="field" style={{ marginBottom: "var(--space-6)" }}>
          <label htmlFor={searchId} style={{ fontSize: "1.05rem" }}>
            Busca lo que necesitas
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej.: ansiedad, miedo, no puedo dormir, duelo, niños…"
            autoComplete="off"
            style={{ minHeight: 54 }}
          />
          <p className="hint" style={{ margin: "2px 0 0" }}>
            Escribe con tus palabras: cómo te sientes, qué pasó, o el nombre de
            quien buscas.
          </p>
        </div>

        <div style={{ margin: "0 0 var(--space-6)" }}>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Búsquedas frecuentes:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_SEARCHES.map((term) => {
              const active = query.trim().toLowerCase() === term.toLowerCase();
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  aria-pressed={active}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 44,
                    border: `1px solid ${active ? "#245f47" : "#c5ddc5"}`,
                    background: active ? "#e6f1ea" : "#fff",
                    color: "inherit",
                    borderRadius: 999,
                    padding: "8px 16px",
                    fontSize: "0.95rem",
                    cursor: "pointer",
                  }}
                >
                  {term}
                </button>
              );
            })}
          </div>
        </div>

        <p style={{ fontWeight: 600, margin: "0 0 var(--space-3)" }}>
          O filtra por:
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "flex-end",
          }}
        >
          <div className="field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
            <label htmlFor={areaId}>Especialidad</label>
            <select
              id={areaId}
              value={area}
              onChange={(event) => setArea(event.target.value)}
            >
              <option value="">Todas las especialidades</option>
              {FILTER_AREAS.map((key) => (
                <option key={key} value={key}>
                  {needLabels[key]}
                </option>
              ))}
            </select>
          </div>

          <fieldset
            style={{
              flex: "0 1 auto",
              margin: 0,
              border: 0,
              padding: 0,
              minInlineSize: 0,
            }}
          >
            <legend style={{ fontWeight: 600, padding: 0, marginBottom: 6 }}>
              Disponibilidad
            </legend>
            <div className="checks" style={{ margin: 0 }}>
              <label>
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(event) => setOnlyAvailable(event.target.checked)}
                />
                <span>Solo disponibles ahora</span>
              </label>
            </div>
          </fieldset>
        </div>

        {hasFilters ? (
          <p style={{ margin: "var(--space-3) 0 0" }}>
            <button
              type="button"
              className="button secondary"
              onClick={clearFilters}
            >
              Limpiar búsqueda y filtros
            </button>
          </p>
        ) : null}
      </form>

      {/* Riesgo detectado en la búsqueda → recursos de crisis verificados arriba
          del todo. Nido no atiende emergencias en tiempo real. */}
      {crisisIntent ? <CrisisResources variant="callout" /> : null}

      {/* Encabezado de sección para lectores de pantalla: las tarjetas usan h3,
          así que sin este h2 la jerarquía saltaría de h1 a h3 (fallo WCAG). Se
          oculta visualmente porque el recuento de abajo ya rotula los resultados
          para quien ve la pantalla. */}
      <h2
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Resultados
      </h2>

      {/* Región viva: anuncia el recuento o el "sin resultados" al filtrar en
          vivo (WCAG 4.1.3). El recuento es neutral; "disponibles" solo se afirma
          cuando ese filtro está activo (cada tarjeta muestra su cupo real). */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {filtered.length === 0 ? (
          <div className="card">
            <p>
              No hay personas que coincidan con tu búsqueda. Prueba con otras
              palabras o quita algún filtro, o{" "}
              <Link href="/ayuda">deja tu solicitud</Link> y te conectamos con
              alguien afín.
            </p>
          </div>
        ) : (
          <p className="muted">
            {filtered.length} {filtered.length === 1 ? "persona" : "personas"}
            {onlyAvailable
              ? filtered.length === 1
                ? " disponible ahora"
                : " disponibles ahora"
              : ""}
            .
          </p>
        )}
      </div>

      {filtered.length > 0 ? (
        <>
          <div className="grid grid-2">
            {filtered.map((professional) => (
              <FeedProfessionalCard
                key={professional.id}
                professional={professional}
              />
            ))}
          </div>
          <p className="reassurance">
            ¿Prefieres que te conectemos sin elegir? Deja tu mensaje en{" "}
            <Link href="/ayuda">pedir apoyo</Link> y le llega a todo el equipo
            voluntario.
          </p>
        </>
      ) : null}
    </>
  );
}
