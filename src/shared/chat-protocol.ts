// Protocolo de chat (tipos compartidos por el Durable Object y el cliente).
// Unión discriminada versionada. PURO (sin deps de runtime) para test y reuso.
//
// Desde la v0.11.0 el campo `content` de un mensaje es un SOBRE E2EE opaco para
// el servidor (`src/shared/e2ee.ts`); el texto plano legado se sigue aceptando
// para los hilos antiguos hasta que el cliente los re-cifra con `reencrypt`.

import { isEnvelope, isValidPublicKey, MAX_ENVELOPE_LENGTH } from "./e2ee";

export const CHAT_PROTOCOL_VERSION = 1;
/** Tope del texto que escribe la persona en el compositor. */
export const MAX_MESSAGE_LENGTH = 4000;
/** Tope del `content` almacenado: un sobre E2EE (texto + ~40% de overhead). */
export const MAX_CONTENT_LENGTH = MAX_ENVELOPE_LENGTH;
/** Tope de un frame crudo (reencrypt manda lotes de sobres). */
export const MAX_FRAME_LENGTH = 96 * 1024;
/** Cuántos mensajes legados se re-cifran por lote. */
export const REENCRYPT_BATCH_MAX = 10;

export type SenderRole = "seeker" | "professional";

// Cliente -> servidor
export type ClientFrame =
  | { type: "send"; clientMsgId: string; content: string }
  | { type: "sync"; sinceSeq: number }
  | { type: "history-page"; beforeSeq: number }
  | { type: "key"; publicKey: string }
  | { type: "reencrypt"; items: { serverId: string; envelope: string }[] }
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
  | {
      type: "history";
      messages: ChatMessage[];
      hasMore: boolean;
      /** `initial` = al conectar; `page` = paginación hacia atrás; `sync` =
       *  delta de lo nuevo. El cliente los trata distinto (los dos primeros
       *  miran hasMore para "hay más antiguos"). */
      mode?: "initial" | "page" | "sync";
    }
  | {
      type: "keys";
      keys: { seeker?: string; professional?: string };
    }
  | { type: "reencrypted"; count: number }
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
  if (typeof raw !== "string" || raw.length > MAX_FRAME_LENGTH) {
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
        frame.content.length <= MAX_CONTENT_LENGTH
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
    case "history-page":
      if (
        Number.isInteger(frame.beforeSeq) &&
        (frame.beforeSeq as number) > 0
      ) {
        return { type: "history-page", beforeSeq: frame.beforeSeq as number };
      }
      return null;
    case "key":
      if (
        typeof frame.publicKey === "string" &&
        isValidPublicKey(frame.publicKey)
      ) {
        return { type: "key", publicKey: frame.publicKey };
      }
      return null;
    case "reencrypt": {
      if (
        !Array.isArray(frame.items) ||
        frame.items.length === 0 ||
        frame.items.length > REENCRYPT_BATCH_MAX
      ) {
        return null;
      }
      const items: { serverId: string; envelope: string }[] = [];
      for (const rawItem of frame.items) {
        if (!rawItem || typeof rawItem !== "object") return null;
        const item = rawItem as Record<string, unknown>;
        if (
          typeof item.serverId !== "string" ||
          item.serverId.length === 0 ||
          item.serverId.length > 64 ||
          typeof item.envelope !== "string" ||
          !isEnvelope(item.envelope)
        ) {
          return null;
        }
        items.push({ serverId: item.serverId, envelope: item.envelope });
      }
      return { type: "reencrypt", items };
    }
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
