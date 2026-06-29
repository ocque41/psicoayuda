import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; skipped: true }
  | { ok: false; skipped?: false; error: string };

/**
 * Envía un correo transaccional DESDE el Worker de Cloudflare vía la API HTTP de
 * Resend (compatible con Workers mediante fetch). Cloudflare no envía correo
 * arbitrario de forma nativa, por eso usamos un proveedor.
 *
 * No-op elegante si falta configuración (igual que el patrón existente): en
 * desarrollo/sin claves no rompe el flujo, solo no envía.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !from) {
    return { ok: false, skipped: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `resend ${response.status}: ${detail}` };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
