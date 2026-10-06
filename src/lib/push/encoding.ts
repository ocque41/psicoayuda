export const utf8 = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeBase64url(value: string, length?: number) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8192)
    throw new Error("push_encoding_invalid");
  const bytes = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );
  if (base64url(bytes) !== value || (length && bytes.length !== length))
    throw new Error("push_encoding_invalid");
  return bytes;
}

export function concatenate(...parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export async function pushDigest(value: string) {
  return base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(value))),
  );
}
