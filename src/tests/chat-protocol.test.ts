import { describe, expect, it } from "vitest";
import {
  type ClientFrame,
  MAX_CONTENT_LENGTH,
  MAX_MESSAGE_LENGTH,
  parseClientFrame,
  REENCRYPT_BATCH_MAX,
} from "@/shared/chat-protocol";
import {
  createEnvelope,
  generateIdentityKeyPair,
  toConversationIdentity,
} from "@/shared/e2ee";

function frame(obj: unknown) {
  return parseClientFrame(JSON.stringify(obj));
}

describe("parseClientFrame", () => {
  it("acepta un send válido", () => {
    const f = frame({ type: "send", clientMsgId: "c1", content: "hola" });
    expect(f).toEqual<ClientFrame>({
      type: "send",
      clientMsgId: "c1",
      content: "hola",
    });
  });

  it("rechaza send vacío o sin clientMsgId", () => {
    expect(frame({ type: "send", clientMsgId: "c1", content: "" })).toBeNull();
    expect(
      frame({ type: "send", clientMsgId: "c1", content: "   " }),
    ).toBeNull();
    expect(frame({ type: "send", content: "hola" })).toBeNull();
  });

  it("rechaza send que excede el tamaño máximo del content", () => {
    const big = "x".repeat(MAX_CONTENT_LENGTH + 1);
    expect(frame({ type: "send", clientMsgId: "c1", content: big })).toBeNull();
    // El tope del compositor (texto humano) es menor que el del sobre cifrado.
    expect(MAX_MESSAGE_LENGTH).toBeLessThan(MAX_CONTENT_LENGTH);
  });

  it("acepta un sobre E2EE como content", async () => {
    const a = await toConversationIdentity(await generateIdentityKeyPair());
    const b = await toConversationIdentity(await generateIdentityKeyPair());
    const { createEnvelope } = await import("@/shared/e2ee");
    const envelope = await createEnvelope({
      identity: a,
      peerPublicKey: b.publicKey,
      conversationId: "conv_test",
      senderRole: "seeker",
      plaintext: "hola cifrado",
    });
    const parsed = frame({
      type: "send",
      clientMsgId: "c1",
      content: envelope,
    });
    expect(parsed).toEqual<ClientFrame>({
      type: "send",
      clientMsgId: "c1",
      content: envelope,
    });
  });

  it("acepta sync/typing/read válidos", () => {
    expect(frame({ type: "sync", sinceSeq: 0 })).toEqual({
      type: "sync",
      sinceSeq: 0,
    });
    expect(frame({ type: "typing", isTyping: true })).toEqual({
      type: "typing",
      isTyping: true,
    });
    expect(frame({ type: "read", upToSeq: 5 })).toEqual({
      type: "read",
      upToSeq: 5,
    });
  });

  it("valida los frames E2EE (key, history-page, reencrypt)", async () => {
    const seeker = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    const pro = await toConversationIdentity(await generateIdentityKeyPair());

    expect(frame({ type: "key", publicKey: seeker.publicKey })).toEqual({
      type: "key",
      publicKey: seeker.publicKey,
    });
    expect(frame({ type: "key", publicKey: "no-es-una-clave" })).toBeNull();

    expect(frame({ type: "history-page", beforeSeq: 12 })).toEqual({
      type: "history-page",
      beforeSeq: 12,
    });
    expect(frame({ type: "history-page", beforeSeq: 0 })).toBeNull();
    expect(frame({ type: "history-page", beforeSeq: 1.5 })).toBeNull();

    const envelope = await createEnvelope({
      identity: seeker,
      peerPublicKey: pro.publicKey,
      conversationId: "conv_protocol",
      senderRole: "seeker",
      plaintext: "hola",
    });
    expect(
      frame({ type: "reencrypt", items: [{ serverId: "m_1", envelope }] }),
    ).toEqual({ type: "reencrypt", items: [{ serverId: "m_1", envelope }] });
    expect(frame({ type: "reencrypt", items: [] })).toBeNull();
    expect(
      frame({
        type: "reencrypt",
        items: [{ serverId: "m_1", envelope: "texto plano" }],
      }),
    ).toBeNull();
    expect(
      frame({
        type: "reencrypt",
        items: Array.from({ length: REENCRYPT_BATCH_MAX + 1 }, (_, i) => ({
          serverId: `m_${i}`,
          envelope,
        })),
      }),
    ).toBeNull();
  });

  it("rechaza tipos desconocidos y shapes inválidos", () => {
    expect(frame({ type: "evil" })).toBeNull();
    expect(frame({ type: "sync", sinceSeq: -1 })).toBeNull();
    expect(frame({ type: "read", upToSeq: 1.5 })).toBeNull();
    expect(frame({ type: "typing", isTyping: "yes" })).toBeNull();
  });

  it("rechaza entradas no-string y JSON inválido", () => {
    expect(parseClientFrame({ type: "send" })).toBeNull();
    expect(parseClientFrame("{not json")).toBeNull();
    expect(parseClientFrame("null")).toBeNull();
  });
});
