"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { needCategories, needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { isAvailableNow } from "@/lib/response-bucket";
import { FeedProfessionalCard } from "./professional-card";

// Especialidades filtrables (se excluye "otro", poco útil como filtro).
const FILTER_AREAS = needCategories.filter((area) => area !== "otro");

/**
 * Directorio público con búsqueda instantánea por nombre, especialidad y
 * disponibilidad. Filtra en el cliente sobre la lista (pública y pequeña) que
 * llega ya renderizada del servidor, así que sin recargas y sin perder el SSR
 * que ven los buscadores.
 */
export function ProfessionalDirectory({
  professionals,
}: {
  professionals: FeedProfessional[];
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const nameId = useId();
  const areaId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return professionals.filter((pro) => {
      if (q && !pro.name.toLowerCase().includes(q)) return false;
      if (area && !pro.supportAreas.includes(area)) return false;
      if (onlyAvailable && !isAvailableNow(pro)) return false;
      return true;
    });
  }, [professionals, query, area, onlyAvailable]);

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
        aria-label="Filtrar profesionales"
        onSubmit={(event) => event.preventDefault()}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "flex-end",
          margin: "0 0 var(--space-6)",
        }}
      >
        <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
          <label htmlFor={nameId}>Buscar por nombre</label>
          <input
            id={nameId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre de la persona"
            autoComplete="off"
          />
        </div>
        <div className="field" style={{ flex: "1 1 240px", marginBottom: 0 }}>
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
        <div className="field" style={{ flex: "0 1 auto", marginBottom: 0 }}>
          <span style={{ fontWeight: 600 }}>Disponibilidad</span>
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
        </div>
      </form>

      {/* Región viva: anuncia a lectores de pantalla el recuento o el "sin
          resultados" al filtrar en vivo (WCAG 4.1.3). El recuento es neutral:
          "disponibles" solo se afirma cuando el filtro de disponibilidad está
          activo (cada tarjeta ya muestra su cupo real). */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {filtered.length === 0 ? (
          <div className="card">
            <p>
              No hay personas que coincidan con tu búsqueda. Prueba con otra
              especialidad, quita algún filtro, o{" "}
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
