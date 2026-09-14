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
 * Aviso a la PERSONA (sin cuenta) de que su acompañante le respondió en el chat.
 * Privacy-safe: sin contenido del mensaje; solo el enlace de acceso renovado.
 * Es la pieza que permite que la conversación continúe de forma asíncrona sin
 * que nadie tenga que quedarse con la pestaña abierta.
 */
export function buildSeekerNewMessageEmail(input: {
  accessUrl: string;
}): BuiltEmail {
  const url = input.accessUrl;
  const urlAttr = escapeHtml(url);
  const subject = "Tienes una respuesta en Nido";
  const preheader =
    "Tu acompañante te escribió. Entra a tu conversación privada cuando quieras.";

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
              <td style="background:#b65334;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#8a3d28;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">Hola,</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Tu acompañante te escribió en tu conversación privada. Puedes entrar cuando quieras: tus mensajes quedan guardados y puedes retomarla desde donde la dejaste.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:#b65334;">
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Entrar a mi conversación</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Por privacidad no incluimos el mensaje en este correo; lo verás en la conversación segura. Si el botón no funciona, copia este enlace:<br /><a href="${urlAttr}" target="_blank" style="color:#8a3d28;word-break:break-all;">${escapeHtml(url)}</a></p>
                <p style="margin:14px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Por tu seguridad, evita compartir datos que te identifiquen (dirección exacta, documentos).</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia: si estás en peligro inmediato, llama al 911 o a los servicios locales de emergencia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hola,

Tu acompañante te escribió en tu conversación privada de Nido. Puedes entrar cuando quieras; tus mensajes quedan guardados y puedes retomarla desde donde la dejaste:

${url}

Por privacidad no incluimos el mensaje en este correo; lo verás en la conversación segura.

Por tu seguridad, evita compartir datos que te identifiquen (dirección exacta, documentos).

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: {} };
}

/**
 * Correo del enlace mágico (/acceso): devuelve hasta 5 accesos frescos a las
 * conversaciones vivas de ese correo. Sin contenido de los chats: cada botón
 * abre la conversación privada correspondiente.
 */
export function buildSeekerAccessLinksEmail(input: {
  links: Array<{ url: string; when: string }>;
}): BuiltEmail {
  const subject = "Tus conversaciones en Nido";
  const preheader =
    "Tu enlace privado para volver a tus conversaciones. Sin cuenta, sin contraseña.";

  const items = input.links
    .map(
      (link) => `
            <tr>
              <td style="padding:10px 0 18px;border-bottom:1px solid #e7decf;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:#b65334;">
                      <a href="${escapeHtml(link.url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Entrar a mi conversación</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:10px 0 0;font-size:13px;color:#6e655b;">Última actividad: ${escapeHtml(link.when)}</p>
              </td>
            </tr>`,
    )
    .join("");

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
              <td style="background:#b65334;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#8a3d28;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">Hola,</p>
                <p style="margin:0 0 8px;font-size:16px;line-height:1.6;">Estos enlaces abren tus conversaciones privadas. Puedes volver cuando quieras: los mensajes quedan guardados.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}
                </table>
                <p style="margin:14px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Por tu seguridad, no compartas este correo: los enlaces son privados. Si no pediste este acceso, ignóralo.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia: si estás en peligro inmediato, llama al 911 o a los servicios locales de emergencia.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hola,

Estos enlaces abren tus conversaciones privadas en Nido. Puedes volver cuando quieras: los mensajes quedan guardados.

${input.links.map((link) => `- Última actividad: ${link.when}\n  ${link.url}`).join("\n")}

Por tu seguridad, no compartas este correo: los enlaces son privados. Si no pediste este acceso, ignóralo.

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: {} };
}

/**
 * Aviso de que una conversación cerrada se REABRIÓ (la persona o el
 * profesional pueden retomar el mismo hilo dentro de la ventana de retención).
 * Sin contenido; solo el enlace correspondiente a cada parte.
 */
