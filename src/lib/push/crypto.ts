import "server-only";
import type { PushRole } from "./contract";
import { base64url, decodeBase64url, utf8 } from "./encoding";

export function pushStorageReady() {
  return /^[a-fA-F0-9]{64}$/.test(process.env.NIDO_PUSH_ENCRYPTION_KEY || "");
}
async function storageKey() {
  if (!pushStorageReady()) throw new Error("push_storage_unavailable");
  const hex = process.env.NIDO_PUSH_ENCRYPTION_KEY || "";
  const bytes = Uint8Array.from(hex.match(/../g) || [], (pair) =>
    Number.parseInt(pair, 16),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
const aad = (userId: string, role: PushRole, id: string) =>
  utf8.encode(JSON.stringify(["nido-push-v1", userId, role, id]));
export async function sealPushSubscription(
  value: string,
  userId: string,
  role: PushRole,
  id: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(userId, role, id) },
    await storageKey(),
    utf8.encode(value),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
export async function openPushSubscription(
  envelope: string,
  userId: string,
  role: PushRole,
  id: string,
) {
  const [version, iv, data, extra] = envelope.split(".");
  if (version !== "v1" || extra || !iv || !data)
    throw new Error("push_ciphertext_invalid");
  const ciphertext = decodeBase64url(data);
  if (ciphertext.length < 16 || ciphertext.length > 4096)
    throw new Error("push_ciphertext_invalid");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64url(iv, 12),
      additionalData: aad(userId, role, id),
    },
    await storageKey(),
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
