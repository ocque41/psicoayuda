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
