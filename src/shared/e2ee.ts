// Criptografía de extremo a extremo del chat de Nido. Módulo PURO (WebCrypto)
// compartido por el navegador y los tests. El servidor NUNCA descifra: el
// Durable Object solo guarda y transporta sobres opacos.
//
// Diseño v1:
// - Par ECDH P-256: el profesional tiene UNA clave de identidad y publica la
//   pública en su ficha (D1); la persona tiene una clave por conversación y su
//   pública viaja dentro del sobre de cada mensaje que envía.
// - Clave de conversación: HKDF(ECDH(priv_propia, pub_emisor)) atada al id de la
//   conversación. ECDH es simétrico: ambos lados derivan la MISMA clave, así que
//   el emisor solo necesita la pública de la contraparte para cifrar y el
//   receptor solo su privada + la pública del emisor (que va en el sobre).
// - Sobre: JSON corto `{"v":1,"p":<pub emisor>,"n":<iv>,"c":<ciphertext>}` con
//   AES-256-GCM. El AAD (`<conversationId>|<senderRole>`) ata cada mensaje a su
//   sala y a su rol: no se puede mover de conversación ni cambiar de autor sin
//   que el descifrado falle.
// - Respaldo: keystore JSON cifrado con AES-GCM bajo una clave derivada del
//   código de recuperación (base32 Crockford, 128 bits). Sin el código nadie
//   (tampoco nosotros) puede descifrarlo.

export const E2EE_VERSION = 1;
/** Tamaño de la clave pública ECDH P-256 sin comprimir (0x04 + X + Y). */
export const PUBLIC_KEY_BYTES = 65;
/** Bytes aleatorios del código de recuperación (128 bits). */
export const RECOVERY_CODE_BYTES = 16;
/** Longitud exacta del código de recuperación en base32 Crockford. */
export const RECOVERY_CODE_LENGTH = 26;
/** Longitud máxima de un sobre: el texto máximo (4000 unidades UTF-16) puede
 *  ocupar hasta 12 KB en UTF-8 y ~16 KB en base64, más las dos claves y el IV. */
export const MAX_ENVELOPE_LENGTH = 24576;
const RECOVERY_BLOB_PREFIX = "v1";
const AAD_SEPARATOR = "|";

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_LOOKUP = new Map<string, number>(
  [...BASE64URL_ALPHABET].map((char, index) => [char, index]),
);
// Crockford: sin I, L, O ni U (se confunden con 1 y 0 al dictar/teclear).
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CROCKFORD_LOOKUP = new Map<string, number>(
  [...CROCKFORD_ALPHABET].map((char, index) => [char, index]),
);

const textEncoder = new TextEncoder();

/** Copia a un ArrayBuffer propio: los tipos nuevos de TS distinguen
 *  `Uint8Array<ArrayBufferLike>` de `BufferSource` (ArrayBufferView<ArrayBuffer>). */
function buf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function utf8(value: string): ArrayBuffer {
  return buf(textEncoder.encode(value));
}

// ---------------------------------------------------------------- base64url

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? (bytes[i + 1] ?? 0) : 0;
    const b2 = hasB2 ? (bytes[i + 2] ?? 0) : 0;
    out += BASE64URL_ALPHABET[b0 >> 2];
    out += BASE64URL_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    if (!hasB1) break;
    out += BASE64URL_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)];
    if (!hasB2) break;
    out += BASE64URL_ALPHABET[b2 & 63];
  }
  return out;
}

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input
    .replace(/=+$/u, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const value = BASE64URL_LOOKUP.get(char);
    if (value === undefined) throw new Error("base64url inválido");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// ------------------------------------------------------------- base32 code

function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += CROCKFORD_ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function base32Decode(code: string, expectedBytes: number): Uint8Array | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of code) {
    const value = CROCKFORD_LOOKUP.get(char);
    if (value === undefined) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // Los bits sobrantes deben ser 0 (padding), si no el código está corrupto.
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) return null;
  if (bytes.length !== expectedBytes) return null;
  return new Uint8Array(bytes);
}

