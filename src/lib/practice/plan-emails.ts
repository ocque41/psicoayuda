import "server-only";
import { sendEmail } from "@/lib/email";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  EXISTING_PROFESSIONAL_TRIAL_DAYS,
  formatMembershipPrice,
  formatTrialDate,
  type MembershipCurrency,
  trialActive,
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
  /** Solo perfiles anteriores pasados a suscripción. */
  trialEndsAt?: string | null;
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
        "El equipo revisó tu solicitud (tu perfil y tus respuestas al cuestionario de admisión) y fue aceptada.",
        billingOpen
          ? `El último paso es activar tu plan (${prices(recipient.currency)}). En cuanto se confirme el pago, entras directamente a tu panel.`
          : `Ya puedes entrar a tu panel. Cuando abramos la activación de planes (${prices(recipient.currency)}) te escribiremos con el enlace.`,
      ],
      cta: billingOpen ? "Activar mi plan" : "Entrar a mi panel",
      url,
      footer:
        "Si no solicitaste unirte a Nido, puedes ignorar este correo. Para cualquier duda, responde a este mensaje.",
    }),
  };
}

/**
 * Solicitud no aceptada. No da el motivo (la referencia de Admisión es interna)
 * y deja una vía clara para preguntar: responder al correo.
 */
export function rejectionEmailContent(recipient: Recipient) {
  return {
    subject: "Sobre tu solicitud en Nido",
    ...layout({
      heading: "Gracias por tu interés en Nido",
      greeting: `Hola${recipient.name ? `, ${recipient.name}` : ""}:`,
      paragraphs: [
        "El equipo revisó con cuidado tu perfil y tus respuestas al cuestionario de admisión.",
        "Por ahora no podemos incorporarte a Nido. Esta decisión no es un juicio sobre tu valor como profesional: responde a los criterios con los que cuidamos a las personas que llegan a la plataforma.",
        "No se ha realizado ningún cobro. Si quieres más información o crees que falta algo en tu solicitud, responde a este correo y te contestamos.",
      ],
      cta: "Visitar Nido",
      url: new URL("/", SITE_URL).toString(),
      footer: "Si no solicitaste unirte a Nido, puedes ignorar este correo.",
    }),
  };
}

/**
 * Paso de un perfil anterior al plan de suscripción. Con la prueba activa,
 * el panel sigue abierto hasta la fecha indicada y no se cobra nada antes.
 */
export function migrationEmailContent(recipient: Recipient) {
  const url = new URL("/pro/plan", SITE_URL).toString();
  const greeting = `Hola${recipient.name ? `, ${recipient.name}` : ""}:`;
  const footer =
    "Las conversaciones abiertas siguen disponibles desde los enlaces de tus avisos. Si tienes dudas, responde a este correo.";
  if (recipient.trialEndsAt && trialActive(recipient.trialEndsAt)) {
    const date = formatTrialDate(recipient.trialEndsAt);
    return {
      subject: `Nido se actualiza: tienes ${EXISTING_PROFESSIONAL_TRIAL_DAYS} días gratis`,
      ...layout({
        heading: "Nido se actualiza",
        greeting,
        paragraphs: [
          "Gracias por acompañar a tantas personas desde Nido. Para seguir mejorando la plataforma, el panel profesional pasa a funcionar con una suscripción.",
          `Como ya formabas parte de Nido, tienes ${EXISTING_PROFESSIONAL_TRIAL_DAYS} días gratis: tu panel sigue funcionando igual hasta el ${date}.`,
          `Puedes activar tu plan cuando quieras (${prices(recipient.currency)}). No se cobra nada hasta el ${date}, y puedes cancelar antes sin coste.`,
          "Si al terminar la prueba no hay un plan activo, el panel queda en pausa, pero tus pacientes, notas, agenda e historial se conservan y vuelven en cuanto lo actives.",
        ],
        cta: "Activar mi plan",
        url,
        footer,
      }),
    };
  }
  return {
    subject: "Nido se actualiza: activa tu plan para continuar",
    ...layout({
      heading: "Nido se actualiza",
      greeting,
      paragraphs: [
        "Gracias por acompañar a tantas personas desde Nido. Para seguir mejorando la plataforma, el panel profesional pasa a funcionar con una suscripción.",
        `Tu cuenta y todos tus datos (pacientes, notas, agenda e historial) están guardados. Para volver a tu panel, activa tu plan: ${prices(recipient.currency)}.`,
      ],
      cta: "Activar mi plan y volver a mi panel",
      url,
      footer,
    }),
  };
}

/** Aviso único 7 días antes de que termine la prueba gratuita. */
export function trialReminderEmailContent(
  recipient: Recipient & { trialEndsAt: string },
) {
  const date = formatTrialDate(recipient.trialEndsAt);
  return {
    subject: `Tu prueba gratuita de Nido termina el ${date}`,
    ...layout({
      heading: "Tu prueba gratuita termina pronto",
      greeting: `Hola${recipient.name ? `, ${recipient.name}` : ""}:`,
      paragraphs: [
        `Tu prueba gratuita del panel profesional termina el ${date}.`,
        `Para seguir usándolo sin interrupciones, activa tu plan (${prices(recipient.currency)}). Si lo activas antes de esa fecha, no se cobra nada hasta entonces.`,
        "Si no lo activas, el panel queda en pausa, pero tus pacientes, notas, agenda e historial se conservan y vuelven en cuanto lo actives.",
      ],
      cta: "Activar mi plan",
      url: new URL("/pro/plan", SITE_URL).toString(),
      footer: "Si tienes dudas, responde a este correo.",
    }),
  };
}

export async function sendPlanEmail(
  kind: "acceptance" | "rejection" | "migration" | "trial-reminder",
  recipient: Recipient,
) {
  const content =
    kind === "acceptance"
      ? acceptanceEmailContent(recipient, membershipBillingReady())
      : kind === "rejection"
        ? rejectionEmailContent(recipient)
        : kind === "trial-reminder" && recipient.trialEndsAt
          ? trialReminderEmailContent({
              ...recipient,
              trialEndsAt: recipient.trialEndsAt,
            })
          : migrationEmailContent(recipient);
  return sendEmail({ to: recipient.email, ...content });
}
