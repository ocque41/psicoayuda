// Plantillas de correo PURAS (sin dependencias de servidor) para poder testearlas
// con vitest. El envío real vive en src/lib/email.ts.

import { preferredContactLabels } from "@/lib/constants";
import { whatsappUrl } from "@/lib/phone";

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

// "Primera prioridad": cabeceras estándar de alta prioridad reconocidas por la
// mayoría de clientes (Gmail/Outlook/Apple Mail).
export const HIGH_PRIORITY_HEADERS: Record<string, string> = {
  "X-Priority": "1 (Highest)",
  "X-MSMail-Priority": "High",
  Importance: "high",
  Priority: "urgent",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Aviso al profesional: "alguien que necesita apoyo te escribió directamente".
 * Por confidencialidad NO incluye el contenido del mensaje; solo enlaza a la
 * conversación segura. El destinatario es el correo de registro del profesional.
 */
export function buildNewMessageEmail(input: {
  conversationUrl: string;
  professionalName?: string;
  seekerLabel?: string;
}): BuiltEmail {
  const name = input.professionalName?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const who = (input.seekerLabel?.trim() || "Alguien").replace(/\s+/g, " ");
  const whoEsc = escapeHtml(who);
  const url = input.conversationUrl;
  const urlAttr = escapeHtml(url);

  const subject = `${who} te está escribiendo · responde en Nido`;
  const preheader = `${who} te escribió directamente en Nido. Haz clic para responder.`;
  const lead = `<strong>${whoEsc}</strong> te escribió directamente en Nido y necesita tu apoyo psicológico. Cuando puedas, haz clic para responderle.`;

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#2f7a5b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#245f47;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:#2f7a5b;">
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Responder ahora</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Por privacidad, no incluimos el mensaje en este correo. Lo verás en la conversación segura. Si el botón no funciona, copia este enlace:<br /><a href="${urlAttr}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${escapeHtml(url)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia: si hay riesgo inmediato, contacta a los servicios locales de emergencia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${name ? `Hola ${name},` : "Hola,"}

${who} te escribió directamente en Nido y necesita tu apoyo psicológico. Cuando puedas, responde aquí:
${url}

Por privacidad, no incluimos el mensaje en este correo; lo verás en la conversación segura.

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/**
 * Aviso al profesional de que hay una NUEVA solicitud difundida que puede
 * aceptar. Privacy-safe: NO incluye PII de la persona (ni correo ni relato);
 * solo el tipo de apoyo y la urgencia (datos mínimos ya visibles en su panel) y
 * un enlace al panel para aceptarla. Es la notificación que faltaba en el flujo
 * "Enviar a todos": sin ella, el emparejamiento dependía de que el voluntario
 * mirara su panel por casualidad.
 */
export function buildNewOfferEmail(input: {
  dashboardUrl: string;
  professionalName?: string | null;
  needLabel?: string;
  urgencyLabel?: string;
}): BuiltEmail {
  const name = input.professionalName?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const url = input.dashboardUrl;
  const urlAttr = escapeHtml(url);
  const detail = [input.needLabel, input.urgencyLabel]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" · ");

  const subject = "Nueva solicitud de apoyo disponible · Nido";
  const preheader =
    "Alguien pidió apoyo psicológico y puedes aceptarlo desde tu panel.";
  const lead = detail
    ? `Hay una nueva solicitud de apoyo (<strong>${detail}</strong>) que puedes aceptar. Cuando puedas, ábrela en tu panel.`
    : "Hay una nueva solicitud de apoyo que puedes aceptar. Cuando puedas, ábrela en tu panel.";

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#2f7a5b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#245f47;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:#2f7a5b;">
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Ver en mi panel</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Por privacidad no incluimos datos de la persona en este correo. Si el botón no funciona, copia este enlace:<br /><a href="${urlAttr}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${escapeHtml(url)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${name ? `Hola ${name},` : "Hola,"}

Hay una nueva solicitud de apoyo${detail ? ` (${input.needLabel ?? ""}${input.urgencyLabel ? ` · ${input.urgencyLabel}` : ""})` : ""} que puedes aceptar. Ábrela en tu panel:
${url}

Por privacidad no incluimos datos de la persona en este correo.

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: {} };
}

