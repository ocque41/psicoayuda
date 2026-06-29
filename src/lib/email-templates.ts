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

  const subject = `${who} necesita tu apoyo psicológico ahora · Nido`;
  const preheader = `${who} te escribió directamente en Nido. Haz clic para responder.`;
  const lead = `${whoEsc} que necesita apoyo psicológico <strong>te escribió directamente a ti</strong> en Nido. Cuando puedas, haz clic para responderle.`;

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
                    <td style="border-radius:999px;background:#b65334;">
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

${who} que necesita apoyo psicológico te escribió directamente a ti en Nido. Cuando puedas, responde aquí:
${url}

Por privacidad, no incluimos el mensaje en este correo; lo verás en la conversación segura.

Nido · apoyo psicológico voluntario, gratis y a distancia. No es un servicio de emergencia.`;

  return { subject, html, text, headers: { ...HIGH_PRIORITY_HEADERS } };
}
