import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getAuthSecret } from "@/lib/auth-secret";

export type RequesterHashPurpose = "contact_message" | "help_request";

/**
 * El propósito forma parte del hash para que el código de un formulario de
 * contacto nunca pueda correlacionarse con una solicitud de salud mental,
 * incluso si ambas llegan desde la misma conexión.
 */
export function hashRequesterAddress(
  ip: string,
  purpose: RequesterHashPurpose,
  secret: string,
) {
  return createHash("sha256")
    .update(`${secret}:${purpose}:${ip}`)
    .digest("hex");
}

/**
 * Hash irreversible de la IP de origen. Sirve únicamente para limitar abuso:
 * la IP nunca se guarda y el secreto de la aplicación impide reconstruirla.
 */
export async function getRequesterHash(purpose: RequesterHashPurpose) {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ip =
    requestHeaders.get("cf-connecting-ip") ||
    forwardedFor?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip");

  if (!ip) return undefined;

  return hashRequesterAddress(ip, purpose, getAuthSecret());
}
