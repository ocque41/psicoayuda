// Constantes y etiquetas de la lista de espera para personas que necesitan
// apoyo psicológico por motivos AJENOS al terremoto. Sin `server-only` a
// propósito: las usan tanto el servidor (validación, acciones, admin) como los
// componentes de cliente (topes de longitud y valores del formulario).

export const waitlistStatuses = [
  "waiting",
  "contacted",
  "matched",
  "closed",
] as const;
export type WaitlistStatus = (typeof waitlistStatuses)[number];

/**
 * Desde dónde se envió el formulario. Nos permite medir qué punto de la web
 * convierte y queda como dato no personal en la fila. `chat` es la tarjeta que
 * el profesional envía dentro de una conversación.
 */
export const waitlistSources = [
  "profesionales",
  "ayuda",
  "lista-de-espera",
  "chat",
] as const;
export type WaitlistSource = (typeof waitlistSources)[number];

export const waitlistStatusLabels: Record<WaitlistStatus, string> = {
  waiting: "En espera",
  contacted: "Contactada",
  matched: "En acompañamiento",
  closed: "Cerrada",
};

export const waitlistSourceLabels: Record<WaitlistSource, string> = {
  profesionales: "Directorio de profesionales",
  ayuda: "Página de pedir ayuda",
  "lista-de-espera": "Página de la lista de espera",
  chat: "Chat con un profesional",
};

// Límite de anotaciones NUEVAS por correo o conexión en una hora (mismo patrón
// antiabuso que el formulario de contacto público).
export const WAITLIST_LIMIT_PER_HOUR = 3;

// Tope del título breve ("¿Con qué necesitas ayuda?").
export const WAITLIST_TITLE_MAX_LENGTH = 120;

// Anonimización por retención: una anotación sin actividad durante 12 meses
// borra sus datos personales (correo, título y descripción) y queda cerrada.
export const WAITLIST_ANONYMIZE_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

// Mínimo y tope de la descripción.
export const WAITLIST_DESCRIPTION_MIN_LENGTH = 20;
export const WAITLIST_DESCRIPTION_MAX_LENGTH = 1500;

// Ruta canónica que explica la lista de espera y contiene el formulario.
export const WAITLIST_PATH = "/lista-de-espera";
