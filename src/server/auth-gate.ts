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

export type SeekerSessionRow = {
  revoked_at: number | null;
  expires_at: number | null;
  status: string | null;
};

/**
 * Decisión PURA de si una sesión de seeker (o su ausencia) habilita el acceso al
 * WebSocket. La fila viene de D1 (seeker_sessions + estado de la conversación).
 * - Sin fila: permitimos — el token ya pasó HMAC + expiración propia; la fila
 *   puede no existir en entornos sin D1 (tests).
 * - Con fila: es el kill-switch real — revocada, expirada o conversación
 *   cerrada/anonimizada => fuera (corta también lo que el token por sí solo no).
 */
export function seekerSessionAllows(
  row: SeekerSessionRow | null,
  nowMs: number,
): boolean {
  if (!row) return true;
  if (row.revoked_at != null) return false;
  if (row.expires_at != null && row.expires_at <= nowMs) return false;
  if (row.status === "closed" || row.status === "anonymized") return false;
  return true;
}

/**
 * Comprueba la vigencia de la sesión del seeker contra D1. Best-effort: si no hay
 * binding D1 (tests) o la consulta falla, NO bloqueamos (nos apoyamos en el
 * token ya validado) para no tumbar el chat por un fallo transitorio de la DB.
 */
async function seekerSessionActive(
  env: Env,
  sid: string,
  conversationId: string,
  nowMs: number,
): Promise<boolean> {
  const database = env.DB;
  if (!database) return true;
  try {
    const row = (await database
      .prepare(
        `SELECT s.revoked_at AS revoked_at, s.expires_at AS expires_at, c.status AS status
         FROM seeker_sessions s
         LEFT JOIN conversations c ON c.id = s.conversation_id
         WHERE s.sid = ? AND s.conversation_id = ?
         LIMIT 1`,
      )
      .bind(sid, conversationId)
      .first()) as SeekerSessionRow | null;
    return seekerSessionAllows(row, nowMs);
  } catch {
    return true;
  }
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

/**
 * Construye el onBeforeConnect de partyserver capturando `env` por closure
 * (la firma de partyserver no recibe env). Valida Origin (anti-CSWSH), autoriza
 * por token e inyecta headers de confianza que el DO leerá; cualquier otro => 403.
 */
export function makeOnBeforeConnect(env: Env) {
  return async (
    request: Request,
    lobby: { party: string; name: string },
  ): Promise<Request | Response> => {
    if (!isAllowedOrigin(request, env)) {
      return new Response("Forbidden origin", { status: 403 });
    }
    const secret = env.BETTER_AUTH_SECRET;
    if (!secret) {
      return new Response("Server misconfigured", { status: 500 });
    }
    const now = Date.now();
    const decision = authorizeConnection(
      request.headers.get("Cookie"),
      lobby.name,
      secret,
      now,
    );
    if (!decision) {
      return new Response("Unauthorized", { status: 403 });
    }
    // Kill-switch real para el seeker: además del token, exigimos que su sesión
    // siga vigente en D1 (no revocada/expirada y conversación abierta). El
    // profesional es dueño autenticado, no necesita esta comprobación.
    if (
      decision.role === "seeker" &&
      !(await seekerSessionActive(env, decision.id, lobby.name, now))
    ) {
      return new Response("Session revoked", { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set("x-nido-role", decision.role);
    headers.set("x-nido-id", decision.id);
    return new Request(request, { headers });
  };
}