/**
 * Aviso INTERNO a los admins: un usuario llegó a la página de error por un bug.
 * A diferencia del resto de correos, este NO va a usuarios: va al equipo, así que
 * sí incluye el contexto técnico para poder reproducir (qué usuario, qué ruta y
 * qué botón/enlace/acción llevó al fallo). Todo lo que viene del cliente se ESCAPA:
 * el endpoint que lo dispara es público y estos campos son manipulables.
 */
export function buildErrorAlertEmail(report: {
  userLabel: string;
  path: string;
  message?: string;
  digest?: string;
  referrer?: string;
  userAgent?: string;
  stack?: string;
  lastAction?: { label?: string; href?: string; page?: string } | null;
  when: string;
}): BuiltEmail {
  const rows: Array<[string, string]> = [
    ["Usuario", report.userLabel],
    ["Página del error", report.path],
    ["Qué la lanzó (botón/enlace)", formatLastAction(report.lastAction)],
    ["Venía de", report.referrer || "—"],
    ["Mensaje", report.message || "—"],
    ["Digest", report.digest || "—"],
    ["Navegador", report.userAgent || "—"],
    ["Cuándo", report.when],
  ];

  const subject = `⚠️ Error en Nido: ${(report.path || "/").slice(0, 80)}`;
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-weight:700;color:#245f47;vertical-align:top;white-space:nowrap;">${escapeHtml(
          label,
        )}</td><td style="padding:6px 0;color:#2b2723;word-break:break-word;">${escapeHtml(
          value,
        )}</td></tr>`,
    )
    .join("");
  const stackHtml = report.stack
    ? `<pre style="margin:16px 0 0;padding:12px;background:#f6f2ec;border-radius:8px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#4a423a;">${escapeHtml(
        report.stack,
      )}</pre>`
    : "";

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#c0392b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#245f47;">Nido · aviso interno</p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Un usuario llegó a la página de error por un bug. Contexto para reproducirlo:</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.6;">${htmlRows}</table>
                ${stackHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Un usuario llegó a la página de error de Nido por un bug.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(report.stack ? ["", "Stack:", report.stack] : []),
  ].join("\n");

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

function formatLastAction(
  action?: { label?: string; href?: string; page?: string } | null,
): string {
  if (!action) return "—";
  const label = action.label?.trim();
  const parts: string[] = [];
  if (label) parts.push(`"${label}"`);
  if (action.href) parts.push(`→ ${action.href}`);
  if (action.page) parts.push(`(en ${action.page})`);
  return parts.length ? parts.join(" ") : "—";
}

/**
 * Aviso al profesional de que su perfil fue APROBADO y ya puede recibir
 * solicitudes. Sin PII. Lo dispara la acción admin de cambio de estado.
 */
export function buildApprovalEmail(input: {
  dashboardUrl: string;
  professionalName?: string | null;
  // El auxiliar no clínico no tiene credencial: el correo no debe decir que la
  // "verificamos". El alta manual desde /admin todavía no completó su perfil, así
  // que se le invita a completarlo en vez de anunciar "ya puedes recibir".
  nonClinicalHelper?: boolean;
  needsProfileCompletion?: boolean;
}): BuiltEmail {
  const name = input.professionalName?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const url = input.dashboardUrl;
  const urlAttr = escapeHtml(url);

  let subject: string;
  let preheader: string;
  let lead: string;
  let ctaLabel: string;
  let textLead: string;
  if (input.needsProfileCompletion) {
    subject = "Te damos de alta en Nido — completa tu perfil";
    preheader = "Completa tu perfil para empezar a acompañar.";
    lead =
      "Te dimos de alta en Nido. Para empezar a recibir solicitudes y acompañar a personas, completa tu perfil (áreas de apoyo y datos de contacto) desde tu panel.";
    ctaLabel = "Completar mi perfil";
    textLead =
      "Te dimos de alta en Nido. Para empezar a recibir solicitudes, completa tu perfil desde tu panel:";
  } else if (input.nonClinicalHelper) {
    subject = "Tu perfil de Nido fue aprobado";
    preheader = "Ya puedes recibir solicitudes y acompañar a personas.";
    lead =
      "Tu perfil ya está aprobado. Ya puedes recibir solicitudes y acompañar a personas desde tu panel.";
    ctaLabel = "Abrir mi panel";
    textLead =
      "Tu perfil ya está aprobado. Ya puedes recibir solicitudes desde tu panel:";
  } else {
    subject = "Tu perfil de Nido fue aprobado";
    preheader = "Ya puedes recibir solicitudes y acompañar a personas.";
    lead =
      "Verificamos tu credencial y tu perfil ya está aprobado. Ya puedes recibir solicitudes y acompañar a personas desde tu panel.";
    ctaLabel = "Abrir mi panel";
    textLead =
      "Verificamos tu credencial y tu perfil ya está aprobado. Ya puedes recibir solicitudes desde tu panel:";
  }

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#2f7a5b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#245f47;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:#2f7a5b;">
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Si el botón no funciona, copia este enlace:<br /><a href="${urlAttr}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${escapeHtml(url)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Gracias por dar tu tiempo. Nido · apoyo psicológico voluntario, gratis y a distancia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${name ? `Hola ${name},` : "Hola,"}

${textLead}
${url}

Gracias por dar tu tiempo. Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: {} };
}

/**
 * Aviso al buzón de coordinación de que una fundación/organización dejó sus
 * datos para aliarse (formulario /alianzas). A diferencia de los avisos de
 * seekers, aquí SÍ incluimos los datos: son de contacto de una organización que
 * los facilitó a propósito. Reply-To apunta a su correo para responder directo.
 */
export function buildFoundationContactEmail(input: {
  contactName: string;
  organizationName: string;
  website?: string;
  phone?: string;
  preferredContact?: string;
  email: string;
  message?: string;
  adminUrl?: string;
}): BuiltEmail {
  const org = input.organizationName.trim();
  const orgEsc = escapeHtml(org);
  const contactName = escapeHtml(input.contactName.trim());
  const email = input.email.trim();
  const emailEsc = escapeHtml(email);
  const website = input.website?.trim();
  // Si no trae esquema, anteponemos https:// para que el href funcione (el texto
  // visible queda tal cual lo escribieron).
  const websiteHref = website
    ? escapeHtml(/^https?:\/\//i.test(website) ? website : `https://${website}`)
    : "";
  const websiteText = website ? escapeHtml(website) : "";
  const phone = input.phone?.trim();
  const phoneEsc = phone ? escapeHtml(phone) : "";
  // Enlace directo de WhatsApp para escribir con un clic (si el número es válido).
  const waHref = phone ? whatsappUrl(phone) : null;
  const waHrefAttr = waHref ? escapeHtml(waHref) : "";
  const preferredKey = input.preferredContact?.trim();
  const preferredLabel =
    preferredKey && preferredKey in preferredContactLabels
      ? preferredContactLabels[
          preferredKey as keyof typeof preferredContactLabels
        ]
      : preferredKey
        ? escapeHtml(preferredKey)
        : "";
  const message = input.message?.trim();
  const messageHtml = message
    ? escapeHtml(message).replace(/\n/g, "<br />")
    : "";
  const adminUrl = input.adminUrl?.trim();
  const adminUrlAttr = adminUrl ? escapeHtml(adminUrl) : "";

  const subject = `Nueva organización interesada en aliarse: ${org}`;
  const preheader = `${org} quiere colaborar con Nido.`;

  const rows = [
    `<p style="margin:0 0 8px;font-size:16px;"><strong>Organización:</strong> ${orgEsc}</p>`,
    `<p style="margin:0 0 8px;font-size:16px;"><strong>Contacto:</strong> ${contactName}</p>`,
    preferredLabel
      ? `<p style="margin:0 0 8px;font-size:16px;"><strong>Forma más rápida:</strong> ${preferredLabel}</p>`
      : "",
    `<p style="margin:0 0 8px;font-size:16px;"><strong>Correo:</strong> <a href="mailto:${emailEsc}" style="color:#2f7a5b;">${emailEsc}</a></p>`,
    website
      ? `<p style="margin:0 0 8px;font-size:16px;"><strong>Web:</strong> <a href="${websiteHref}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${websiteText}</a></p>`
      : "",
    phone
      ? `<p style="margin:0 0 8px;font-size:16px;"><strong>Teléfono:</strong> ${phoneEsc}${
          waHref
            ? ` · <a href="${waHrefAttr}" target="_blank" style="color:#2f7a5b;">WhatsApp</a> · <a href="tel:${phoneEsc}" style="color:#2f7a5b;">Llamar</a>`
            : ""
        }</p>`
      : "",
    message
      ? `<p style="margin:16px 0 0;font-size:16px;line-height:1.6;"><strong>Mensaje:</strong><br />${messageHtml}</p>`
      : "",
    adminUrl
      ? `<p style="margin:22px 0 0;"><a href="${adminUrlAttr}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#ffffff;background:#2f7a5b;text-decoration:none;border-radius:999px;">Revisar y aprobar en el panel</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#2f7a5b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#245f47;">Nido</p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Una organización dejó sus datos para aliarse con Nido:</p>
                ${rows}
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Puedes responder directamente a este correo para escribirle a la organización.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Nido · apoyo psicológico voluntario, gratis y a distancia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Una organización dejó sus datos para aliarse con Nido:",
    "",
    `Organización: ${org}`,
    `Contacto: ${input.contactName.trim()}`,
    preferredLabel ? `Forma más rápida: ${preferredLabel}` : "",
    `Correo: ${email}`,
    website ? `Web: ${website}` : "",
    phone ? `Teléfono: ${phone}` : "",
    waHref ? `WhatsApp: ${waHref}` : "",
    message ? `\nMensaje:\n${message}` : "",
    adminUrl ? `\nRevísala y apruébala en el panel: ${adminUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text, headers: { "Reply-To": email } };
}

