"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { FeedProfessionalCard } from "@/app/profesionales/professional-card";
import { CrisisResources } from "@/components/crisis-resources";
import { needSeekerLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import {
  type Organization,
  orgServiceLabels,
  orgSpecialtyLabels,
} from "@/lib/organizations";
import {
  buildOrgSearchBlob,
  buildSearchBlob,
  detectCrisis,
  organizationMatchesSupport,
  professionalMatchesSupport,
  queryTokens,
  type SupportType,
} from "@/lib/search";
import { OrganizationCard } from "./organization-card";

// Atajos de búsqueda: las necesidades más comunes, a un toque. Solo rellenan la
// barra (caen en los sinónimos), así que devuelven resultados sin ser un filtro
// aparte. Ayudan a quien no sabe con qué palabra empezar.
const QUICK_SEARCHES = [
  "Ansiedad",
  "Duelo",
  "Niños",
  "Autismo",
  "Pareja",
  "Insomnio",
  "Autoestima",
];

// Espera antes de aplicar lo tecleado (no filtra ni reescribe la URL en cada
// pulsación). Los clics (atajos, limpiar) se aplican al instante, sin esperar.
const SEARCH_DEBOUNCE_MS = 250;

function normalizeType(value: string | undefined): SupportType {
  return value === "psicologo" ||
    value === "auxiliar" ||
    value === "organizacion"
    ? value
    : "";
}

export type SupportInitialFilters = {
  q?: string;
  type?: string;
  topic?: string;
  onlyAvailable?: boolean;
};

/**
 * Directorio público de "pedir ayuda": una sola barra de búsqueda + filtros sobre
 * la lista (pública, pequeña) que llega ya renderizada del servidor. Reúne a las
 * personas voluntarias (psicólogas/os y auxiliares no clínicos) y a las
 * organizaciones aliadas, con filtros por tipo, por tema y por disponibilidad.
 *
 * Estado de filtros COMPARTIBLE: se inicializa desde `initialFilters` (que la
 * página lee de la URL en el servidor → el primer render ya sale filtrado, sin
 * parpadeo ni spinner) y se refleja en la URL (`?q`, `?tipo`, `?tema`, `?disp`)
 * con `replaceState`. La barra lleva debounce. Si la búsqueda sugiere riesgo,
 * antepone los recursos de crisis verificados.
 */
export function SupportDirectory({
  professionals,
  organizations,
  initialFilters,
}: {
  professionals: FeedProfessional[];
  organizations: Organization[];
  initialFilters?: SupportInitialFilters;
}) {
  // `input` controla la barra (inmediato); `query` es lo que filtra y va a la URL
  // (con debounce). Ambos arrancan del valor inicial que llega del servidor.
  const initialQuery = initialFilters?.q ?? "";
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<SupportType>(
    normalizeType(initialFilters?.type),
  );
  const [topic, setTopic] = useState(initialFilters?.topic ?? "");
  const [onlyAvailable, setOnlyAvailable] = useState(
    initialFilters?.onlyAvailable ?? false,
  );
  const searchId = useId();
  const typeId = useId();
  const topicId = useId();

  // Debounce: la barra actualiza `input` al instante, pero `query` (filtrado +
  // URL) espera a que dejes de teclear.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // Refleja los filtros en la URL para poder compartir/guardar el resultado.
  // `replaceState` no navega, no recarga y no ensucia el historial.
  useEffect(() => {
    const url = new URL(window.location.href);
    const setParam = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    setParam("q", query.trim());
    setParam("tipo", type);
    setParam("tema", topic);
    setParam("disp", onlyAvailable ? "1" : "");
    window.history.replaceState(null, "", url.toString());
  }, [query, type, topic, onlyAvailable]);

  // Aplica una consulta al instante (atajos, limpiar): sin esperar al debounce.
  function applyQuery(value: string) {
    setInput(value);
    setQuery(value);
  }

  // Grupos realmente presentes: solo ofrecemos filtros que pueden dar resultados.
  const hasAux = professionals.some((pro) => pro.nonClinicalHelper);
  const hasPsy = professionals.some((pro) => !pro.nonClinicalHelper);
  const hasOrgs = organizations.length > 0;
  const typeGroupCount = [hasPsy, hasAux, hasOrgs].filter(Boolean).length;

  // Temas presentes (honestos): áreas de las personas, enfoques y servicios de
  // las organizaciones que de verdad existen en la lista.
  const presentAreas = useMemo(() => {
    const set = new Set<string>();
    for (const pro of professionals) {
      for (const area of pro.supportAreas) {
        if (area !== "otro") set.add(area);
      }
    }
    return [...set];
  }, [professionals]);

  const presentSpecialties = useMemo(() => {
    const set = new Set<string>();
    for (const org of organizations) {
      for (const specialty of org.specialties) set.add(specialty);
    }
    return [...set];
  }, [organizations]);

  const presentServices = useMemo(() => {
    const set = new Set<string>();
    for (const org of organizations) {
      for (const service of org.services) set.add(service);
    }
    return [...set];
  }, [organizations]);

  // Índices de búsqueda: los blobs normalizados se calculan UNA vez por lista.
  const indexedPros = useMemo(
    () => professionals.map((pro) => ({ pro, blob: buildSearchBlob(pro) })),
    [professionals],
  );
  const indexedOrgs = useMemo(
    () => organizations.map((org) => ({ org, blob: buildOrgSearchBlob(org) })),
    [organizations],
  );

  const words = useMemo(() => queryTokens(query), [query]);
  const filters = useMemo(
    () => ({ type, topic, onlyAvailable }),
    [type, topic, onlyAvailable],
  );

  const matchedPros = useMemo(
    () =>
      indexedPros
        .filter(({ blob }) => words.every((word) => blob.includes(word)))
        .filter(({ pro }) => professionalMatchesSupport(pro, filters))
        .map(({ pro }) => pro),
    [indexedPros, words, filters],
  );

  const matchedOrgs = useMemo(
    () =>
      indexedOrgs
        .filter(({ blob }) => words.every((word) => blob.includes(word)))
        .filter(({ org }) => organizationMatchesSupport(org, filters))
        .map(({ org }) => org),
    [indexedOrgs, words, filters],
  );

  const total = matchedPros.length + matchedOrgs.length;

  // Firma de los filtros: al cambiar, re-montamos las rejillas para que la
  // animación de entrada (stagger) se reproduzca de nuevo.
  const resultKey = `${type}|${topic}|${onlyAvailable ? "1" : "0"}|${query}`;

  // Riesgo: si la consulta sugiere autolesión/suicidio, anteponemos los recursos
  // de crisis (Nido no atiende emergencias en tiempo real).
  const crisisIntent = useMemo(() => detectCrisis(query), [query]);

  const hasActiveFilters =
    input.trim() !== "" || type !== "" || topic !== "" || onlyAvailable;

  function clearFilters() {
    applyQuery("");
    setType("");
    setTopic("");
    setOnlyAvailable(false);
  }

  // Sin nadie ni ninguna organización todavía: mensaje cálido, no un vacío seco.
  if (professionals.length === 0 && organizations.length === 0) {
    return (
      <div className="card">
        <p>
          Aún estamos sumando personas voluntarias y organizaciones verificadas.
          Mientras tanto, puedes{" "}
          <Link href="/ayuda#formulario">dejar tu solicitud</Link> y una persona
          del equipo te contactará por correo.
        </p>
      </div>
    );
  }

  return (
    <>
      <form
        aria-label="Buscar y filtrar apoyo"
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
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ej.: ansiedad, no puedo dormir, duelo, niños, autismo…"
            autoComplete="off"
            style={{ minHeight: 54 }}
          />
          <p className="hint" style={{ margin: "2px 0 0" }}>
            Escribe con tus palabras: cómo te sientes, qué pasó, el servicio o
            el nombre de quien buscas.
          </p>
        </div>

        <div style={{ margin: "0 0 var(--space-6)" }}>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Búsquedas frecuentes:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_SEARCHES.map((term) => {
              const active = input.trim().toLowerCase() === term.toLowerCase();
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => applyQuery(term)}
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
          {typeGroupCount > 1 ? (
            <div
              className="field"
              style={{ flex: "1 1 200px", marginBottom: 0 }}
            >
              <label htmlFor={typeId}>Tipo de apoyo</label>
              <select
                id={typeId}
                value={type}
                onChange={(event) => setType(event.target.value as SupportType)}
              >
                <option value="">Todos</option>
                {hasPsy ? (
                  <option value="psicologo">Psicólogas y psicólogos</option>
                ) : null}
                {hasAux ? (
                  <option value="auxiliar">Auxiliares no clínicos</option>
                ) : null}
                {hasOrgs ? (
                  <option value="organizacion">Organizaciones</option>
                ) : null}
              </select>
            </div>
          ) : null}

          {presentAreas.length ||
          presentSpecialties.length ||
          presentServices.length ? (
            <div
              className="field"
              style={{ flex: "1 1 220px", marginBottom: 0 }}
            >
              <label htmlFor={topicId}>Tema o servicio</label>
              <select
                id={topicId}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              >
                <option value="">Cualquier tema</option>
                {presentAreas.length ? (
                  <optgroup label="Cómo te sientes / qué necesitas">
                    {presentAreas.map((area) => (
                      <option key={area} value={`area:${area}`}>
                        {needSeekerLabels[
                          area as keyof typeof needSeekerLabels
                        ] ?? area}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {presentSpecialties.length ? (
                  <optgroup label="Organizaciones · enfoque">
                    {presentSpecialties.map((specialty) => (
                      <option key={specialty} value={`spec:${specialty}`}>
                        {orgSpecialtyLabels[
                          specialty as keyof typeof orgSpecialtyLabels
                        ] ?? specialty}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {presentServices.length ? (
                  <optgroup label="Organizaciones · servicios">
                    {presentServices.map((service) => (
                      <option key={service} value={`svc:${service}`}>
                        {orgServiceLabels[
                          service as keyof typeof orgServiceLabels
                        ] ?? service}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
          ) : null}

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

        {hasActiveFilters ? (
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
          así que sin este h2 la jerarquía podría saltar de h1 a h3 en páginas sin
          otro h2 encima (p. ej. /profesionales). Se oculta visualmente porque el
          recuento de abajo ya rotula los resultados para quien ve la pantalla. */}
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
          vivo (WCAG 4.1.3). El `key` reproduce un fundido sutil al cambiar. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {total === 0 ? (
          <div className="card">
            <p>
              No hay resultados para tu búsqueda. Prueba con otras palabras o
              quita algún filtro, o{" "}
              <Link href="/ayuda#formulario">deja tu solicitud</Link> y te
              conectamos con alguien afín.
            </p>
          </div>
        ) : (
          <p className="muted support-count" key={total}>
            {total} {total === 1 ? "resultado" : "resultados"}
            {matchedPros.length && matchedOrgs.length
              ? ` · ${matchedPros.length} ${
                  matchedPros.length === 1 ? "persona" : "personas"
                } y ${matchedOrgs.length} ${
                  matchedOrgs.length === 1 ? "organización" : "organizaciones"
                }`
              : ""}
            .
          </p>
        )}
      </div>

      {matchedPros.length ? (
        <>
          {matchedOrgs.length ? <h3>Personas voluntarias</h3> : null}
          <div
            className="grid grid-2 support-stagger"
            key={`pros-${resultKey}`}
          >
            {matchedPros.map((professional) => (
              <FeedProfessionalCard
                key={professional.id}
                professional={professional}
              />
            ))}
          </div>
        </>
      ) : null}

      {matchedOrgs.length ? (
        <>
          <h3>Organizaciones aliadas</h3>
          <div
            className="grid grid-2 support-stagger"
            key={`orgs-${resultKey}`}
          >
            {matchedOrgs.map((organization) => (
              <OrganizationCard
                key={organization.id}
                organization={organization}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
