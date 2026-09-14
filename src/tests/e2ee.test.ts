import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  createEnvelope,
  exportPrivateKeyJwk,
  generateIdentityKeyPair,
  generateRecoveryCode,
  importPrivateKeyJwk,
  isEnvelope,
  isValidPublicKey,
  type KeystoreFile,
  normalizeRecoveryCode,
  openEnvelope,
  parseEnvelope,
  parseKeystore,
  recoveryIdFor,
  toConversationIdentity,
  unwrapKeystore,
  wrapKeystore,
} from "@/shared/e2ee";

async function makeIdentity() {
  return toConversationIdentity(await generateIdentityKeyPair());
}

describe("e2ee — base64url", () => {
  it("hace roundtrip con longitudes no múltiplas de 3", () => {
    for (const bytes of [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 1]),
      new Uint8Array([0, 1, 2]),
      new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63, 64]),
    ]) {
      expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("rechaza caracteres inválidos", () => {
    expect(() => base64UrlToBytes("no válido!")).toThrow();
  });
});

describe("e2ee — sobres de mensaje", () => {
  it("A cifra para B y solo B lo abre, en ambos sentidos", async () => {
    const a = await makeIdentity();
    const b = await makeIdentity();

    const deA = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_1",
      senderRole: "seeker",
      plaintext: "hola ñ 😀",
    });
    expect(isEnvelope(deA)).toBe(true);
    expect(parseEnvelope(deA)?.p).toBe(a.publicKey);
    await expect(
      openEnvelope({
        identity: b,
        conversationId: "conv_1",
        senderRole: "seeker",
        content: deA,
      }),
    ).resolves.toBe("hola ñ 😀");

    const deB = await createEnvelope({
      identity: b,
      peerPublicKey: a.publicKey,
      conversationId: "conv_1",
      senderRole: "professional",
      plaintext: "te escucho",
    });
    await expect(
      openEnvelope({
        identity: a,
        conversationId: "conv_1",
        senderRole: "professional",
        content: deB,
      }),
    ).resolves.toBe("te escucho");
  });

  it("el emisor también puede releer sus propios mensajes (sobre con ambas claves)", async () => {
    const a = await makeIdentity();
    const b = await makeIdentity();
    const envelope = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_1",
      senderRole: "seeker",
      plaintext: "mi propio mensaje",
    });
    await expect(
      openEnvelope({
        identity: a,
        conversationId: "conv_1",
        senderRole: "seeker",
        content: envelope,
      }),
    ).resolves.toBe("mi propio mensaje");
    await expect(
      openEnvelope({
        identity: b,
        conversationId: "conv_1",
        senderRole: "seeker",
        content: envelope,
      }),
    ).resolves.toBe("mi propio mensaje");
  });

  it("el AAD ata el mensaje a la sala y al rol del emisor", async () => {
    const a = await makeIdentity();
    const b = await makeIdentity();
    const envelope = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_1",
      senderRole: "seeker",
      plaintext: "secreto",
    });
    await expect(
      openEnvelope({
        identity: b,
        conversationId: "otra_conv",
        senderRole: "seeker",
        content: envelope,
      }),
    ).resolves.toBeNull();
    await expect(
      openEnvelope({
        identity: b,
        conversationId: "conv_1",
        senderRole: "professional",
        content: envelope,
      }),
    ).resolves.toBeNull();
  });

  it("un tercero no puede abrir el sobre", async () => {
    const a = await makeIdentity();
    const b = await makeIdentity();
    const c = await makeIdentity();
    const envelope = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_1",
      senderRole: "seeker",
      plaintext: "privado",
    });
    await expect(
      openEnvelope({
        identity: c,
        conversationId: "conv_1",
        senderRole: "seeker",
        content: envelope,
      }),
    ).resolves.toBeNull();
  });

  it("detecta manipulación del ciphertext", async () => {
    const a = await makeIdentity();
    const b = await makeIdentity();
    const envelope = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_1",
      senderRole: "seeker",
      plaintext: "íntegro",
    });
    const parsed = parseEnvelope(envelope);
    expect(parsed).not.toBeNull();
    const tampered = JSON.stringify({ ...parsed, c: `${parsed?.c}AA` });
    await expect(
      openEnvelope({
        identity: b,
        conversationId: "conv_1",
        senderRole: "seeker",
        content: tampered,
      }),
    ).resolves.toBeNull();
  });

  it("el texto plano legado NO se confunde con un sobre", () => {
    expect(isEnvelope("hola, ¿cómo estás?")).toBe(false);
    expect(isEnvelope('{"v":1}')).toBe(false);
    expect(isEnvelope("[1,2,3]")).toBe(false);
    expect(isEnvelope(`{"v":1,"p":"x","n":"y","c":"z"}`)).toBe(false);
  });

  it("valida claves públicas P-256", async () => {
    const a = await makeIdentity();
    expect(isValidPublicKey(a.publicKey)).toBe(true);
    expect(isValidPublicKey("AAAA")).toBe(false);
    expect(isValidPublicKey("no-es-base64url!")).toBe(false);
  });
});

