import { chooseChatIdentity } from "@/lib/chat-identity";
import {
  PRO_COOKIE,
  SEEKER_COOKIE,
  verifyProfessionalToken,
  verifySeekerToken,
} from "@/lib/seeker-token";
import type { Env } from "./types";

export type AuthDecision = { role: "seeker" | "professional"; id: string };

type AuthGateEnv = Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"> & {
  DB?: Env["DB"];
};

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
 *
 * La prelación es la MISMA que la de la página y las server actions
 * (`chooseChatIdentity`): con ambas cookies gana el profesional, salvo que pida
 * `?como=persona` (`preferPersona`) y su credencial de seeker esté vigente. Sin
 * esto, la UI pintaba una identidad (seeker primero) y el WebSocket escribía con
 * otra (profesional primero): el mensaje aparecía "como el otro".
 */
export function authorizeConnection(
  cookieHeader: string | null,
  conversationId: string,
  secret: string,
  nowMs: number,
  preferPersona = false,
): AuthDecision | null {
  const cookies = parseCookies(cookieHeader);

  let professionalId: string | null = null;
  const proRaw = cookies[PRO_COOKIE];
  if (proRaw) {
    const pro = verifyProfessionalToken(proRaw, secret, nowMs);
    if (pro && pro.conversationId === conversationId) {
      professionalId = pro.professionalId;
    }
  }

  let seekerSid: string | null = null;
  const seekerRaw = cookies[SEEKER_COOKIE];
  if (seekerRaw) {
    const seeker = verifySeekerToken(seekerRaw, secret, nowMs);
    if (seeker && seeker.conversationId === conversationId) {
      seekerSid = seeker.sid;
    }
  }

  const identity = chooseChatIdentity(
    { professional: professionalId != null, seeker: seekerSid != null },
    preferPersona,
  );
  if (identity === "professional" && professionalId) {
    return { role: "professional", id: professionalId };
  }
  if (identity === "seeker" && seekerSid) {
    return { role: "seeker", id: seekerSid };
  }
  return null;
}

export type SeekerSessionRow = {
  revoked_at: number | null;
  expires_at: number | null;
  status: string | null;
  anonymized_at: number | null;
};

/**
 * Decisión PURA de si una sesión de seeker (o su ausencia) habilita el acceso al
 * WebSocket. La fila viene de D1 (seeker_sessions + estado de la conversación).
 * - Sin fila: permitimos — el token ya pasó HMAC + expiración propia; la fila
 *   puede no existir en entornos sin D1 (tests).
 * - Con fila: es el kill-switch real — revocada, expirada o ANONIMIZADA => fuera.
 *   Una conversación CERRADA se permite: el historial es de solo lectura y la
 *   persona puede reabrirla dentro de la ventana de retención (el envío lo corta
 *   `x-nido-can-send`, no la conexión).
 */
export function seekerSessionAllows(
  row: SeekerSessionRow | null,
  nowMs: number,
): boolean {
  if (!row) return true;
  if (row.revoked_at != null) return false;
  if (row.expires_at != null && row.expires_at <= nowMs) return false;
  if (row.anonymized_at != null) return false;
  return true;
}

/** ¿Puede ESCRIBIR esta conexión? Solo si la conversación sigue abierta. */
export function seekerCanSend(row: SeekerSessionRow | null): boolean {
  if (!row) return true; // sin fila (tests/sin D1): no bloqueamos el envío
  return row.status === "open" && row.anonymized_at == null;
}

export type ProfessionalSessionRow = {
  conversation_status: string | null;
  professional_status: string | null;
  anonymized_at: number | null;
};

/**
 * Decisión PURA del kill-switch del profesional. La fila viene de D1.
 * - Sin fila: permitimos (el token HMAC ya pasó; la fila puede faltar en tests).
 * - Con fila: fuera si la conversación está ANONIMIZADA o la cuenta suspendida
 *   (un suspendido con cookie válida de 72h podía reconectar). Una conversación
 *   cerrada se permite para leer el historial y reabrir.
 */
export function professionalConnectionAllows(
  row: ProfessionalSessionRow | null,
): boolean {
  if (!row) return true;
  if (row.anonymized_at != null) return false;
  if (row.professional_status === "suspended") return false;
  return true;
}

/** ¿Puede ESCRIBIR el profesional? Solo si la conversación sigue abierta. */
export function professionalCanSend(
  row: ProfessionalSessionRow | null,
): boolean {
  if (!row) return true;
  return row.conversation_status === "open" && row.anonymized_at == null;
}

export type ConnectGate = { allowed: boolean; canSend: boolean };

/**
 * Comprueba la vigencia de la sesión del seeker contra D1. Best-effort: si no hay
 * binding D1 (tests) o la consulta falla, NO bloqueamos (nos apoyamos en el
 * token ya validado) para no tumbar el chat por un fallo transitorio de la DB.
 */
