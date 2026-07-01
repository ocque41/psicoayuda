"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { CrisisResources } from "@/components/crisis-resources";
import {
  languageLabels,
  languages,
  needCategories,
  needLabels,
  needSeekerLabels,
} from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { isAvailableNow } from "@/lib/response-bucket";
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

// Sinónimos por especialidad: lo que de verdad escribe la gente (incluye formas
// coloquiales, adjetivos y términos venezolanos). Hace que la búsqueda libre
// encuentre al profesional aunque no use el término clínico.
const AREA_KEYWORDS: Record<string, string> = {
  infancia_adolescencia:
    "niños niñas adolescentes infancia adolescencia menores hijos hija hijo escolar bullying acoso escolar infantil niñez",
  familia_pareja:
    "familia pareja matrimonio relación relaciones divorcio separación conflicto esposo esposa marido mujer novio novia mamá papá madre padre hermano hermana celos infidelidad ruptura migrante separados distancia familiar",
  duelo:
    "duelo pérdida luto muerte fallecimiento ausencia despedida migratorio migración emigrar emigración distancia",
  ansiedad_depresion:
    "ansiedad angustia depresión tristeza estrés pánico nervios preocupación insomnio ánimo miedo miedos fobia fobias ataque ataques deprimido deprimida deprimir ansioso ansiosa decaído bajón dormir duermo sueño soledad solo sola vacío burnout agotamiento quemado laboral trabajo cansancio económico dinero deudas plata",
  trauma_crisis:
    "trauma crisis tept estrés postraumático abuso violencia accidente desastre terremoto maltrato agresión acoso doméstica género amenaza suicidio suicida ideación autolesión autolesiones",
  adicciones: "adicciones consumo alcohol drogas dependencia juego apuestas",
  autoestima:
    "autoestima confianza inseguridad valoración desarrollo personal crecimiento",
  orientacion_general:
    "orientación general acompañamiento apoyo hablar escuchar no sé",
  otro: "otro",
};

// Términos comunes para el servicio en sí: cada voluntario ES psicólogo y ofrece
// acompañamiento GRATIS y A DISTANCIA, así que estos van en TODAS las tarjetas
// (incluye la modalidad: gratis/online/virtual/remoto son ciertos para todos).
const UNIVERSAL_KEYWORDS =
  "psicólogo psicóloga psicología psicológica psicológico salud mental bienestar terapia terapeuta consulta sesión apoyo emocional ayuda profesional acompañamiento atención gratis gratuito gratuita online distancia remoto virtual internet";

// Detección de riesgo (autolesión/suicidio): si la persona escribe esto, lo que
// necesita es ayuda inmediata, no un catálogo. Términos ya normalizados (sin
// acentos). "suicid" cubre suicidio/suicida/suicidarme; cubrimos también frases.
const CRISIS_TERMS = [
  "suicid",
  "autolesion",
  "matarme",
  "quitarme la vida",
  "no quiero vivir",
  "no quiero seguir",
  "no quiero existir",
  "me quiero morir",
  "quiero morir",
  "quiero desaparecer",
  "hacerme dano",
  "lastimarme",
  "cortarme",
  "acabar con todo",
  "acabar con mi vida",
  "terminar con mi vida",
];

