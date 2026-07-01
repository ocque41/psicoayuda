import "server-only";

import { getAllianceRecipients, getErrorAlertEmails } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import {
  buildApprovalEmail,
  buildErrorAlertEmail,
  buildFoundationContactEmail,
  buildNewMessageEmail,
  buildNewOfferEmail,
} from "@/lib/email-templates";

function appBaseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export function conversationUrl(conversationId: string) {
  return `${appBaseUrl()}/c/${conversationId}`;
}

function dashboardUrl() {
  return `${appBaseUrl()}/pro/dashboard`;
}

/**
 * Avisa al buzón de coordinación (NOTIFICATION_EMAIL) de que entró una nueva
 * solicitud, con un enlace a /admin. SIN PII: el correo solo dice que hay algo
 * que revisar; los datos viven tras el panel gateado por ADMIN_EMAILS.
 */
export async function notifyAdminHelpRequest(_helpRequestId: string) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return;
  const adminUrl = `${appBaseUrl()}/admin`;
  const text = [
    "Entró una nueva solicitud de apoyo en Nido.",
    "",
    `Revísala en el panel: ${adminUrl}`,
    "",
    "Por privacidad no incluimos datos de la persona en este correo.",
  ].join("\n");
  return sendEmail({
    to,
    subject: "Nueva solicitud de apoyo — Nido",
    html: `<p>Entró una nueva solicitud de apoyo en Nido.</p><p><a href="${adminUrl}">Revísala en el panel</a>.</p><p>Por privacidad no incluimos datos de la persona en este correo.</p>`,
    text,
  });
}

/**
 * Avisa a un profesional de que un coordinador le asignó una solicitud, con un
 * enlace a su panel. SIN datos de la persona (los ve dentro del panel).
 */
export async function notifyProfessionalAssignment(professionalEmail: string) {
  if (!professionalEmail) return;
  const dashboardUrl = `${appBaseUrl()}/pro/dashboard`;
  const text = [
    "Te asignaron una nueva solicitud de apoyo en Nido.",
    "",
    `Entra a tu panel para verla: ${dashboardUrl}`,
  ].join("\n");
  return sendEmail({
    to: professionalEmail,
    subject: "Te asignaron una solicitud — Nido",
    html: `<p>Te asignaron una nueva solicitud de apoyo en Nido.</p><p><a href="${dashboardUrl}">Entra a tu panel para verla</a>.</p>`,
    text,
  });
}

/**
 * PRIMERA PRIORIDAD: cuando alguien escribe a un profesional, le llega un correo
 * a su correo de registro avisando, con un botón que abre la conversación con la
 * persona que le escribió. Por confidencialidad NO incluye el contenido.
 *
 * Política de envío (mejor práctica anti-spam, estilo WhatsApp/Telegram): el
 * llamador (el Durable Object del chat) lo invoca cuando el profesional NO está
 * conectado a la sala, con debounce por conversación, no en cada mensaje.
 */
export async function notifyProfessionalNewMessage(input: {
  professionalEmail: string;
  conversationId: string;
  professionalName?: string | null;
  seekerLabel?: string;
}) {
  const mail = buildNewMessageEmail({
    conversationUrl: conversationUrl(input.conversationId),
    professionalName: input.professionalName ?? undefined,
    seekerLabel: input.seekerLabel,
  });

  return sendEmail({
    to: input.professionalEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: mail.headers,
  });
}

/**
 * Cuando un profesional acepta una solicitud difundida, avisamos al solicitante
 * (que no tiene cuenta) con un enlace de acceso seguro a la conversación. El
 * enlace lleva un token de un solo uso que abre el chat sin pedir registro.
 */
export async function notifySeekerOfferAccepted(input: {
  seekerEmail: string;
  conversationId: string;
  accessToken: string;
}) {
  const accessUrl = `${appBaseUrl()}/acceso/${input.accessToken}`;
  const subject = "Un profesional puede acompañarte — entra a tu conversación";
  const text = [
    "Hola,",
    "",
    "Un profesional voluntario de Nido aceptó tu solicitud y puede acompañarte.",
    "Entra a tu conversación privada (no necesitas crear cuenta):",
    accessUrl,
    "",
    "Por tu seguridad, no compartas datos que te identifiquen (dirección exacta, documentos).",
    "Si estás en peligro inmediato, llama al 911 o busca ayuda presencial ahora.",
    "",
    "— Equipo de Nido",
  ].join("\n");
  const html = `
    <p>Hola,</p>
    <p>Un profesional voluntario de Nido aceptó tu solicitud y puede acompañarte.</p>
    <p><a href="${accessUrl}">Entra a tu conversación privada</a> (no necesitas crear cuenta).</p>
    <p>Por tu seguridad, no compartas datos que te identifiquen (dirección exacta, documentos). Si estás en peligro inmediato, llama al <strong>911</strong> o busca ayuda presencial ahora.</p>
    <p>— Equipo de Nido</p>
  `;

  return sendEmail({ to: input.seekerEmail, subject, html, text });
}

/**
 * Avisa a los admins de que un usuario llegó a la página de error por un bug,
 * con el contexto para reproducirlo (usuario, ruta y qué botón/enlace lo lanzó).
 * Best-effort: nunca rompe el flujo del usuario y hace no-op si no hay
 * destinatarios ni proveedor de correo configurado.
 */
export async function notifyAdminClientError(report: {
  userLabel: string;
  path: string;
  message?: string;
  digest?: string;
  referrer?: string;
  userAgent?: string;
  stack?: string;
  lastAction?: { label?: string; href?: string; page?: string } | null;
  when: string;
}) {
  const recipients = getErrorAlertEmails();
  if (recipients.length === 0) return;
  const mail = buildErrorAlertEmail(report);
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    });
  }
}

/** Avisa a un profesional recién OFERTADO en una difusión ("enviar a todos"). */
export async function notifyProfessionalNewOffer(input: {
  professionalEmail: string;
  professionalName?: string | null;
  needLabel?: string;
  urgencyLabel?: string;
}) {
  if (!input.professionalEmail) return;
  const mail = buildNewOfferEmail({
    dashboardUrl: dashboardUrl(),
    professionalName: input.professionalName,
    needLabel: input.needLabel,
    urgencyLabel: input.urgencyLabel,
  });
  return sendEmail({
    to: input.professionalEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}

/**
 * Avisa a los admins de que una fundación/organización dejó sus datos para
 * aliarse (formulario /alianzas), con Reply-To al correo de la organización.
 * Destinatarios: `ALLIANCES_CONTACT_EMAIL` si está, si no los `ADMIN_EMAILS`.
 * No-op elegante si no hay destinatarios ni proveedor de correo configurado.
 */
export async function notifyFoundationContact(input: {
  contactName: string;
  organizationName: string;
  website?: string;
  email: string;
  message?: string;
}) {
  const recipients = getAllianceRecipients();
  if (recipients.length === 0) return;
  const mail = buildFoundationContactEmail(input);
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    });
  }
}

/** Avisa a un profesional de que su perfil fue APROBADO. */
export async function notifyProfessionalApproved(input: {
  professionalEmail: string;
  professionalName?: string | null;
}) {
  if (!input.professionalEmail) return;
  const mail = buildApprovalEmail({
    dashboardUrl: dashboardUrl(),
    professionalName: input.professionalName,
  });
  return sendEmail({
    to: input.professionalEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}
