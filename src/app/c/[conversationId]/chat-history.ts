import type { ServerFrame } from "@/shared/chat-protocol";

type HistoryFrame = Extract<ServerFrame, { type: "history" }>;

/**
 * La foto inicial puede contener mensajes más recientes que una página de
 * sync. Continuar desde el cursor de esa página conserva todos los mensajes
 * intermedios; el máximo global solo sirve para el siguiente delta posterior.
 */
export function nextHistorySyncCursor(frame: HistoryFrame): number | null {
  if (frame.mode !== "sync" || !frame.hasMore) return null;
  const seq = frame.messages[frame.messages.length - 1]?.seq;
  return seq !== undefined && Number.isSafeInteger(seq) && seq > 0 ? seq : null;
}
