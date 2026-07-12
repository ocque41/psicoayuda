export const contactSources = [
  "public_contact",
  "professional_dashboard",
] as const;
export type ContactSource = (typeof contactSources)[number];

export const contactCategories = [
  "question",
  "improvement",
  "problem",
  "other",
] as const;
export type ContactCategory = (typeof contactCategories)[number];

export const contactStatuses = ["new", "in_review", "resolved"] as const;
export type ContactStatus = (typeof contactStatuses)[number];

export const PUBLIC_CONTACT_LIMIT_PER_HOUR = 3;
export const PROFESSIONAL_CONTACT_LIMIT_PER_HOUR = 5;

export const contactCategoryLabels: Record<ContactCategory, string> = {
  question: "Tengo una pregunta",
  improvement: "Quiero proponer una mejora",
  problem: "Algo no funciona",
  other: "Otro motivo",
};

export const contactSourceLabels: Record<ContactSource, string> = {
  public_contact: "Página de contacto",
  professional_dashboard: "Panel profesional",
};

export const contactStatusLabels: Record<ContactStatus, string> = {
  new: "Nuevo",
  in_review: "En revisión",
  resolved: "Resuelto",
};

export function buildProfessionalReferralWhatsAppUrl(siteUrl: string) {
  const registrationUrl = new URL("/pro", siteUrl);
  registrationUrl.searchParams.set("modo", "registro");
  registrationUrl.searchParams.set("utm_source", "whatsapp");
  registrationUrl.searchParams.set("utm_medium", "referral");
  registrationUrl.searchParams.set("utm_campaign", "referidos_profesionales");
  registrationUrl.searchParams.set("utm_content", "panel_profesional");

  const message = [
    "Hola. Formo parte de Nido, una red de apoyo psicológico voluntario.",
    "Estamos sumando psicólogas y psicólogos que quieran acompañar gratis y a distancia a personas en Venezuela.",
    "Si te interesa conocer el proyecto y registrarte, puedes hacerlo aquí:",
    registrationUrl.toString(),
  ].join("\n\n");

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Better Auth redirige aquí solo cuando un acceso social crea una cuenta. Las
 * rutas ajenas al espacio profesional (por ejemplo /admin) quedan intactas.
 */
export function buildProfessionalNewUserCallbackUrl(callbackUrl: string) {
  if (!callbackUrl.startsWith("/pro")) return callbackUrl;
  const url = new URL(callbackUrl, "https://nido.local");
  url.searchParams.set("conversion", "signup");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildPreparedEmailUrl(
  email: string,
  subject: string,
  body?: string,
) {
  const params = new URLSearchParams({ subject });
  if (body) params.set("body", body);
  return `mailto:${email}?${params.toString()}`;
}

export function professionalContactFormInput(
  submitted: Record<string, unknown>,
  identity: { name: string; email: string },
) {
  return { ...submitted, name: identity.name, email: identity.email };
}
