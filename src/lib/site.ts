/**
 * Configuración central de SEO y datos del sitio.
 *
 * Una sola fuente de verdad para metadatos, sitemap, robots, manifest,
 * imágenes Open Graph y datos estructurados (JSON-LD). No usa `server-only`
 * a propósito: son constantes puras importables desde cualquier contexto.
 */

// Dominio propio de producción. Es el *fallback* a propósito: `NEXT_PUBLIC_*`
// se inyecta en el bundle en *build time*, y nuestro build de Cloudflare no
// recibe esta variable (solo existe como `var` de runtime en wrangler.jsonc),
// así que este valor por defecto es el que realmente se publica en canonical,
// sitemap, robots, Open Graph y JSON-LD. Mantenlo igual al dominio real.
const RAW_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://saludmental-venezuela.com";

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
  "Ayuda psicológica en Venezuela | Encuentra tu psicólogo | Nido";

/** Plantilla de título para páginas internas. */
export const SITE_TITLE_TEMPLATE = "%s | Nido";

/** Descripción por defecto (~155 caracteres para no truncar en Google). */
export const SITE_DESCRIPTION =
  "Encuentra apoyo psicológico en Venezuela. Explora perfiles revisados, elige con quién hablar y empieza a tu ritmo, sin crear cuenta para contactar.";

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
    question: "¿Nido atiende emergencias?",
    answer:
      "No contamos con atención de emergencias en tiempo real. Si hay peligro inmediato, busca ayuda presencial o los servicios de emergencia de tu ubicación. La página de emergencia reúne recursos de apoyo.",
  },
  {
    question: "¿Cómo encuentro un profesional?",
    answer:
      "Explora el directorio por áreas de apoyo e idiomas. Si necesitas orientación para elegir, responde unas preguntas breves y revisa los perfiles sugeridos.",
  },
  {
    question: "¿Necesito crear una cuenta para contactar?",
    answer:
      "No. Puedes iniciar el contacto desde el perfil del profesional. Guarda tu enlace de acceso para volver a la conversación.",
  },
  {
    question: "¿Cómo funciona Ayuda Terremoto?",
    answer:
      "Es un programa separado de acompañamiento voluntario gratuito para personas afectadas por el terremoto, según disponibilidad. Puedes solicitarlo desde Ayuda Terremoto.",
  },
  {
    question: "¿Qué hace el orientador?",
    answer:
      "Ayuda a explorar perfiles según tus preferencias. No diagnostica ni sustituye una valoración profesional. Si hay peligro inmediato, busca ayuda presencial o los servicios de emergencia de tu ubicación.",
  },
];