/** Normaliza un código tecleado: mayúsculas, sin separadores y con las
 *  confusiones típicas resueltas (O→0, I/L→1). Devuelve null si no es válido. */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/gu, "")
    .replace(/[OIL]/gu, (char) => (char === "O" ? "0" : "1"));
  if (cleaned.length !== RECOVERY_CODE_LENGTH) return null;
  if (!base32Decode(cleaned, RECOVERY_CODE_BYTES)) return null;
  return cleaned;
}

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES));
  return base32Encode(bytes);
}

/** Id de búsqueda del keystore cifrado: derivado del código, nunca el código.
 *  El servidor guarda el blob bajo este id y no puede relacionarlo con nadie
 *  sin el código (128 bits de entropía). */
export async function recoveryIdFor(code: string): Promise<string | null> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    utf8(`nido-recovery-id-v1:${normalized}`),
  );
  return bytesToBase64Url(new Uint8Array(digest).slice(0, 16));
}

// ------------------------------------------------------------------- claves

export type ConversationIdentity = {
  privateKey: CryptoKey;
  /** Clave pública en base64url (raw ECDH P-256). */
  publicKey: string;
};

function isP256PublicKeyRaw(raw: Uint8Array): boolean {
  return raw.length === PUBLIC_KEY_BYTES && raw[0] === 0x04;
}

export function isValidPublicKey(encoded: string): boolean {
  try {
    return isP256PublicKeyRaw(base64UrlToBytes(encoded));
  } catch {
    return false;
  }
}

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  return bytesToBase64Url(raw);
}