/**
 * Aviso a la ORGANIZACIÓN de que su solicitud de alianza fue APROBADA. Va al
 * correo que dejó en el formulario /alianzas; lo dispara la acción de admin.
 */
export function buildAllianceApprovedEmail(input: {
  organizationName: string;
  contactName?: string;
}): BuiltEmail {
  const org = input.organizationName.trim();
  const contact = input.contactName?.trim();
  const greeting = contact ? `Hola ${escapeHtml(contact)},` : "Hola,";
  const subject = "Tu organización ya es aliada de Nido";
  const preheader = `${org} fue aprobada como organización aliada.`;
  const lead = `¡Buenas noticias! Revisamos la solicitud de <strong>${escapeHtml(
    org,
  )}</strong> y ya son una organización aliada de Nido. En breve, una persona del equipo de coordinación se pondrá en contacto contigo para dar los siguientes pasos.`;

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#2f7a5b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#245f47;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">${greeting}</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${lead}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Gracias por sumarse. Nido · apoyo psicológico voluntario, gratis y a distancia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${contact ? `Hola ${contact},` : "Hola,"}

¡Buenas noticias! Revisamos la solicitud de ${org} y ya son una organización aliada de Nido. En breve una persona del equipo de coordinación se pondrá en contacto contigo para dar los siguientes pasos.

Gracias por sumarse. Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: {} };
}
