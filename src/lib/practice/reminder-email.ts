import "server-only";
import { SITE_URL } from "@/lib/site";
import type { ReminderRole } from "./reminder-options";
import { reminderProviderReady } from "./reminder-preferences";

export type ReminderEmailInput = {
  to: string;
  startsAt: string;
  timeZone: string;
  role: ReminderRole;
  deliveryId: string;
};
export type ReminderEmailResult =
  | { ok: true }
  | {
      ok: false;
      retryable: boolean;
      code:
        | "unavailable"
        | "network"
        | "rate_limit"
        | "provider_busy"
        | "provider_rejected";
    };

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );
}

export function reminderEmailContent(input: ReminderEmailInput) {
  const when = new Intl.DateTimeFormat("es", {
    timeZone: input.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(input.startsAt));
  const calendarUrl = new URL(
    input.role === "professional" ? "/pro/consulta" : "/mi/calendario",
    SITE_URL,
  ).toString();
  const preferencesUrl = new URL(
    input.role === "professional" ? "/pro/ajustes" : "/mi/ajustes",
    SITE_URL,
  ).toString();
  const subject = "Tienes una sesión en Nido";
  const text = `Tienes una sesión en Nido.\n\n${when}\nZona horaria: ${input.timeZone}\n\nEntra a tu calendario para consultar los detalles: ${calendarUrl}\n\nPuedes cambiar o desactivar estos avisos en tus ajustes: ${preferencesUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#245f47;line-height:1.6;padding:24px"><p style="font-size:14px">Nido · A tu ritmo</p><h1 style="font-size:26px">Tienes una sesión en Nido</h1><p>${escapeHtml(when)}</p><p style="font-size:14px">Zona horaria: ${escapeHtml(input.timeZone)}</p><p><a href="${escapeHtml(calendarUrl)}" style="display:inline-block;background:#2f7a5b;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none">Abrir mi calendario</a></p><p>Inicia sesión para consultar los detalles.</p><p style="font-size:13px">Puedes <a href="${escapeHtml(preferencesUrl)}">cambiar o desactivar estos avisos</a> en tus ajustes.</p></div>`;
  return { subject, text, html };
}

/** La clave identifica únicamente el ledger, sin nombres ni identificadores
 * de citas/cuentas en el proveedor. Nunca devuelve el cuerpo de un error. */
export async function sendAppointmentReminderEmail(
  input: ReminderEmailInput,
): Promise<ReminderEmailResult> {
  if (!reminderProviderReady())
    return { ok: false, retryable: true, code: "unavailable" };
  const content = reminderEmailContent(input);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 8_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "Idempotency-Key": `nido-reminder/${input.deliveryId}`,
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL,
        to: [input.to],
        ...content,
      }),
      signal: abort.signal,
    });
    if (response.ok) return { ok: true };
    if (response.status === 429)
      return { ok: false, retryable: true, code: "rate_limit" };
    if (response.status >= 500)
      return { ok: false, retryable: true, code: "provider_busy" };
    if (response.status === 409) {
      const data = (await response.json().catch(() => null)) as {
        name?: string;
      } | null;
      if (data?.name === "concurrent_idempotent_requests")
        return { ok: false, retryable: true, code: "provider_busy" };
    }
    return { ok: false, retryable: false, code: "provider_rejected" };
  } catch {
    return { ok: false, retryable: true, code: "network" };
  } finally {
    clearTimeout(timeout);
  }
}
