import { languageLabels, needLabels, needSeekerLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";

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
    "ansiedad angustia depresión tristeza estrés pánico nervios preocupación insomnio ánimo miedo miedos fobia fobias social ataque ataques deprimido deprimida deprimir ansioso ansiosa decaído bajón dormir duermo sueño soledad solo sola vacío burnout agotamiento quemado laboral trabajo cansancio económico dinero deudas plata ira enojo rabia enfado",
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
  "psicólogo psicóloga psicología psicológica psicológico salud mental bienestar terapia terapeuta consulta sesión apoyo emocional ayuda profesional acompañamiento atención gratis gratuito gratuita online distancia remoto virtual internet";

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