export function buildChatReopenedEmail(input: {
  audience: "seeker" | "professional";
  url: string;
}): BuiltEmail {
  const isSeeker = input.audience === "seeker";
  const subject = isSeeker
    ? "Tu conversación en Nido se reabrió"
    : "Se reabrió una conversación en Nido";
  const lead = isSeeker
    ? "Tu conversación volvió a estar abierta. Tus mensajes siguen guardados y puedes retomarla cuando quieras."
    : "La persona que acompañabas reabrió su conversación contigo. Puedes retomarla cuando quieras desde tu panel.";
  const cta = isSeeker ? "Entrar a mi conversación" : "Abrir conversación";
  const urlAttr = escapeHtml(input.url);
  const accent = isSeeker ? "#b65334" : "#2f7a5b";
  const accentText = isSeeker ? "#8a3d28" : "#245f47";

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
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${accent};height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:${accentText};">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">Hola,</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:${accent};">
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${cta}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Si no esperabas esto, puedes ignorar este correo.</p>
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

  const text = `Hola,

${lead}

${cta}: ${input.url}

Si no esperabas esto, puedes ignorar este correo.

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: {} };
}

/**
 * Aviso de que la conversación entró en la PAPELERA (borrado con deshacer de 7
 * días). Sin contenido: solo avisa y enlaza para restaurarla. Es la red de
 * seguridad contra "la borré sin querer".
 */
export function buildChatDeletedEmail(input: {
  audience: "seeker" | "professional";
  url: string;
}): BuiltEmail {
  const isSeeker = input.audience === "seeker";
  const subject = isSeeker
    ? "Tu conversación en Nido se borró (puedes recuperarla)"
    : "Se borró una conversación en Nido (puedes recuperarla)";
  const lead = isSeeker
    ? "La conversación con tu acompañante se marcó para borrar. Todavía puedes recuperarla durante los próximos 7 días; después se eliminará para siempre."
    : "La persona que acompañabas marcó su conversación para borrar. Todavía puedes recuperarla durante los próximos 7 días; después se eliminará para siempre.";
  const cta = isSeeker
    ? "Recuperar mi conversación"
    : "Recuperar la conversación";
  const urlAttr = escapeHtml(input.url);

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
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7decf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#6e655b;height:6px;line-height:6px;font-size:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 4px;font-weight:700;font-size:18px;color:#6e655b;">Nido</p>
                <p style="margin:0 0 16px;font-size:16px;">Hola,</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px;background:#b65334;">
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${cta}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Si la borraste a propósito, puedes ignorar este correo: en 7 días se eliminará definitivamente.</p>
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

  const text = `Hola,

${lead}

${cta}: ${input.url}

Si la borraste a propósito, puedes ignorar este correo: en 7 días se eliminará definitivamente.

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: {} };
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

/** Aviso interno sin datos personales: el contenido vive tras /admin. */
export function buildContactMessageAlertEmail(input: {
  adminUrl: string;
  sourceLabel: string;
  categoryLabel: string;
}): BuiltEmail {
  const url = input.adminUrl;
  const urlAttr = escapeHtml(url);
  const subject = `Nuevo contacto: ${input.categoryLabel} — Nido`;
  const html = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:24px;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <div style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border:1px solid #e7decf;border-radius:14px;">
      <p style="margin:0 0 4px;font-weight:700;color:#245f47;">Nido · nuevo contacto</p>
      <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(input.categoryLabel)}</h1>
      <p style="line-height:1.6;">Llegó un mensaje desde ${escapeHtml(input.sourceLabel)}. Por privacidad, el contenido y los datos de contacto se ven únicamente en el panel protegido.</p>
      <p><a href="${urlAttr}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#2f7a5b;color:#fff;text-decoration:none;font-weight:700;">Abrir bandeja de contactos</a></p>
    </div>
  </body>