export async function importPublicKey(encoded: string): Promise<CryptoKey> {
  const raw = base64UrlToBytes(encoded);
  if (!isP256PublicKeyRaw(raw)) throw new Error("clave pública inválida");
  return crypto.subtle.importKey(
    "raw",
    buf(raw),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

export async function exportPrivateKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
}

/** Convierte la clave privada en una identidad local (priv + pub). */
export async function toConversationIdentity(
  pair: CryptoKeyPair,
): Promise<ConversationIdentity> {
  return {
    privateKey: pair.privateKey,
    publicKey: await exportPublicKey(pair.publicKey),
  };
}

// ---------------------------------------------------------------- envelopes

export type E2eeEnvelope = {
  v: number;
  /** Clave pública base64url del EMISOR del mensaje. */
  p: string;
  /** Clave pública base64url del RECEPTOR. Van las dos para que tanto quien
   *  envió como quien recibió puedan leer el historial: cada lado deriva la
   *  clave con su privada y la pública de la CONTRAPARTE (la que no es la
   *  suya). Sin esto, el emisor no podría releer sus propios mensajes. */
  q: string;
  /** IV aleatorio base64url. */
  n: string;
  /** Ciphertext + tag base64url. */
  c: string;
};

function envelopeAad(conversationId: string, senderRole: string): ArrayBuffer {
  return utf8(`${conversationId}${AAD_SEPARATOR}${senderRole}`);
}

export function parseEnvelope(content: string): E2eeEnvelope | null {
  if (
    content.length < 40 ||
    content.length > MAX_ENVELOPE_LENGTH ||
    content.charCodeAt(0) !== 0x7b // "{"
  ) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const frame = data as Record<string, unknown>;
  if (
    frame.v !== E2EE_VERSION ||
    typeof frame.p !== "string" ||
    typeof frame.q !== "string" ||
    typeof frame.n !== "string" ||
    typeof frame.c !== "string"
  ) {
    return null;
  }
  if (!isValidPublicKey(frame.p) || !isValidPublicKey(frame.q)) return null;
  if (frame.c.length === 0 || frame.c.length > MAX_ENVELOPE_LENGTH) return null;
  return {
    v: E2EE_VERSION,
    p: frame.p,
    q: frame.q,
    n: frame.n,
    c: frame.c,
  };
}

export function isEnvelope(content: string): boolean {
  return parseEnvelope(content) !== null;
}

async function deriveConversationKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  conversationId: string,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: utf8(`nido-e2ee-salt-v1:${conversationId}`),
      info: utf8("nido-e2ee-message-v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Cifra un mensaje para la contraparte. El sobre incluye las DOS claves
 *  públicas (emisor y receptor): cada lado lo abre con su privada y la pública
 *  de la contraparte, sin necesitar nada más. */
export async function createEnvelope(input: {
  identity: ConversationIdentity;
  peerPublicKey: string;
  conversationId: string;
  senderRole: string;
  plaintext: string;
}): Promise<string> {
  const peer = await importPublicKey(input.peerPublicKey);
  const key = await deriveConversationKey(
    input.identity.privateKey,
    peer,
    input.conversationId,
  );
  const iv = buf(crypto.getRandomValues(new Uint8Array(12)));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: envelopeAad(input.conversationId, input.senderRole),
    },
    key,
    utf8(input.plaintext),
  );
  const envelope: E2eeEnvelope = {
    v: E2EE_VERSION,
    p: input.identity.publicKey,
    q: input.peerPublicKey,
    n: bytesToBase64Url(new Uint8Array(iv)),
    c: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

/** Descifra un sobre con MI privada y la pública de la contraparte que va
 *  dentro. Devuelve null ante cualquier fallo (sobre corrupto, clave ajena, AAD
 *  manipulado): nunca lanza en el camino del render. */
export async function openEnvelope(input: {
  identity: ConversationIdentity;
  conversationId: string;
  senderRole: string;
  content: string;
}): Promise<string | null> {
  const envelope = parseEnvelope(input.content);
  if (!envelope) return null;
  const mine = input.identity.publicKey;
  let peerEncoded: string | null = null;
  if (envelope.q === mine) peerEncoded = envelope.p;
  else if (envelope.p === mine) peerEncoded = envelope.q;
  if (!peerEncoded) return null;
  try {
    const peer = await importPublicKey(peerEncoded);
    const key = await deriveConversationKey(
      input.identity.privateKey,
      peer,
      input.conversationId,
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: buf(base64UrlToBytes(envelope.n)),
        additionalData: envelopeAad(input.conversationId, input.senderRole),
      },
      key,
      buf(base64UrlToBytes(envelope.c)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ respaldo

export type KeystoreEntry = {
  slot: string;
  publicKey: string;
  privateKey: JsonWebKey;
  createdAt: string;
};

export type KeystoreFile = { v: number; entries: KeystoreEntry[] };

export function parseKeystore(json: string): KeystoreFile | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const file = data as Record<string, unknown>;
  if (file.v !== E2EE_VERSION || !Array.isArray(file.entries)) return null;
  const entries: KeystoreEntry[] = [];
  for (const raw of file.entries) {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.slot !== "string" ||
      typeof entry.publicKey !== "string" ||
      typeof entry.privateKey !== "object" ||
      entry.privateKey === null ||
      typeof entry.createdAt !== "string"
    ) {
      return null;
    }
    entries.push({
      slot: entry.slot,
      publicKey: entry.publicKey,
      privateKey: entry.privateKey as JsonWebKey,
      createdAt: entry.createdAt,
    });
  }
  return { v: E2EE_VERSION, entries };
}

async function deriveRecoveryAesKey(code: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error("código de recuperación inválido");
  const raw = base32Decode(normalized, RECOVERY_CODE_BYTES);
  if (!raw) throw new Error("código de recuperación inválido");
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    buf(raw),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: utf8("nido-recovery-salt-v1"),
      info: utf8("nido-recovery-keystore-v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Cifra el keystore completo con el código. Formato `v1.<iv>.<ct>`. */
export async function wrapKeystore(
  keystoreJson: string,
  code: string,
): Promise<string> {
  const key = await deriveRecoveryAesKey(code);
  const iv = buf(crypto.getRandomValues(new Uint8Array(12)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    utf8(keystoreJson),
  );
  return `${RECOVERY_BLOB_PREFIX}.${bytesToBase64Url(new Uint8Array(iv))}.${bytesToBase64Url(
    new Uint8Array(ciphertext),
  )}`;
}

export async function unwrapKeystore(
  blob: string,
  code: string,
): Promise<string | null> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== RECOVERY_BLOB_PREFIX) return null;
  try {
    const key = await deriveRecoveryAesKey(code);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf(base64UrlToBytes(parts[1] ?? "")) },
      key,
      buf(base64UrlToBytes(parts[2] ?? "")),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
