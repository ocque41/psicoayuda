import "server-only";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileConfig = { siteKey: string | null; enabled: boolean };

/**
 * Configuración resuelta EN EL SERVIDOR. Turnstile solo se exige cuando hay
 * secreto Y site key: si faltara el site key (el widget no se podría pintar),
 * bloquearíamos a todo el mundo; con ambos presentes, el panel pinta el widget
 * y las acciones exigen un token válido de Cloudflare.
 */
export function getTurnstileConfig(): TurnstileConfig {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() ?? "";
  return { siteKey: siteKey || null, enabled: Boolean(secret && siteKey) };
}

/**
 * Interpreta la respuesta de siteverify. PURA para poder testearla sin red.
 * Cloudflare responde `{ success, "error-codes": [...] }`.
 */
export function interpretTurnstileResponse(payload: unknown): {
  ok: boolean;
  codes: string[];
} {
  if (!payload || typeof payload !== "object") {
    return { ok: false, codes: ["invalid-payload"] };
  }
  const success = (payload as { success?: unknown }).success === true;
  const rawCodes = (payload as { "error-codes"?: unknown })["error-codes"];
  const codes = Array.isArray(rawCodes) ? rawCodes.map(String) : [];
  return { ok: success, codes };
}

/**
 * Verifica el token del widget contra Cloudflare (siteverify). Sin secreto
 * configurado devuelve `skipped` y el flujo continúa (mismo patrón que Resend:
 * la plataforma no se cae por una integración ausente en desarrollo). Con la
 * integración activa, un token ausente o inválido NO pasa.
 */
export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string | null,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const { enabled } = getTurnstileConfig();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!enabled || !secret) return { ok: true, skipped: true };

  const response = typeof token === "string" ? token.trim() : "";
  if (!response) return { ok: false };

  const body = new URLSearchParams({ secret, response });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return { ok: false };
    const verdict = interpretTurnstileResponse(await res.json());
    if (!verdict.ok) {
      console.warn("turnstile rechazó un token", { codes: verdict.codes });
    }
    return { ok: verdict.ok };
  } catch (error) {
    console.error("turnstile siteverify failed", { error });
    return { ok: false };
  }
}
