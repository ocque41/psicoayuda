import "server-only";

import { db } from "@/db";
import { seekerSessions } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { newId } from "@/lib/ids";
import { mintSeekerToken } from "@/lib/seeker-token";

// TTL del enlace de acceso que viaja por correo. Corto por diseño: es un bearer
// de un clic; la sesión se renueva de forma deslizante una vez dentro (ver
// `renewSeekerChatToken`).
export const SEEKER_ACCESS_TTL_MS = 72 * 60 * 60 * 1000; // 72h

// La SESIÓN (cookie in-browser) se renueva de forma deslizante en cada visita
// mientras la conversación siga viva; el enlace de correo mantiene el TTL corto.
export const SEEKER_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90d

export function appBaseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export function accessUrlForToken(token: string) {
  return `${appBaseUrl()}/acceso/${token}`;
}

/**
 * Crea una sesión efímera NUEVA + token firmado para que una persona sin cuenta
 * vuelva a su conversación (enlace mágico por correo o aviso de respuesta). A
 * diferencia de re-mintear el mismo sid, cada enlace es revocable por separado.
 */
export async function createSeekerAccessLink(input: {
  conversationId: string;
  helpRequestId?: string | null;
  ttlMs?: number;
}): Promise<{ sid: string; token: string; url: string; expiresAt: number }> {
  const now = Date.now();
  const ttlMs = input.ttlMs ?? SEEKER_ACCESS_TTL_MS;
  const expiresAt = now + ttlMs;
  const sid = newId("seek");

  await db.insert(seekerSessions).values({
    sid,
    conversationId: input.conversationId,
    role: "seeker",
    issuedAt: new Date(now),
    expiresAt: new Date(expiresAt),
  });

  const token = mintSeekerToken(
    {
      sid,
      conversationId: input.conversationId,
      helpRequestId: input.helpRequestId ?? undefined,
      role: "seeker",
      iat: now,
      exp: expiresAt,
    },
    getAuthSecret(),
  );

  return { sid, token, url: accessUrlForToken(token), expiresAt };
}
