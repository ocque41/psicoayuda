import type { SenderRole } from "@/shared/chat-protocol";
import {
  type ConversationIdentity,
  createEnvelope,
  openEnvelope,
} from "@/shared/e2ee";

const TTL = 24 * 60 * 60 * 1000;
export type ChatDraftContext = {
  ownerId: string;
  conversationId: string;
  role: SenderRole;
};
const revisions = new Map<string, number>();
export function chatDraftKey(context: ChatDraftContext) {
  return `nido:encrypted-chat-draft:${JSON.stringify([context.ownerId, context.role, context.conversationId])}`;
}
export async function loadChatDraft(
  context: ChatDraftContext,
  identity: ConversationIdentity,
): Promise<string | null> {
  const key = chatDraftKey(context);
  try {
    // El legado no identifica cuenta/rol. Conservar sus bytes sin leer, importar,
    // mostrar ni eliminar: su recuperación requiere una decisión independiente.
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (
      !Number.isFinite(stored.at) ||
      stored.at > Date.now() ||
      Date.now() - stored.at > TTL ||
      typeof stored.content !== "string"
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return await openEnvelope({
      identity,
      conversationId: key,
      senderRole: context.role,
      content: stored.content,
    });
  } catch {
    return null;
  }
}
/** Una revisión evita que un cifrado antiguo terminado tarde reemplace un borrador más reciente. */
export async function saveChatDraft(
  context: ChatDraftContext,
  identity: ConversationIdentity,
  text: string,
  current: () => boolean = () => true,
) {
  const key = chatDraftKey(context);
  const revision = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, revision);
  try {
    if (!text) {
      localStorage.removeItem(key);
      return;
    }
    const content = await createEnvelope({
      identity,
      peerPublicKey: identity.publicKey,
      conversationId: key,
      senderRole: context.role,
      plaintext: text,
    });
    if (revisions.get(key) === revision && current())
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), content }));
  } catch {
    /* Sin almacenamiento, el compositor conserva el borrador en memoria. */
  }
}
