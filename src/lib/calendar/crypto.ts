import "server-only";
import { Buffer } from "node:buffer";

const encoder = new TextEncoder();
export function calendarKeyConfigured() {
  return /^[a-fA-F0-9]{64}$/.test(
    process.env.NIDO_CALENDAR_ENCRYPTION_KEY?.trim() || "",
  );
}
async function key() {
  if (!calendarKeyConfigured()) throw new Error("calendar_key_unavailable");
  const bytes = Buffer.from(
    process.env.NIDO_CALENDAR_ENCRYPTION_KEY?.trim() || "",
    "hex",
  );
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
function aad(
  purpose: "token" | "state",
  userId: string,
  audience: string,
  id: string,
) {
  return encoder.encode(
    JSON.stringify(["nido-calendar-v1", purpose, userId, audience, id]),
  );
}
export async function sealCalendarSecret(
  value: string,
  purpose: "token" | "state",
  userId: string,
  audience: string,
  id: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(purpose, userId, audience, id) },
    await key(),
    encoder.encode(value),
  );
  return `v1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(data).toString("base64url")}`;
}
export async function openCalendarSecret(
  envelope: string,
  purpose: "token" | "state",
  userId: string,
  audience: string,
  id: string,
) {
  const [v, rawIv, rawData, extra] = envelope.split(".");
  const iv = Buffer.from(rawIv || "", "base64url"),
    data = Buffer.from(rawData || "", "base64url");
  if (
    v !== "v1" ||
    extra ||
    iv.length !== 12 ||
    data.length < 16 ||
    data.length > 20000
  )
    throw new Error("calendar_ciphertext_invalid");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(iv),
      additionalData: aad(purpose, userId, audience, id),
    },
    await key(),
    new Uint8Array(data),
  );
  return new TextDecoder().decode(plaintext);
}
export async function calendarDigest(value: string) {
  return Buffer.from(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  ).toString("hex");
}
export function calendarRandom() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
}
export async function calendarChallenge(verifier: string) {
  return Buffer.from(
    await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
  ).toString("base64url");
}