</html>`;
  const text = [
    "Llegó un nuevo contacto a Nido.",
    `Motivo: ${input.categoryLabel}`,
    `Origen: ${input.sourceLabel}`,
    "",
    "Por privacidad, revisa el contenido en el panel protegido:",
    url,
  ].join("\n");

  return { subject, html, text, headers: {} };
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

/**
 * Correo de restablecimiento de contraseña ("¿olvidaste tu contraseña?").
 * Enlace de un solo uso que caduca en 1 hora. Si la persona no lo pidió puede
 * ignorarlo: su contraseña actual sigue sirviendo. Alta prioridad: quien lo
 * pide está esperándolo delante de la pantalla.
 */
export function buildPasswordResetEmail(input: {
  resetUrl: string;
  name?: string | null;
}): BuiltEmail {
  const name = input.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const url = input.resetUrl;
  const urlAttr = escapeHtml(url);

  const subject = "Crea una contraseña nueva para tu cuenta de Nido";
  const preheader = "Enlace para crear una contraseña nueva. Caduca en 1 hora.";
  const lead =
    "Pediste crear una contraseña nueva para tu cuenta de Nido. Haz clic en el botón y elige una (mínimo 8 caracteres). El enlace es de un solo uso y caduca en 1 hora.";

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
                      <a href="${urlAttr}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Crear contraseña nueva</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;color:#6e655b;line-height:1.6;">Si tú no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando. Si el botón no funciona, copia este enlace:<br /><a href="${urlAttr}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${escapeHtml(url)}</a></p>
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

Pediste crear una contraseña nueva para tu cuenta de Nido. Abre este enlace y elige una (mínimo 8 caracteres). Es de un solo uso y caduca en 1 hora:
${url}

Si tú no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.

Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

// --- Correos de seguridad de la cuenta (credenciales del profesional) --------

/**
 * Layout común de los avisos de seguridad: mismo estilo que el resto de Nido,
 * con CTA opcional. `paragraphs` y `footnote` llegan ya escapados por quien
 * llama (son plantillas internas, no contenido de terceros).
 */
function securityEmailHtml(input: {
  subject: string;
  preheader: string;
  greeting: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote: string;
  // Los correos de pago necesitan un pie distinto (la ayuda por el terremoto
  // sigue siendo gratis, pero el paquete comprado no lo es).
  footer?: string;
}) {
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                  <tr>
                    <td style="border-radius:999px;background:#2f7a5b;">
                      <a href="${escapeHtml(input.cta.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(input.cta.label)}</a>
                    </td>
                  </tr>
                </table>`
    : "";

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2723;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</span>
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
                <p style="margin:0 0 16px;font-size:16px;">${input.greeting}</p>
                ${input.paragraphs
                  .map(
                    (paragraph) =>
                      `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;">${paragraph}</p>`,
                  )
                  .join("\n                ")}
                ${cta}
                <p style="margin:0;font-size:13px;color:#6e655b;line-height:1.6;">${input.footnote}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e7decf;">
                <p style="margin:0;font-size:12px;color:#6e655b;line-height:1.6;">${input.footer ?? "Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia: si hay riesgo inmediato, contacta a los servicios locales de emergencia."}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Paso 1 del cambio de correo (cuenta con correo verificado): se envía al
 * correo ACTUAL pidiendo aprobar el cambio. Al aprobar, se dispara la
 * verificación de la dirección nueva. Sin este paso, el cambio no avanza.
 */