describe("e2ee — código de recuperación y keystore", () => {
  it("genera códigos normalizables de 26 caracteres", async () => {
    const code = generateRecoveryCode();
    expect(code).toHaveLength(26);
    expect(normalizeRecoveryCode(code)).toBe(code);
    // Tolerante a separadores y confusiones al teclear.
    const grupos = `${code.slice(0, 6)} ${code.slice(6, 12)}-${code.slice(12)}`;
    expect(normalizeRecoveryCode(grupos.toLowerCase())).toBe(code);
    expect(
      normalizeRecoveryCode(code.replace(/0/g, "O").replace(/1/g, "I")),
    ).toBe(code);
    expect(normalizeRecoveryCode("demasiado corto")).toBeNull();
  });

  it("el id de recuperación es estable y distinto por código", async () => {
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(await recoveryIdFor(a)).toBe(await recoveryIdFor(a));
    expect(await recoveryIdFor(a)).not.toBe(await recoveryIdFor(b));
    expect(await recoveryIdFor(a)).toHaveLength(22);
    expect(await recoveryIdFor("inválido")).toBeNull();
  });

  it("cifra y descifra el keystore con el código (y solo con él)", async () => {
    const code = generateRecoveryCode();
    const identity = await makeIdentity();
    const keystore: KeystoreFile = {
      v: 1,
      entries: [
        {
          slot: "seek:conv_1",
          publicKey: identity.publicKey,
          privateKey: await exportPrivateKeyJwk(identity.privateKey),
          createdAt: new Date(0).toISOString(),
        },
      ],
    };
    const blob = await wrapKeystore(JSON.stringify(keystore), code);
    const recovered = await unwrapKeystore(blob, code);
    expect(parseKeystore(recovered ?? "")).toEqual(keystore);

    expect(await unwrapKeystore(blob, generateRecoveryCode())).toBeNull();
    const [prefix, iv, ct] = blob.split(".");
    expect(await unwrapKeystore(`${prefix}.${iv}.${ct}AA`, code)).toBeNull();
  });

  it("la clave privada exportada reimporta y sigue descifrando", async () => {
    const a = await makeIdentity();
    const b = await makeIdentity();
    const envelope = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_9",
      senderRole: "professional",
      plaintext: "reimportada",
    });
    const restored = {
      publicKey: b.publicKey,
      privateKey: await importPrivateKeyJwk(
        await exportPrivateKeyJwk(b.privateKey),
      ),
    };
    await expect(
      openEnvelope({
        identity: restored,
        conversationId: "conv_9",
        senderRole: "professional",
        content: envelope,
      }),
    ).resolves.toBe("reimportada");
  });
});
