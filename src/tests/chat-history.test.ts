import { describe, expect, it } from "vitest";
import { nextHistorySyncCursor } from "@/app/c/[conversationId]/chat-history";
import type { ChatMessage, ServerFrame } from "@/shared/chat-protocol";

type HistoryFrame = Extract<ServerFrame, { type: "history" }>;

function messages(first: number, last: number): ChatMessage[] {
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    seq: first + index,
    serverId: `fixture-${first + index}`,
    serverTs: 1,
    senderRole: "seeker",
    content: "Contenido ficticio para comprobar paginación.",
  }));
}

describe("continuidad del historial de chat", () => {
  it("recupera el tramo entre la foto reciente y una página de sync limitada", () => {
    const server = messages(1, 250);
    // El servidor entrega la foto de los últimos30 antes de contestar el
    // sync solicitado con0. El máximo cargado ya es250 al llegar1–200.
    const loaded = new Map(
      server.slice(-30).map((message) => [message.seq, message]),
    );
    expect(Math.max(...loaded.keys())).toBe(250);
    let cursor: number | null = 0;
    const requests: number[] = [];
    while (cursor !== null) {
      const requestedAfter = cursor;
      requests.push(requestedAfter);
      expect(requests.length).toBeLessThanOrEqual(2);
      const remaining = server.filter(
        (message) => message.seq > requestedAfter,
      );
      const frame: HistoryFrame = {
        type: "history",
        mode: "sync",
        messages: remaining.slice(0, 200),
        hasMore: remaining.length > 200,
      };
      for (const message of frame.messages) loaded.set(message.seq, message);
      cursor = nextHistorySyncCursor(frame);
    }
    expect(requests).toEqual([0, 200]);
    expect([...loaded.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 250 }, (_, index) => index + 1),
    );
  });

  it("no convierte paginación antigua en sync ni repite una página final o vacía", () => {
    const frame: HistoryFrame = {
      type: "history",
      mode: "sync",
      messages: messages(201, 250),
      hasMore: false,
    };
    expect(nextHistorySyncCursor(frame)).toBeNull();
    expect(
      nextHistorySyncCursor({ ...frame, messages: [], hasMore: true }),
    ).toBeNull();
    expect(
      nextHistorySyncCursor({ ...frame, mode: "initial", hasMore: true }),
    ).toBeNull();
    expect(
      nextHistorySyncCursor({ ...frame, mode: "page", hasMore: true }),
    ).toBeNull();
  });
});
