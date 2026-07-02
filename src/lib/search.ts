import { languageLabels, needLabels, needSeekerLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import {
  type Organization,
  type OrgService,
  type OrgSpecialty,
  orgServiceLabels,
  orgSpecialtyLabels,
} from "@/lib/organizations";
import { isAvailableNow } from "@/lib/response-bucket";

/**
 * Lógica pura del buscador del directorio (sin React), para poder testearla.
 *
 * El directorio busca en el cliente sobre una lista pública pequeña: normaliza
 * (sin acentos), expande sinónimos por especialidad, ignora palabras de relleno
 * y exige que TODAS las palabras que discriminan estén en el "blob" del
 * profesional (match AND por substring). Si la consulta sugiere autolesión,
 * `detectCrisis` lo marca para anteponer los recursos de crisis.
 *
 * Los tests en `search.test.ts` blindan los términos cabecera (salud mental,
 * ayuda psicológica, psicólogo gratis…) y la detección de crisis: son seguridad
 * y SEO, no deben regresar a cero silenciosamente al editar los diccionarios.
 */

// Sinónimos por especialidad: lo que de verdad escribe la gente (incluye formas
// coloquiales, adjetivos y términos venezolanos). Hace que la búsqueda libre
// encuentre al profesional aunque no use el término clínico.
export const AREA_KEYWORDS: Record<string, string> = {
  infancia_adolescencia:
    "niños niñas adolescentes infancia adolescencia menores hijos hija hijo escolar bullying acoso escolar infantil niñez",
  familia_pareja:
    "familia pareja matrimonio relación relaciones divorcio separación conflicto esposo esposa marido mujer novio novia mamá papá madre padre hermano hermana celos infidelidad ruptura migrante separados distancia familiar",
  duelo:
    "duelo pérdida luto muerte fallecimiento ausencia despedida migratorio migración emigrar emigración distancia",
  ansiedad_depresion:
    "ansiedad angustia depresión tristeza estrés pánico nervios preocupación insomnio ánimo miedo miedos fobia fobias social ataque ataques deprimido deprimida deprimir ansioso ansiosa decaído bajón dormir duermo sueño soledad solo sola vacío burnout agotamiento quemado laboral trabajo cansancio económico dinero deudas plata ira enojo rabia enfado desánimo desanimado desanimada desmotivado desmotivada desmotivación apatía apático llanto llorar desesperanza",
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
export const UNIVERSAL_KEYWORDS =
  "psicólogo psicóloga psicología psicológica psicológico salud mental bienestar terapia terapeuta psicoterapia consejería consejero consulta sesión apoyo emocional ayuda profesional acompañamiento atención gratis gratuito gratuita online distancia remoto virtual internet";

// Detección de riesgo (autolesión/suicidio): si la persona escribe esto, lo que
// necesita es ayuda inmediata, no un catálogo. Términos ya normalizados (sin
// acentos). "suicid" cubre suicidio/suicida/suicidarme; cubrimos también frases.
export const CRISIS_TERMS = [
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
export const STOPWORDS = new Set([
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
  "control",
  "controlar",
  "manejo",
  "manejar",
  "ayudar",
  "ayudame",
  "ayudarme",
  "alguien",
  "hola",
  "favor",
]);

// Quita acentos y baja a minúsculas para que "nino"=="niño", "ingles"=="inglés".
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Texto normalizado en el que se busca a un profesional: nombre, ciudad, país,
// sus áreas (+ etiquetas + sinónimos), idiomas, bio y los términos universales.
export function buildSearchBlob(pro: FeedProfessional): string {
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

// Palabras que sí discriminan en una consulta (normalizadas, sin vacías).
export function queryTokens(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOPWORDS.has(word));
}

// ¿El blob del profesional satisface toda la consulta? (match AND por substring).
export function blobMatchesQuery(blob: string, query: string): boolean {
  return queryTokens(query).every((word) => blob.includes(word));
}

// ¿La consulta sugiere autolesión/suicidio? (para anteponer recursos de crisis).
export function detectCrisis(query: string): boolean {
  const q = normalize(query.trim());
  return q.length >= 4 && CRISIS_TERMS.some((term) => q.includes(term));
}

export type DirectoryFilters = {
  area?: string;
  onlyAvailable?: boolean;
};

// Filtros exactos del directorio (especialidad, disponibilidad ahora). Van
// aparte del match por texto: un profesional debe pasar AMBOS. Un filtro
// vacío/false no restringe.
export function matchesFilters(
  pro: FeedProfessional,
  { area, onlyAvailable }: DirectoryFilters,
): boolean {
  if (area && !pro.supportAreas.includes(area)) return false;
  if (onlyAvailable && !isAvailableNow(pro)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Organizaciones aliadas: mismo buscador (una sola barra) también las encuentra.
// ---------------------------------------------------------------------------

// Sinónimos por servicio: lo que la gente escribe de verdad al buscar un servicio
// clínico. Hace que "rayos x", "pediatra" o "medicación" caigan en el servicio
// correcto aunque no usen el término exacto de la etiqueta.
export const ORG_SERVICE_KEYWORDS: Record<OrgService, string> = {
  medicina_general:
    "medicina general medico medica doctor doctora consulta medica salud fisica chequeo",
  radiologia:
    "radiologia rayos x ecografia ecografias imagenes resonancia tomografia radiografia",
  pediatria:
    "pediatria pediatra niños bebe bebes infantil pediatrico control niño",
  psiquiatria:
    "psiquiatria psiquiatra medicacion medicamentos tratamiento farmacologico salud mental",
  psicologia: "psicologia psicologo psicologa terapia emocional acompañamiento",
  neuropsicologia:
    "neuropsicologia neuropsicologo neuropsicologa cognitivo neurodesarrollo evaluacion neurologica atencion memoria",
  pedagogia_infantil:
    "pedagogia educacion infantil aprendizaje escolar desarrollo estimulacion pedagogo pedagoga",
};

// Sinónimos por enfoque/especialidad de la organización.
export const ORG_SPECIALTY_KEYWORDS: Record<OrgSpecialty, string> = {
  autismo:
    "autismo tea espectro autista asperger tgd trastorno del espectro neurodesarrollo condicion del espectro autista",
};

// Términos universales de una organización: van en TODAS las tarjetas para que
// búsquedas genéricas ("centro", "clínica", "fundación") también las encuentren.
export const ORG_UNIVERSAL_KEYWORDS =
  "organizacion organizaciones fundacion centro clinica institucion aliado aliada equipo profesionales atencion servicios";

// Texto normalizado en el que se busca a una organización: nombre, lema, ciudad,
// país, sus enfoques y servicios (+ etiquetas + sinónimos), la modalidad 24h y
// los términos universales.
export function buildOrgSearchBlob(org: Organization): string {
  const parts: string[] = [
    org.name,
    org.tagline ?? "",
    org.city ?? "",
    org.country ?? "",
  ];
  for (const specialty of org.specialties) {
    parts.push(orgSpecialtyLabels[specialty] ?? specialty);
    parts.push(ORG_SPECIALTY_KEYWORDS[specialty] ?? "");
  }
  for (const service of org.services) {
    parts.push(orgServiceLabels[service] ?? service);
    parts.push(ORG_SERVICE_KEYWORDS[service] ?? "");
  }
  if (org.virtual24h) {
    parts.push("asistencia virtual 24 horas online remoto disponible siempre");
  }
  if (org.searchHints) parts.push(org.searchHints);
  parts.push(ORG_UNIVERSAL_KEYWORDS);
  return normalize(parts.join(" "));
}

// Tipo de recurso en el directorio de apoyo. "" = todos.
export type SupportType = "" | "psicologo" | "auxiliar" | "organizacion";

// Filtros del directorio de apoyo unificado (personas + organizaciones). `topic`
// lleva prefijo para desambiguar la taxonomía elegida en el select combinado:
//   "area:<needCategory>"  → necesidad/especialidad de una persona
//   "spec:<orgSpecialty>"  → enfoque de una organización
//   "svc:<orgService>"     → servicio de una organización
export type SupportFilters = {
  type?: SupportType;
  topic?: string;
  onlyAvailable?: boolean;
};

function topicParts(topic?: string): {
  kind: "area" | "spec" | "svc" | "";
  value: string;
} {
  if (!topic) return { kind: "", value: "" };
  const [kind, ...rest] = topic.split(":");
  const value = rest.join(":");
  if ((kind === "area" || kind === "spec" || kind === "svc") && value) {
    return { kind, value };
  }
  return { kind: "", value: "" };
}

// ¿Una persona voluntaria pasa los filtros del directorio de apoyo? Los filtros
// de servicio/enfoque de organización la excluyen (no aplican a personas).
export function professionalMatchesSupport(
  pro: FeedProfessional,
  { type, topic, onlyAvailable }: SupportFilters,
): boolean {
  if (type === "organizacion") return false;
  if (type === "psicologo" && pro.nonClinicalHelper) return false;
  if (type === "auxiliar" && !pro.nonClinicalHelper) return false;

  const { kind, value } = topicParts(topic);
  if (kind === "spec" || kind === "svc") return false;
  if (kind === "area" && !pro.supportAreas.includes(value)) return false;

  if (onlyAvailable && !isAvailableNow(pro)) return false;
  return true;
}

// ¿Una organización pasa los filtros? Los tipos de persona la excluyen. "Solo
// disponibles ahora" solo mantiene organizaciones con atención virtual 24h.
export function organizationMatchesSupport(
  org: Organization,
  { type, topic, onlyAvailable }: SupportFilters,
): boolean {
  if (type === "psicologo" || type === "auxiliar") return false;

  const { kind, value } = topicParts(topic);
  if (kind === "area") return false;
  if (kind === "spec" && !org.specialties.includes(value as OrgSpecialty)) {
    return false;
  }
  if (kind === "svc" && !org.services.includes(value as OrgService)) {
    return false;
  }

  if (onlyAvailable && !org.virtual24h) return false;
  return true;
}
