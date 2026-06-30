import "server-only";

import { sendEmail } from "@/lib/email";
import { buildNewMessageEmail } from "@/lib/email-templates";

function appBaseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export function conversationUrl(conversationId: string) {
  return `${appBaseUrl()}/c/${conversationId}`;
}

export async function notifyAdminHelpRequest(_helpRequestId: string) {
  if (!process.env.NOTIFICATION_EMAIL) return;
  // Email provider is intentionally not wired in the MVP.
  // Configure this when a concrete provider is selected.
}

export async function notifyProfessionalAssignment(_professionalEmail: string) {
  if (!process.env.CONTACT_FROM_EMAIL) return;
  // Email provider is intentionally not wired in the MVP.
  // Configure this when a concrete provider is selected.
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
