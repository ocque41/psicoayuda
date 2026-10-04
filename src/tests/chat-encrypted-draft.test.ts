import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatDraftContext,
  chatDraftKey,
  loadChatDraft,
  saveChatDraft,
} from "@/lib/chat-draft-storage";
import { completeChatSignOut, onChatSessionEnd } from "@/lib/chat-session-end";
import { generateIdentityKeyPair, toConversationIdentity } from "@/shared/e2ee";

const data = new Map<string, string>();
const context: ChatDraftContext = {
  ownerId: "fictional-pro-a",
  role: "professional",
  conversationId: "fictional-chat",
};
beforeEach(() => {
  data.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("borradores cifrados", () => {
  it("persiste ciphertext y sólo recupera con la identidad y contexto propios", async () => {
    const identity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    const other = await toConversationIdentity(await generateIdentityKeyPair());
    await saveChatDraft(context, identity, "Mensaje ficticio aún sin enviar");
    expect(data.get(chatDraftKey(context))).not.toContain("Mensaje ficticio");
    expect(await loadChatDraft(context, identity)).toBe(
      "Mensaje ficticio aún sin enviar",
    );
    expect(await loadChatDraft(context, other)).toBeNull();
    expect(
      await loadChatDraft({ ...context, ownerId: "fictional-pro-b" }, identity),
    ).toBeNull();
    expect(
      await loadChatDraft({ ...context, role: "seeker" }, identity),
    ).toBeNull();
    data.set(
      chatDraftKey({ ...context, ownerId: "fictional-pro-b" }),
      data.get(chatDraftKey(context)) ?? "",
    );
    expect(
      await loadChatDraft({ ...context, ownerId: "fictional-pro-b" }, identity),
    ).toBeNull();
  });
  it("caduca sólo el borrador cifrado y rechaza fechas futuras", async () => {
    const identity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    await saveChatDraft(context, identity, "Ficticio");
    const raw = JSON.parse(data.get(chatDraftKey(context)) ?? "");
    data.set(
      chatDraftKey(context),
      JSON.stringify({ ...raw, at: Date.now() - 86400001 }),
    );
    expect(await loadChatDraft(context, identity)).toBeNull();
    data.set(
      chatDraftKey(context),
      JSON.stringify({ ...raw, at: Date.now() + 10000 }),
    );
    expect(await loadChatDraft(context, identity)).toBeNull();
  });
  it("un cifrado tardío no resucita un borrador vaciado o cancelado", async () => {
    const identity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    const pending = saveChatDraft(context, identity, "Mensaje antiguo");
    await saveChatDraft(context, identity, "");
    await pending;
    expect(data.has(chatDraftKey(context))).toBe(false);
    await saveChatDraft(context, identity, "Mensaje cancelado", () => false);
    expect(data.has(chatDraftKey(context))).toBe(false);
  });
});

it("conserva bytes legados al abrir, cambiar cuenta/rol y salir; jamás los lee ni los muestra automáticamente", async () => {
  const legacyKey = `nido:chat-draft:${context.conversationId}`;
  const legacy =
    '{ "t": 1, "v": "Borrador ficticio legado\\nSin propietario verificado" }';
  data.set(legacyKey, legacy);
  const getItem = vi.fn((key: string) => data.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => data.set(key, value));
  const removeItem = vi.fn((key: string) => data.delete(key));
  vi.stubGlobal("localStorage", { getItem, setItem, removeItem });
  vi.stubGlobal("window", new EventTarget());
  const identityA = await toConversationIdentity(
    await generateIdentityKeyPair(),
  );
  const identityB = await toConversationIdentity(
    await generateIdentityKeyPair(),
  );
  // Éste es el valor que loadChatDraft suministra al compositor: no adopta legado.
  expect(await loadChatDraft(context, identityA)).toBeNull();
  expect(data.get(legacyKey)).toBe(legacy);
  await saveChatDraft(context, identityA, "Nuevo borrador ficticio de A");
  const contextB = { ...context, ownerId: "fictional-pro-b" };
  expect(await loadChatDraft(contextB, identityB)).toBeNull();
  expect(
    await loadChatDraft({ ...context, role: "seeker" }, identityB),
  ).toBeNull();
  await saveChatDraft(contextB, identityB, "");
  const closed = vi.fn();
  const stop = onChatSessionEnd(closed);
  await completeChatSignOut(
    async () => undefined,
    async () => ({ error: null }),
  );
  expect(closed).toHaveBeenCalledOnce();
  stop();
  expect(data.get(legacyKey)).toBe(legacy);
  expect(await loadChatDraft(contextB, identityB)).toBeNull();
  expect(await loadChatDraft(context, identityA)).toBe(
    "Nuevo borrador ficticio de A",
  );
  expect(getItem.mock.calls.map((call) => call[0])).not.toContain(legacyKey);
  expect(removeItem.mock.calls.map((call) => call[0])).not.toContain(legacyKey);
  expect(setItem.mock.calls.map((call) => call[0])).not.toContain(legacyKey);
});
