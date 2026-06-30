/**
 * Configuración central de SEO y datos del sitio.
 *
 * Una sola fuente de verdad para metadatos, sitemap, robots, manifest,
 * imágenes Open Graph y datos estructurados (JSON-LD). No usa `server-only`
 * a propósito: son constantes puras importables desde cualquier contexto.
 */

const RAW_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://ayudamental-venezuela.ocque41.workers.dev";

/** URL canónica de producción, sin barra final. */
export const SITE_URL = RAW_SITE_URL.replace(/\/+$/, "");

/** Nombre del producto/organización. */
export const SITE_NAME = "Nido";

/** Idioma y locale principales. El público objetivo está en Venezuela. */
export const SITE_LOCALE = "es_VE";
export const SITE_LANG = "es";

/**
 * Título por defecto, optimizado para la consulta principal
 * "ayuda psicológica venezuela" sin perder calidez.
 */
export const SITE_TITLE_DEFAULT =
  "Ayuda psicológica gratis tras el terremoto en Venezuela | Nido";

/** Plantilla de título para páginas internas. */
export const SITE_TITLE_TEMPLATE = "%s | Nido";

/** Descripción por defecto (~155 caracteres para no truncar en Google). */
export const SITE_DESCRIPTION =
  "Apoyo psicológico gratis y a distancia para afectados por los terremotos en Venezuela. Con voluntarios verificados, confidencial y sin crear cuenta.";

/**
 * Palabras clave objetivo. Google ya no usa la meta keywords para ranking,
 * pero la mantenemos como documentación viva de la intención de búsqueda y
 * la usamos para guiar el contenido visible (que sí pesa).
 */
export const SITE_KEYWORDS = [
  "ayuda psicológica terremoto Venezuela",
  "apoyo psicológico terremoto Venezuela",
  "ayuda emocional sismo Venezuela",
  "primeros auxilios psicológicos terremoto",
  "apoyo psicológico desastre Venezuela",
  "ayuda psicológica Venezuela",
  "ayuda psicológica gratis Venezuela",
  "psicólogo online gratis Venezuela",
  "apoyo emocional gratis",
  "salud mental Venezuela",
  "psicólogos voluntarios Venezuela",
  "ser psicólogo voluntario Venezuela",
  "fundaciones de salud mental Venezuela",
  "primeros auxilios psicológicos",
  "líneas de atención psicológica Venezuela",
];

/** País y región principales que sirve la plataforma. */
export const SITE_AREA_SERVED = "Venezuela";

/**
 * Correo de contacto público para datos estructurados.
 * Cae al de privacidad si está configurado; si no, se omite el contactPoint.
 */
export const SITE_CONTACT_EMAIL =
  process.env.PRIVACY_CONTACT_EMAIL?.trim() ||
  process.env.ABUSE_CONTACT_EMAIL?.trim() ||
  "";

/**
 * Token de verificación de Google Search Console.
 *
 * Cuando se configura `GOOGLE_SITE_VERIFICATION`, el layout emite la meta
 * `<meta name="google-site-verification">` automáticamente. Así, en cuanto
 * tengas el token, solo defines la variable y rediseñas: verificación lista.
 */
export const SITE_GOOGLE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() || "";

/** Construye una URL absoluta a partir de una ruta relativa. */
export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Preguntas frecuentes de la portada.
 *
 * Fuente única que alimenta TANTO el contenido visible como el JSON-LD
 * `FAQPage`. Google exige que el texto del schema coincida con el visible,
 * por eso se comparten desde aquí.
 */
export const HOME_FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "¿Es normal sentirme mal después del terremoto?",
    answer:
      "Sí. Tras un terremoto es muy común sentir miedo, ansiedad, tristeza, insomnio, irritabilidad o revivir lo ocurrido una y otra vez. Son reacciones normales ante una situación que no fue normal, y para la mayoría de las personas mejoran con apoyo y tiempo. Si te cuesta sobrellevarlo, hablar con un profesional voluntario puede ayudar; puedes escribirnos gratis y sin crear cuenta.",
  },
  {
    question: "¿La ayuda psicológica es realmente gratis?",
    answer:
      "Sí. Nido es un proyecto sin fines de lucro. La atención la brindan psicólogas y psicólogos voluntarios verificados que donan su tiempo. No se cobra a las personas que piden apoyo ni se solicita ningún dato de pago.",
  },
  {
    question: "¿Necesito crear una cuenta o dar mi identidad?",
    answer:
      "No. Para pedir apoyo no necesitas crear una cuenta ni dar tu nombre, cédula o ubicación exacta. Solo pedimos un correo de contacto para que una persona voluntaria pueda escribirte.",
  },
  {
    question: "¿Atienden en toda Venezuela?",
    answer:
      "Sí. La atención es a distancia (en línea), así que llega a cualquier estado de Venezuela —Caracas, Maracaibo, Valencia, Barquisimeto, Maracay y el resto del país— e incluso a personas venezolanas en el exterior. Solo necesitas conexión a internet o un correo electrónico.",
  },
  {
    question: "¿Es confidencial?",
    answer:
      "Sí. Tu mensaje solo lo ven el equipo de coordinación y, si corresponde, la persona voluntaria que te acompañe. No vendemos datos, no hacemos publicidad y pedimos la mínima información necesaria.",
  },
  {
    question: "¿Quiénes son los psicólogos voluntarios?",
    answer:
      "Son profesionales de la psicología que se registran, aceptan un código de conducta y pasan una verificación de credenciales antes de poder recibir solicitudes. Atienden de forma gratuita y dentro de sus áreas de competencia.",
  },
  {
    question: "¿Esto reemplaza una terapia o una emergencia?",
    answer:
      "No. Nido es apoyo emocional de acompañamiento, no un servicio de emergencias ni un sustituto de la atención médica o psicoterapia formal. Si estás en peligro inmediato, llama a los servicios de emergencia locales o busca ayuda presencial ahora mismo.",
  },
];