export function buildEmailChangeConfirmationEmail(input: {
  confirmUrl: string;
  newEmail: string;
  name?: string | null;
}): BuiltEmail {
  const name = input.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const newEmail = escapeHtml(input.newEmail.trim());
  const url = input.confirmUrl;

  const subject = "Aprueba el cambio de correo de tu cuenta de Nido";
  const preheader = "Confirma que quieres cambiar el correo de tu cuenta.";
  const lead = `Alguien (esperamos que tú) pidió cambiar el correo de tu cuenta de Nido a <strong>${newEmail}</strong>. Para aprobar el cambio, pulsa el botón. Después te pediremos confirmar esa dirección nueva; hasta completarlo, tu correo en Nido no cambia.`;

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [lead],
    cta: { label: "Aprobar el cambio", url },
    footnote: `Si no pediste este cambio, ignora este correo: tu correo actual sigue siendo el de tu cuenta. Si te preocupa, cambia tu contraseña desde tu panel. Si el botón no funciona, copia este enlace:<br /><a href="${escapeHtml(url)}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${escapeHtml(url)}</a>`,
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

Alguien (esperamos que tú) pidió cambiar el correo de tu cuenta de Nido a ${input.newEmail.trim()}. Para aprobar el cambio, abre este enlace:
${url}

Después te pediremos confirmar esa dirección nueva; hasta completarlo, tu correo en Nido no cambia.

Si no pediste este cambio, ignora este correo: tu correo actual sigue siendo el de tu cuenta.

Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/**
 * Paso 2 del cambio de correo: verificación de la dirección NUEVA. Es el
 * correo que confirma que la dirección existe y pertenece a quien la pidió.
 */
export function buildEmailVerificationEmail(input: {
  verifyUrl: string;
  name?: string | null;
}): BuiltEmail {
  const name = input.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const url = input.verifyUrl;

  const subject = "Confirma tu nuevo correo en Nido";
  const preheader = "Un clic para confirmar tu dirección nueva.";
  const lead =
    "Pediste cambiar el correo de tu cuenta de Nido a esta dirección. Para confirmarla, pulsa el botón. El enlace es de un solo uso y caduca en 1 hora.";

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [lead],
    cta: { label: "Confirmar mi correo", url },
    footnote: `Si no fuiste tú, ignora este correo: sin tu confirmación, el cambio no se aplica y tu cuenta sigue igual. Si el botón no funciona, copia este enlace:<br /><a href="${escapeHtml(url)}" target="_blank" style="color:#2f7a5b;word-break:break-all;">${escapeHtml(url)}</a>`,
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

Pediste cambiar el correo de tu cuenta de Nido a esta dirección. Para confirmarla, abre este enlace (de un solo uso, caduca en 1 hora):
${url}

Si no fuiste tú, ignora este correo: sin tu confirmación, el cambio no se aplica.

Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/**
 * Aviso de seguridad al correo ACTUAL cuando la cuenta no está verificada: en
 * ese caso Better Auth manda el enlace directo a la dirección nueva y el correo
 * viejo no recibiría ninguna notificación. Sin enlaces de acción (el enlace
 * real va a la dirección nueva), solo para que la dueña sepa lo que pasa.
 */
export function buildEmailChangeNoticeEmail(input: {
  newEmail: string;
  name?: string | null;
  dashboardUrl: string;
}): BuiltEmail {
  const name = input.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const newEmail = escapeHtml(input.newEmail.trim());

  const subject = "Solicitud de cambio de correo en tu cuenta de Nido";
  const preheader = "Aviso de seguridad: revisa este cambio.";

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [
      `Pediste cambiar el correo de tu cuenta de Nido a <strong>${newEmail}</strong>. Te enviamos un enlace de confirmación a esa dirección; el cambio no se aplica hasta que lo confirmes.`,
      "Como aviso de seguridad, también te escribimos aquí: tu correo actual sigue siendo el de tu cuenta.",
    ],
    cta: { label: "Ir a mi cuenta", url: input.dashboardUrl },
    footnote:
      "Si no pediste este cambio, no hagas clic en el enlace nuevo, cambia tu contraseña desde tu panel y escríbenos por la página de contacto.",
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

Pediste cambiar el correo de tu cuenta de Nido a ${input.newEmail.trim()}. Te enviamos un enlace de confirmación a esa dirección; el cambio no se aplica hasta que lo confirmes.

Como aviso de seguridad, también te escribimos aquí: tu correo actual sigue siendo el de tu cuenta.

Si no pediste este cambio, no hagas clic en el enlace nuevo, cambia tu contraseña desde tu panel y escríbenos por la página de contacto.

Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/** Confirmación de que la contraseña cambió (aviso de seguridad). */
export function buildPasswordChangedEmail(input: {
  dashboardUrl: string;
  name?: string | null;
}): BuiltEmail {
  const name = input.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";

  const subject = "Tu contraseña de Nido cambió";
  const preheader = "Confirmamos el cambio de contraseña de tu cuenta.";

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [
      "Tu contraseña de la cuenta de Nido cambió correctamente. Por seguridad, cerramos las demás sesiones abiertas: si estabas dentro en otro dispositivo, tendrás que volver a entrar con la contraseña nueva.",
    ],
    cta: { label: "Ir a mi cuenta", url: input.dashboardUrl },
    footnote:
      "Si no hiciste este cambio, restablece tu contraseña de inmediato desde la página de acceso y escríbenos por la página de contacto.",
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

Tu contraseña de la cuenta de Nido cambió correctamente. Por seguridad, cerramos las demás sesiones abiertas: si estabas dentro en otro dispositivo, tendrás que volver a entrar con la contraseña nueva.

Si no hiciste este cambio, restablece tu contraseña de inmediato desde la página de acceso y escríbenos por la página de contacto.

Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

// --- Correos de pago (módulo de cobros con Stripe) -----------------------------

const PAYMENT_FOOTER =
  "Este pago lo procesa Stripe para Nido. La ayuda por el terremoto sigue siendo gratis; este paquete es un servicio adicional acordado con el profesional. Si hay riesgo inmediato, contacta a los servicios locales de emergencia.";

/** Recibo para quien pagó un paquete de sesiones. */
export function buildPaymentReceiptEmail(input: {
  packageTitle: string;
  professionalName: string;
  amountLabel: string;
  payerName?: string | null;
  sessionsCount?: number;
  validityDays?: number | null;
}): BuiltEmail {
  const name = input.payerName?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const title = escapeHtml(input.packageTitle);
  const professional = escapeHtml(input.professionalName);
  const amount = escapeHtml(input.amountLabel);

  const sessionsLine = input.sessionsCount
    ? `El paquete incluye ${input.sessionsCount} ${
        input.sessionsCount === 1 ? "sesión" : "sesiones"
      }${input.validityDays ? `, válidas por ${input.validityDays} días` : ""}.`
    : "";

  const subject = `Confirmamos tu pago: ${input.packageTitle}`;
  const preheader = `Pago de ${amount} a ${input.professionalName}.`;

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [
      `Confirmamos tu pago de <strong>${amount}</strong> por <strong>${title}</strong>, con ${professional}. ${sessionsLine}`,
      "El profesional se pondrá en contacto contigo para coordinar las sesiones. Si tienes dudas del paquete o necesitas reprogramar, respóndele directamente por el chat de Nido.",
    ],
    footnote:
      "Este correo es tu recibo. Si no reconoces este pago, escríbenos por la página de contacto cuanto antes.",
    footer: PAYMENT_FOOTER,
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

Confirmamos tu pago de ${input.amountLabel} por ${input.packageTitle}, con ${input.professionalName}. ${sessionsLine}

El profesional se pondrá en contacto contigo para coordinar las sesiones. Si tienes dudas del paquete o necesitas reprogramar, respóndele directamente por el chat de Nido.

Este correo es tu recibo. Si no reconoces este pago, escríbenos por la página de contacto.

Nido`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/** Aviso al profesional de que recibió un pago (con su parte neta). */
export function buildPaymentReceivedProEmail(input: {
  packageTitle: string;
  professionalName?: string | null;
  grossLabel: string;
  netLabel: string;
  payerEmail?: string | null;
  dashboardUrl: string;
}): BuiltEmail {
  const name = input.professionalName?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const title = escapeHtml(input.packageTitle);
  const payer = input.payerEmail
    ? `<strong>${escapeHtml(input.payerEmail)}</strong>`
    : "una persona";

  const subject = `Recibiste un pago por "${input.packageTitle}"`;
  const preheader = `${input.netLabel} llegarán a tu cuenta; coordina las sesiones.`;

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [
      `${payer} pagó <strong>${escapeHtml(input.grossLabel)}</strong> por tu paquete <strong>${title}</strong>. Después de la comisión de Nido, tu parte es de <strong>${escapeHtml(input.netLabel)}</strong> y Stripe la transferirá automáticamente a tu cuenta de cobros.`,
      "Coordina las sesiones con la persona desde tu panel. Si necesitas devolver el pago o hay algún problema con la transacción, escríbenos cuanto antes.",
    ],
    cta: { label: "Ir a mi panel", url: input.dashboardUrl },
    footnote:
      "Por seguridad, revisa siempre que el pago aparezca en tu panel antes de prestar el servicio.",
    footer: PAYMENT_FOOTER,
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

${input.payerEmail ?? "Una persona"} pagó ${input.grossLabel} por tu paquete ${input.packageTitle}. Después de la comisión de Nido, tu parte es de ${input.netLabel} y Stripe la transferirá automáticamente a tu cuenta de cobros.

Coordina las sesiones con la persona desde tu panel. Si necesitas devolver el pago o hay algún problema, escríbenos.

${input.dashboardUrl}

Nido`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/** Alerta interna para el equipo: disputa (chargeback) de un pago. */
export function buildPaymentDisputeAlertEmail(input: {
  paymentId: string;
  packageTitle: string;
  professionalName: string;
  amountLabel: string;
  adminUrl: string;
}): BuiltEmail {
  const subject = `Disputa de pago en Nido: ${input.packageTitle}`;
  const preheader = `Revisa la disputa de ${input.amountLabel} en Stripe.`;

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting: "Equipo,",
    paragraphs: [
      `Se abrió una disputa (chargeback) en Stripe por el pago <strong>${escapeHtml(input.amountLabel)}</strong> del paquete <strong>${escapeHtml(input.packageTitle)}</strong> de ${escapeHtml(input.professionalName)}.`,
      `Referencia interna: <strong>${escapeHtml(input.paymentId)}</strong>. Revisa el caso en el panel de Stripe (Disputas) y responde con la evidencia antes de que venza el plazo.`,
    ],
    cta: { label: "Abrir el panel de Nido", url: input.adminUrl },
    footnote:
      "Este aviso es interno de coordinación. La disputa del cargo la gestiona la plataforma, no el profesional.",
    footer: "Nido · aviso interno de coordinación.",
  });

  const text = `Equipo,

Se abrió una disputa (chargeback) en Stripe por el pago de ${input.amountLabel} del paquete ${input.packageTitle} de ${input.professionalName}.

Referencia interna: ${input.paymentId}. Revisa el caso en el panel de Stripe (Disputas) y responde con evidencia antes del vencimiento.

${input.adminUrl}

Nido`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}

/**
 * Aviso de que los teléfonos públicos del perfil cambiaron. Los teléfonos se
 * muestran en la ficha (libro amarillo), así que un cambio inesperado merece
 * este correo de seguridad.
 */
export function buildPhoneChangedEmail(input: {
  dashboardUrl: string;
  phone?: string | null;
  landline?: string | null;
  name?: string | null;
}): BuiltEmail {
  const name = input.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const phone = input.phone?.trim();
  const landline = input.landline?.trim();

  const subject = "Cambiaste tus datos de contacto en Nido";
  const preheader = "Nuevos teléfonos en tu ficha pública.";

  const rows = [
    phone ? `WhatsApp: <strong>${escapeHtml(phone)}</strong>` : "",
    landline ? `Teléfono fijo: <strong>${escapeHtml(landline)}</strong>` : "",
  ].filter(Boolean);
  const detail = rows.length
    ? `Ahora son: ${rows.join(" · ")}.`
    : "Quitaste los teléfonos de tu perfil; tu correo sigue disponible como contacto.";

  const html = securityEmailHtml({
    subject,
    preheader,
    greeting,
    paragraphs: [
      `Actualizamos los teléfonos de tu perfil profesional. ${detail}`,
      "Los teléfonos que dejes se muestran públicos en tu ficha, como botones de WhatsApp y llamada.",
    ],
    cta: { label: "Revisar mi perfil", url: input.dashboardUrl },
    footnote:
      "Si no hiciste este cambio, escríbenos cuanto antes por la página de contacto y cambia tu contraseña desde tu panel.",
  });

  const text = `${name ? `Hola ${name},` : "Hola,"}

${
  phone || landline
    ? `Actualizamos los teléfonos de tu perfil profesional.${phone ? `\nWhatsApp: ${phone}` : ""}${landline ? `\nTeléfono fijo: ${landline}` : ""}`
    : "Quitamos los teléfonos de tu perfil; tu correo sigue disponible como contacto."
}

Los teléfonos que dejes se muestran públicos en tu ficha, como botones de WhatsApp y llamada.

Si no hiciste este cambio, escríbenos cuanto antes por la página de contacto y cambia tu contraseña desde tu panel.

Nido · apoyo psicológico voluntario, gratis y a distancia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}
