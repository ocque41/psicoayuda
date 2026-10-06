import "server-only";
import { Buffer } from "node:buffer";

const encoder = new TextEncoder();
function keyMaterial() {
  const secret = process.env.NIDO_NOTES_ENCRYPTION_KEY?.trim();
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret))
    throw new Error(
      "El almacenamiento privado de notas aún no está configurado.",
    );
  return Uint8Array.from(secret.match(/.{2}/g) || [], (part) =>
    Number.parseInt(part, 16),
  );
}
async function key() {
  return crypto.subtle.importKey("raw", keyMaterial(), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
function binding(
  professionalId: string,
  patientId: string,
  noteId: string,
  namespace: string,
) {
  return encoder.encode(
    JSON.stringify([namespace, professionalId, patientId, noteId]),
  );
}
export function notesConfigured() {
  return /^[a-fA-F0-9]{64}$/.test(
    process.env.NIDO_NOTES_ENCRYPTION_KEY?.trim() || "",
  );
}
export async function encryptNote(
  content: string,
  professionalId: string,
  patientId: string,
  noteId: string,
  namespace = "nido-notes-v1",
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: binding(professionalId, patientId, noteId, namespace),
    },
    await key(),
    encoder.encode(content),
  );
  return `v1.${Buffer.from(iv).toString("base64")}.${Buffer.from(bytes).toString("base64")}`;
}
export async function decryptNote(
  envelope: string,
  professionalId: string,
  patientId: string,
  noteId: string,
  namespace = "nido-notes-v1",
) {
  const [version, rawIv, rawData, extra] = envelope.split(".");
  const iv = Buffer.from(rawIv || "", "base64");
  const data = Buffer.from(rawData || "", "base64");
  if (version !== "v1" || extra || iv.length !== 12 || data.length > 50000)
    throw new Error("No pudimos abrir esta nota privada.");
  const bytes = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(iv),
      additionalData: binding(professionalId, patientId, noteId, namespace),
    },
    await key(),
    new Uint8Array(data),
  );
  return new TextDecoder().decode(bytes);
}
