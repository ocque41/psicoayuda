import "server-only";
import {
  type PushPayload,
  permittedPushEndpoint,
  pushPayloadSchema,
  pushSubscriptionSchema,
  type WebPushSubscription,
} from "./contract";
import { base64url, concatenate, decodeBase64url, utf8 } from "./encoding";

async function hkdf(
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) {
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      key,
      length * 8,
    ),
  );
}

/** RFC 8291 / 8188. Explicit entropy exists for published-vector tests only. */
export async function encryptWebPushPayload(
  subscription: WebPushSubscription,
  plaintext: Uint8Array<ArrayBuffer>,
  options: {
    sender?: CryptoKeyPair;
    salt?: Uint8Array<ArrayBuffer>;
    padding?: number;
  } = {},
) {
  const receiver = decodeBase64url(subscription.keys.p256dh, 65);
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiver,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sender =
    options.sender ||
    (await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ));
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", sender.publicKey),
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverKey },
      sender.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    shared,
    decodeBase64url(subscription.keys.auth, 16),
    concatenate(utf8.encode("WebPush: info\0"), receiver, publicKey),
    32,
  );
  const salt = options.salt || crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16 || plaintext.length > 3993)
    throw new Error("push_payload_invalid");
  const cek = await hkdf(
    ikm,
    salt,
    utf8.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    ikm,
    salt,
    utf8.encode("Content-Encoding: nonce\0"),
    12,
  );
  const record = new Uint8Array(
    Math.max(plaintext.length + 1, options.padding || 0),
  );
  if (record.length > 3994) throw new Error("push_payload_invalid");
  record.set(plaintext);
  record[plaintext.length] = 2;
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt",
  ]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record),
  );
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = publicKey.length;
  return concatenate(header, publicKey, encrypted);
}

export type VapidConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export async function vapidAuthorization(
  endpoint: string,
  configuration: VapidConfiguration,
  at: number,
) {
  const publicKey = decodeBase64url(configuration.publicKey, 65);
  const d = decodeBase64url(configuration.privateKey, 32);
  if (publicKey[0] !== 4) throw new Error("push_configuration_invalid");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64url(publicKey.slice(1, 33)),
    y: base64url(publicKey.slice(33)),
    d: base64url(d),
  };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64url(
    utf8.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const body = base64url(
    utf8.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(at / 1000) + 3600,
        sub: configuration.subject,
      }),
    ),
  );
  const signed = `${header}.${body}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      utf8.encode(signed),
    ),
  );
  const verifyKey = await crypto.subtle.importKey(
    "raw",
    publicKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      signature,
      utf8.encode(signed),
    ))
  )
    throw new Error("push_configuration_invalid");
  return `vapid t=${signed}.${base64url(signature)}, k=${configuration.publicKey}`;
}

export function readVapidConfiguration(): VapidConfiguration | null {
  try {
    const publicKey = process.env.NIDO_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
    const privateKey = process.env.NIDO_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
    const subject = process.env.NIDO_PUSH_VAPID_SUBJECT?.trim() || "";
    decodeBase64url(publicKey, 65);
    decodeBase64url(privateKey, 32);
    const url = new URL(subject);
    if (
      !(
        (url.protocol === "mailto:" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)) ||
        (url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash)
      )
    )
      return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}

export type WebPushResult =
  | { ok: true }
  | {
      ok: false;
      code: "unavailable" | "invalid" | "expired" | "temporary" | "rejected";
      retryable: boolean;
    };

/** No redirects, bounded TTL/body/deadline, and no provider body or endpoint logs. */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: PushPayload,
  ttl: number,
  options: {
    fetch?: typeof fetch;
    configuration?: VapidConfiguration;
    at?: number;
    deadline?: number;
    now?: () => number;
  } = {},
): Promise<WebPushResult> {
  const configuration = options.configuration || readVapidConfiguration();
  if (
    !configuration ||
    (!options.configuration && process.env.NIDO_PUSH_ENABLED !== "true")
  )
    return { ok: false, retryable: false, code: "unavailable" };
  if (
    !pushPayloadSchema.safeParse(payload).success ||
    !pushSubscriptionSchema.safeParse(subscription).success ||
    !permittedPushEndpoint(subscription.endpoint) ||
    !Number.isInteger(ttl) ||
    ttl < 1 ||
    ttl > 300
  )
    return { ok: false, retryable: false, code: "invalid" };
  let body: Uint8Array<ArrayBuffer>;
  let authorization: string;
  try {
    body = await encryptWebPushPayload(
      subscription,
      utf8.encode(JSON.stringify(payload)),
      { padding: 512 },
    );
    authorization = await vapidAuthorization(
      subscription.endpoint,
      configuration,
      options.at ?? Date.now(),
    );
  } catch {
    return { ok: false, retryable: false, code: "invalid" };
  }
  try {
    const topic = base64url(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", utf8.encode(payload.id)),
      ).slice(0, 24),
    );
    const remaining =
      options.deadline === undefined
        ? 8000
        : Math.min(8000, options.deadline - (options.now || Date.now)());
    if (remaining <= 0)
      return { ok: false, retryable: true, code: "temporary" };
    const response = await (options.fetch || fetch)(subscription.endpoint, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(Math.floor(remaining)),
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttl),
        Urgency: "normal",
        Topic: topic,
      },
      body,
    });
    if (response.status >= 200 && response.status < 300) return { ok: true };
    if (response.status === 404 || response.status === 410)
      return { ok: false, retryable: false, code: "expired" };
    if (response.status === 429 || response.status >= 500)
      return { ok: false, retryable: true, code: "temporary" };
    return { ok: false, retryable: false, code: "rejected" };
  } catch {
    return { ok: false, retryable: true, code: "temporary" };
  }
}
