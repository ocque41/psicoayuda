// Plantillas de correo PURAS (sin dependencias de servidor) para poder testearlas
// con vitest. El envío real vive en src/lib/email.ts.

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
 * Aviso al profesional de que su perfil fue APROBADO y ya puede recibir
 * solicitudes. Sin PII. Lo dispara la acción admin de cambio de estado.
 */
export function buildApprovalEmail(input: {
  dashboardUrl: string;
  professionalName?: string | null;
}): BuiltEmail {
  const name = input.professionalName?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const url = input.dashboardUrl;
  const urlAttr = escapeHtml(url);
  const subject = "Tu perfil de Nido fue aprobado";
  const preheader = "Ya puedes recibir solicitudes y acompañar a personas.";
  const lead =
    "Verificamos tu credencial y tu perfil ya está aprobado. Ya puedes recibir solicitudes y acompañar a personas desde tu panel.";

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
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Abrir mi panel</a>
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

Verificamos tu credencial y tu perfil ya está aprobado. Ya puedes recibir solicitudes desde tu panel:
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
  email: string;
  message?: string;
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
  const message = input.message?.trim();
  const messageHtml = message
    ? escapeHtml(message).replace(/\n/g, "<br />")
    : "";

  const subject = `Nueva organización interesada en aliarse: ${org}`;
  const preheader = `${org} quiere colaborar con Nido.`;

  const rows = [
    `<p style="margin:0 0 8px;font-size:16px;"><strong>Organización:</strong> ${orgEsc}</p>`,
    `<p style="margin:0 0 8px;font-size:16px;"><strong>Contacto:</strong> ${contactName}</p>`,
    `<p style="margin:0 0 8px;font-size:16px;"><strong>Correo:</strong> <a href="mailto:${emailEsc}" style="color:#2f7a5b;">${emailEsc}</a></p>`,
    website
      ? `<p style="margin:0 0 8px;font-size:16px;"><strong>Web:</strong> <a href="${websiteHref}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${websiteText}</a></p>`
      : "",
    message
      ? `<p style="margin:16px 0 0;font-size:16px;line-height:1.6;"><strong>Mensaje:</strong><br />${messageHtml}</p>`
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
    `Correo: ${email}`,
    website ? `Web: ${website}` : "",
    message ? `\nMensaje:\n${message}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text, headers: { "Reply-To": email } };
}