// Palabras vacías (ya sin acentos): se ignoran al buscar, para que frases como
// "no puedo dormir", "me siento solo" o "ataque de pánico" se reduzcan a lo que
// importa ("dormir", "solo", "ataque panico") y encuentren al profesional.
const STOPWORDS = new Set([
  "no",
  "me",
  "mi",
  "mis",
  "tu",
  "te",
  "se",
  "le",
  "lo",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "a",
  "en",
  "con",
  "por",
  "para",
  "que",
  "y",
  "o",
  "u",
  "es",
  "soy",
  "estoy",
  "esta",
  "este",
  "muy",
  "mas",
  "puedo",
  "puede",
  "tengo",
  "tiene",
  "siento",
  "siente",
  "ando",
  "ser",
  "como",
  "cuando",
  "donde",
  "porque",
  "si",
  "ya",
  "tan",
  "sin",
  "mucho",
  "poco",
  "algo",
  "hay",
  "he",
  "ha",
  "su",
  "sus",
  "nos",
  // Relleno de intención: describen que la persona busca/necesita algo, no QUÉ
  // busca. Quitarlos evita que "problemas de pareja" o "busco psicólogo" caigan a
  // cero por el match AND (basta con que sobreviva la palabra que sí discrimina).
  "problemas",
  "problema",
  "necesito",
  "necesita",
  "necesitas",
  "busco",
  "buscar",
  "buscando",
  "quiero",
  "queria",
  "ayudar",
  "ayudame",
  "ayudarme",
  "alguien",
  "hola",
  "favor",
]);

// Quita acentos y baja a minúsculas para que "nino"=="niño", "ingles"=="inglés".
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function buildSearchBlob(pro: FeedProfessional): string {
  const parts: string[] = [pro.name, pro.city ?? "", pro.country ?? ""];
  for (const area of pro.supportAreas) {
    parts.push(area.replace(/_/g, " "));
    parts.push(needLabels[area as keyof typeof needLabels] ?? "");
    parts.push(needSeekerLabels[area as keyof typeof needSeekerLabels] ?? "");
    parts.push(AREA_KEYWORDS[area] ?? "");
  }
  for (const lang of pro.languages) {
    parts.push(languageLabels[lang as keyof typeof languageLabels] ?? lang);
  }
  if (pro.shortBio) parts.push(pro.shortBio);
  if (pro.crisisExperience) parts.push("experiencia en crisis emergencias");
  parts.push(UNIVERSAL_KEYWORDS);
  return normalize(parts.join(" "));
}

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
  const [language, setLanguage] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyCrisis, setOnlyCrisis] = useState(false);
  const searchId = useId();
  const areaId = useId();
  const langId = useId();

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
    const words = normalize(query)
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => !STOPWORDS.has(word));
    return indexed
      .filter(({ pro, blob }) => {
        if (words.length && !words.every((word) => blob.includes(word))) {
          return false;
        }
        if (area && !pro.supportAreas.includes(area)) return false;
        if (language && !pro.languages.includes(language)) return false;
        if (onlyAvailable && !isAvailableNow(pro)) return false;
        if (onlyCrisis && !pro.crisisExperience) return false;
        return true;
      })
      .map(({ pro }) => pro);
  }, [indexed, query, area, language, onlyAvailable, onlyCrisis]);

  // Riesgo: si la consulta sugiere autolesión/suicidio, anteponemos los recursos
  // de crisis (Nido no atiende emergencias en tiempo real).
  const crisisIntent = useMemo(() => {
    const q = normalize(query.trim());
    return q.length >= 4 && CRISIS_TERMS.some((term) => q.includes(term));
  }, [query]);

  const hasFilters =
    query.trim() !== "" ||
    area !== "" ||
    language !== "" ||
    onlyAvailable ||
    onlyCrisis;

  function clearFilters() {
    setQuery("");
    setArea("");
    setLanguage("");
    setOnlyAvailable(false);
    setOnlyCrisis(false);
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
                    border: `1px solid ${active ? "#245f47" : "#c5ddc5"}`,
                    background: active ? "#e6f1ea" : "#fff",
                    color: "inherit",
                    borderRadius: 999,
                    padding: "6px 14px",
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

          <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <label htmlFor={langId}>Idioma</label>
            <select
              id={langId}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="">Cualquier idioma</option>
              {languages.map((key) => (
                <option key={key} value={key}>
                  {languageLabels[key]}
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
              <label>
                <input
                  type="checkbox"
                  checked={onlyCrisis}
                  onChange={(event) => setOnlyCrisis(event.target.checked)}
                />
                <span>Con experiencia en crisis</span>
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
