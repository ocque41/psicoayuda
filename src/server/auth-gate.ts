import {
  PRO_COOKIE,
  SEEKER_COOKIE,
  verifyProfessionalToken,
  verifySeekerToken,
} from "@/lib/seeker-token";
import type { Env } from "./types";

export type AuthDecision = { role: "seeker" | "professional"; id: string };

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Decisión de autorización PURA y testeable: a partir de las cookies, decide si
 * el que conecta es el seeker o el profesional de ESTA conversación. Devuelve
 * null si no hay token válido para la sala (=> 403). Garantiza exactamente dos
 * identidades posibles por sala.
 */
export function authorizeConnection(
  cookieHeader: string | null,
  conversationId: string,
  secret: string,
  nowMs: number,
): AuthDecision | null {
  const cookies = parseCookies(cookieHeader);

  const proRaw = cookies[PRO_COOKIE];
  if (proRaw) {
    const pro = verifyProfessionalToken(proRaw, secret, nowMs);
    if (pro && pro.conversationId === conversationId) {
      return { role: "professional", id: pro.professionalId };
    }
  }

  const seekerRaw = cookies[SEEKER_COOKIE];
  if (seekerRaw) {
    const seeker = verifySeekerToken(seekerRaw, secret, nowMs);
    if (seeker && seeker.conversationId === conversationId) {
      return { role: "seeker", id: seeker.sid };
    }
  }

  return null;
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // upgrades same-origin pueden omitir Origin
  const base = env.BETTER_AUTH_URL;
  if (!base) return true;
  try {
    return new URL(origin).host === new URL(base).host;
  } catch {
    return false;
  }
}

const FALLBACK_SECRET = "psicoayuda-local-development-secret-change-me";

/**
 * Construye el onBeforeConnect de partyserver capturando `env` por closure
 * (la firma de partyserver no recibe env). Valida Origin (anti-CSWSH), autoriza
 * por token e inyecta headers de confianza que el DO leerá; cualquier otro => 403.
 */
export function makeOnBeforeConnect(env: Env) {
  return (
    request: Request,
    lobby: { party: string; name: string },
  ): Request | Response => {
    if (!isAllowedOrigin(request, env)) {
      return new Response("Forbidden origin", { status: 403 });
    }
    const secret = env.BETTER_AUTH_SECRET ?? FALLBACK_SECRET;
    const decision = authorizeConnection(
      request.headers.get("Cookie"),
      lobby.name,
      secret,
      Date.now(),
    );
    if (!decision) {
      return new Response("Unauthorized", { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set("x-nido-role", decision.role);
    headers.set("x-nido-id", decision.id);
    return new Request(request, { headers });
  };
}
