// Protocolo de chat (tipos compartidos por el Durable Object y el cliente).
// Unión discriminada versionada. PURO (sin deps de runtime) para test y reuso.

export const CHAT_PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_LENGTH = 4000;

export type SenderRole = "seeker" | "professional";

// Cliente -> servidor
export type ClientFrame =
  | { type: "send"; clientMsgId: string; content: string }
  | { type: "sync"; sinceSeq: number }
  | { type: "typing"; isTyping: boolean }
  | { type: "read"; upToSeq: number };

export type ChatMessage = {
  serverId: string;
  seq: number;
  serverTs: number;
  senderRole: SenderRole;
  content: string;
};

// Servidor -> cliente
export type ServerFrame =
  | {
      type: "ack";
      clientMsgId: string;
      serverId: string;
      seq: number;
      serverTs: number;
    }
  | { type: "msg"; message: ChatMessage }
  | { type: "history"; messages: ChatMessage[]; hasMore: boolean }
  | { type: "read"; upToSeq: number }
  | { type: "typing"; from: SenderRole; isTyping: boolean }
  | { type: "presence"; role: SenderRole; online: boolean }
  | { type: "error"; code: string; message?: string };

/**
 * Valida y normaliza un frame entrante del cliente. El DO NO confía en el
 * cliente (sobre todo el seeker, no autenticado): cualquier shape inválido o
 * payload demasiado grande se rechaza. Devuelve null si no es válido.
 */
export function parseClientFrame(raw: unknown): ClientFrame | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_LENGTH + 512) {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const frame = data as Record<string, unknown>;

  switch (frame.type) {
    case "send":
      if (
        typeof frame.clientMsgId === "string" &&
        frame.clientMsgId.length > 0 &&
        frame.clientMsgId.length <= 64 &&
        typeof frame.content === "string" &&
        frame.content.trim().length > 0 &&
        frame.content.length <= MAX_MESSAGE_LENGTH
      ) {
        return {
          type: "send",
          clientMsgId: frame.clientMsgId,
          content: frame.content,
        };
      }
      return null;
    case "sync":
      if (Number.isInteger(frame.sinceSeq) && (frame.sinceSeq as number) >= 0) {
        return { type: "sync", sinceSeq: frame.sinceSeq as number };
      }
      return null;
    case "typing":
      if (typeof frame.isTyping === "boolean") {
        return { type: "typing", isTyping: frame.isTyping };
      }
      return null;
    case "read":
      if (Number.isInteger(frame.upToSeq) && (frame.upToSeq as number) >= 0) {
        return { type: "read", upToSeq: frame.upToSeq as number };
      }
      return null;
    default:
      return null;
  }
}

export function serialize(frame: ServerFrame): string {
  return JSON.stringify(frame);
}
