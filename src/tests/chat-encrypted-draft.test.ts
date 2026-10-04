import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatDraftContext,
  chatDraftKey,
  loadChatDraft,
  saveChatDraft,
} from "@/lib/chat-draft-storage";
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
  it("elimina texto legado sin atribuirlo al usuario actual; caduca y rechaza fechas futuras", async () => {
    const identity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    data.set(`nido:chat-draft:${context.conversationId}`, "legacy plaintext");
    await saveChatDraft(context, identity, "Ficticio");
    const raw = JSON.parse(data.get(chatDraftKey(context)) ?? "");
    data.set(
      chatDraftKey(context),
      JSON.stringify({ ...raw, at: Date.now() - 86400001 }),
    );
    expect(await loadChatDraft(context, identity)).toBeNull();
    expect(data.has(`nido:chat-draft:${context.conversationId}`)).toBe(false);
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