async function seekerSessionActive(
  env: AuthGateEnv,
  sid: string,
  conversationId: string,
  nowMs: number,
): Promise<ConnectGate> {
  const database = env.DB;
  if (!database) return { allowed: true, canSend: true };
  try {
    const row = (await database
      .prepare(
        `SELECT s.revoked_at AS revoked_at, s.expires_at AS expires_at, c.status AS status, c.anonymized_at AS anonymized_at
         FROM seeker_sessions s
         LEFT JOIN conversations c ON c.id = s.conversation_id
         WHERE s.sid = ? AND s.conversation_id = ?
         LIMIT 1`,
      )
      .bind(sid, conversationId)
      .first()) as SeekerSessionRow | null;
    return {
      allowed: seekerSessionAllows(row, nowMs),
      canSend: seekerCanSend(row),
    };
  } catch {
    return { allowed: true, canSend: true };
  }
}

/**
 * Kill-switch del profesional contra D1: la conversación debe seguir abierta y la
 * cuenta no estar suspendida. Best-effort: sin binding D1 (tests) o ante un fallo
 * transitorio, NO bloqueamos (nos apoyamos en el token ya validado).
 */
async function professionalSessionActive(
  env: AuthGateEnv,
  professionalId: string,
  conversationId: string,
): Promise<ConnectGate> {
  const database = env.DB;
  if (!database) return { allowed: true, canSend: true };
  try {
    const row = (await database
      .prepare(
        `SELECT c.status AS conversation_status, c.anonymized_at AS anonymized_at, p.status AS professional_status
         FROM conversations c
         LEFT JOIN professionals p ON p.id = ?
         WHERE c.id = ?
         LIMIT 1`,
      )
      .bind(professionalId, conversationId)
      .first()) as ProfessionalSessionRow | null;
    return {
      allowed: professionalConnectionAllows(row),
      canSend: professionalCanSend(row),
    };
  } catch {
    return { allowed: true, canSend: true };
  }
}

function isAllowedOrigin(request: Request, env: AuthGateEnv): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // upgrades same-origin pueden omitir Origin
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // Origin presente pero mal formado => bloquea
  }
  // Aceptamos el Origin si coincide con el host configurado (BETTER_AUTH_URL) o
  // con el Host real que sirvió la página. Sin esto, en cuanto el dominio de
  // producción difiere de BETTER_AUTH_URL (dominio propio, apex vs www, preview)
  // TODOS los upgrades WebSocket se rechazaban con 403 y el chat moría.
  const allowedHosts = new Set<string>();
  const base = env.BETTER_AUTH_URL;
  if (base) {
    try {
      allowedHosts.add(new URL(base).host);
    } catch {
      // BETTER_AUTH_URL mal formado: caemos al Host de la request.
    }
  }
  const hostHeader = request.headers.get("Host");
  if (hostHeader) allowedHosts.add(hostHeader);
  // Sin ninguna referencia fiable no bloqueamos por Origin (el token HMAC sigue
  // siendo obligatorio aguas abajo).
  if (allowedHosts.size === 0) return true;
  return allowedHosts.has(originHost);
}

/**
 * Construye el onBeforeConnect de partyserver capturando `env` por closure
 * (la firma de partyserver no recibe env). Valida Origin (anti-CSWSH), autoriza
 * por token e inyecta headers de confianza que el DO leerá; cualquier otro => 403.
 */
export function makeOnBeforeConnect(env: AuthGateEnv) {
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
    // El profesional puede pedir la vista de la persona (`?como=persona` en la
    // URL del WebSocket). Con la misma regla que la página, nunca por accidente.
    let preferPersona = false;
    try {
      preferPersona =
        new URL(request.url).searchParams.get("como") === "persona";
    } catch {
      // URL mal formada: sin preferencia (gana la prelación por defecto).
    }
    const decision = authorizeConnection(
      request.headers.get("Cookie"),
      lobby.name,
      secret,
      now,
      preferPersona,
    );
    if (!decision) {
      return new Response("Unauthorized", { status: 403 });
    }
    // Kill-switch real en D1 (el token HMAC por sí solo no basta). El seeker debe
    // tener su sesión vigente (no revocada/expirada ni la conversación
    // anonimizada); el profesional, su cuenta no suspendida. Una conversación
    // cerrada se permite SOLO en lectura: `x-nido-can-send=0` corta el envío en
    // el DO hasta que se reabra.
    const gate: ConnectGate =
      decision.role === "seeker"
        ? await seekerSessionActive(env, decision.id, lobby.name, now)
        : await professionalSessionActive(env, decision.id, lobby.name);
    if (!gate.allowed) {
      return new Response("Session revoked", { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set("x-nido-role", decision.role);
    headers.set("x-nido-id", decision.id);
    headers.set("x-nido-can-send", gate.canSend ? "1" : "0");
    return new Request(request, { headers });
  };
}
