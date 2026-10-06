import { MEMBERSHIP_PLAN, TRIAL_DAYS } from "@/lib/practice/membership-plan";

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

export type ProfessionalInvitationSource = "admission" | "professional";
export type ProfessionalInvitation = {
  registrationUrl: string;
  message: string;
  whatsappUrl: string;
  emailUrl: string;
};

function professionalInvitation(
  {
    siteUrl,
    source,
  }: { siteUrl: string; source: ProfessionalInvitationSource },
  campaignSource: "nido" | "whatsapp",
): ProfessionalInvitation {
  const site = new URL(siteUrl);
  if (
    !["https:", "http:"].includes(site.protocol) ||
    !["admission", "professional"].includes(source)
  )
    throw new Error("No se pudo preparar el enlace de invitación.");
  // La invitación nunca hereda credenciales, parámetros ni fragmentos del sitio.
  const registrationUrl = new URL("/pro", site.origin);
  registrationUrl.searchParams.set("modo", "registro");
  registrationUrl.searchParams.set("utm_source", campaignSource);
  registrationUrl.searchParams.set("utm_medium", "referral");
  registrationUrl.searchParams.set("utm_campaign", "referidos_profesionales");
  registrationUrl.searchParams.set(
    "utm_content",
    source === "admission" ? "panel_admision" : "panel_profesional",
  );

  const message = [
    "Hola. Te invito a conocer Nido, un CRM para psicólogas y psicólogos: agenda, fichas de pacientes, notas por sesión, conversaciones y seguimiento de cobros externos en un solo lugar.",
    `Tras la aprobación de tu perfil, puedes activar una prueba del software de ${TRIAL_DAYS} días gratis, sin tarjeta y sin cobro automático. Después, el plan del software es de ${MEMBERSHIP_PLAN.priceLabel} al mes, sólo si decides contratarlo.`,
    "El registro sigue la revisión profesional habitual de identidad, credenciales y ámbito de atención antes de publicar tu perfil. Las sesiones y sus pagos se acuerdan por separado con cada paciente. Ayuda Terremoto mantiene su apoyo psicológico gratuito por separado.",
    `Si quieres conocerlo y registrarte, empieza aquí:\n${registrationUrl.toString()}`,
  ].join("\n\n");

  return {
    registrationUrl: registrationUrl.toString(),
    message,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
    emailUrl: buildPreparedEmailUrl("", "Te invito a probar Nido", message),
  };
}

/** Contenido público constante: no incluye la identidad de quien invita. */
export function buildProfessionalInvitation(input: {
  siteUrl: string;
  source: ProfessionalInvitationSource;
}): ProfessionalInvitation {
  return professionalInvitation(input, "nido");
}

/** Conserva la campaña de los enlaces compartidos desde el panel anterior. */
export function buildProfessionalReferralWhatsAppUrl(siteUrl: string) {
  return professionalInvitation({ siteUrl, source: "professional" }, "whatsapp")
    .whatsappUrl;
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
