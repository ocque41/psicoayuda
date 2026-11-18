import "server-only";
import { sendEmail } from "@/lib/email";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  formatMembershipPrice,
  type MembershipCurrency,
} from "@/lib/practice/membership-plan";
import { SITE_URL } from "@/lib/site";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );
}

type Recipient = {
  email: string;
  name: string | null;
  currency: MembershipCurrency;
};

function layout(input: {
  heading: string;
  greeting: string;
  paragraphs: string[];
  cta: string;
  url: string;
  footer: string;
}) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2723;line-height:1.6;padding:24px"><p style="font-size:14px;color:#245f47">Nido · A tu ritmo</p><h1 style="font-size:24px;color:#245f47">${escapeHtml(input.heading)}</h1><p>${escapeHtml(input.greeting)}</p>${input.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#2f7a5b;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none">${escapeHtml(input.cta)}</a></p><p style="font-size:13px;color:#6e655b">${escapeHtml(input.footer)}</p></div>`;
  const text = `${input.heading}\n\n${input.greeting}\n\n${input.paragraphs.join("\n\n")}\n\n${input.cta}: ${input.url}\n\n${input.footer}`;
  return { html, text };
}

function prices(currency: MembershipCurrency) {
  return `${formatMembershipPrice("month", currency)} al mes o ${formatMembershipPrice("year", currency)} al año`;
}

/**
 * Aceptación de una candidatura. Con los cobros abiertos lleva a activar el
 * plan; mientras están cerrados, lleva directo al panel y anuncia el plan.
 */
export function acceptanceEmailContent(
  recipient: Recipient,
  billingOpen: boolean,
) {
  const url = new URL(
    billingOpen ? "/pro/plan" : "/pro/dashboard",
    SITE_URL,
  ).toString();
  const subject = "Tu solicitud en Nido fue aceptada";
  return {
    subject,
    ...layout({
      heading: "Te damos la bienvenida a Nido",
      greeting: `Hola${recipient.name ? `, ${recipient.name}` : ""}:`,
      paragraphs: [
        "El equipo revisó tu perfil, tu credencial y tus respuestas, y tu solicitud fue aceptada.",
        billingOpen
          ? `El último paso es activar tu plan (${prices(recipient.currency)}). En cuanto se confirme, entras directamente a tu panel para organizar tu consulta.`
          : `Ya puedes entrar a tu panel y organizar tu consulta. Cuando abramos la activación de planes (${prices(recipient.currency)}) te escribiremos con el enlace.`,
      ],
      cta: billingOpen ? "Activar mi plan" : "Entrar a mi panel",
      url,
      footer:
        "Si no solicitaste unirte a Nido, puedes ignorar este correo. Para cualquier duda, responde a este mensaje.",
    }),
  };
}

/** Paso de un perfil anterior al plan de suscripción. */
export function migrationEmailContent(recipient: Recipient) {
  const url = new URL("/pro/plan", SITE_URL).toString();
  const subject = "Nido se actualiza: activa tu plan para continuar";
  return {
    subject,
    ...layout({
      heading: "Nido se actualiza",
      greeting: `Hola${recipient.name ? `, ${recipient.name}` : ""}:`,
      paragraphs: [
        "Gracias por acompañar a tantas personas desde Nido. Para seguir mejorando la plataforma, el panel profesional pasa a funcionar con una suscripción.",
        `Tu cuenta y todos tus datos (pacientes, notas, agenda e historial) están guardados. Para volver a tu panel, activa tu plan: ${prices(recipient.currency)}.`,
      ],
      cta: "Activar mi plan y volver a mi panel",
      url,
      footer:
        "Las conversaciones abiertas siguen disponibles desde los enlaces de tus avisos. Si tienes dudas, responde a este correo.",
    }),
  };
}

export async function sendPlanEmail(
  kind: "acceptance" | "migration",
  recipient: Recipient,
) {
  const content =
    kind === "acceptance"
      ? acceptanceEmailContent(recipient, membershipBillingReady())
      : migrationEmailContent(recipient);
  return sendEmail({ to: recipient.email, ...content });
}
