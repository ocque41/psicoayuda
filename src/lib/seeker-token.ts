import { createHmac, timingSafeEqual } from "node:crypto";

// Nombre de la cookie httpOnly que guarda el token del seeker.
export const SEEKER_COOKIE = "nido_seeker";

// Token opaco firmado (HMAC-SHA256) que identifica a un seeker SIN cuenta.
// Sin PII: sid es un id aleatorio. La revocación/expiración real se consulta en
// seekerSessions; el token solo prueba "este navegador abrió esta conversación".
// Puro (secret y now se pasan como argumentos) para poder testearlo.

export type SeekerTokenPayload = {
  sid: string;
  conversationId: string;
  helpRequestId?: string;
  role: "seeker";
  iat: number;
  exp: number;
};

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlToBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(body).digest());
}

export function mintSeekerToken(
  payload: SeekerTokenPayload,
  secret: string,
): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body, secret)}`;
}

export function verifySeekerToken(
  token: string,
  secret: string,
  nowMs: number,
): SeekerTokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, secret);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: SeekerTokenPayload;
  try {
    payload = JSON.parse(base64urlToBuffer(body).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  if (
    payload.role !== "seeker" ||
    typeof payload.sid !== "string" ||
    typeof payload.conversationId !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp < nowMs
  ) {
    return null;
  }

  return payload;
}

// ---- Token simétrico para el PROFESIONAL ----
// El profesional ya está autenticado (better-auth); cuando abre /c/<id> se le
// mintea un token firmado igual que al seeker, para que onBeforeConnect autorice
// por HMAC sin tener que llamar a better-auth dentro del Worker.

export const PRO_COOKIE = "nido_pro";

export type ProTokenPayload = {
  professionalId: string;
  conversationId: string;
  role: "professional";
  iat: number;
  exp: number;
};

export function mintProfessionalToken(
  payload: ProTokenPayload,
  secret: string,
): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body, secret)}`;
}

export function verifyProfessionalToken(
  token: string,
  secret: string,
  nowMs: number,
): ProTokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, secret);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: ProTokenPayload;
  try {
    payload = JSON.parse(base64urlToBuffer(body).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  if (
    payload.role !== "professional" ||
    typeof payload.professionalId !== "string" ||
    typeof payload.conversationId !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp < nowMs
  ) {
    return null;
  }

  return payload;
}

// ---- Token de AVISOS del profesional ----
// La lista de conversaciones del chat abre conexiones de solo lectura a las
// salas del profesional para avisar al instante de mensajes nuevos. Ese token no
// va atado a una sala (serían una por conversación): identifica al profesional y
// el Worker comprueba en D1 que la sala que pide es suya. Sin permisos de
// escritura: la conexión de avisos nunca envía frames.

export const PRO_INBOX_COOKIE = "nido_pro_avisos";

export type ProInboxTokenPayload = {
  professionalId: string;
  role: "inbox";
  iat: number;
  exp: number;
};

export function mintProfessionalInboxToken(
  payload: ProInboxTokenPayload,
  secret: string,
): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body, secret)}`;
}

export function verifyProfessionalInboxToken(
  token: string,
  secret: string,
  nowMs: number,
): ProInboxTokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, secret);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: ProInboxTokenPayload;
  try {
    payload = JSON.parse(base64urlToBuffer(body).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  if (
    payload.role !== "inbox" ||
    typeof payload.professionalId !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp < nowMs
  ) {
    return null;
  }

  return payload;
}
