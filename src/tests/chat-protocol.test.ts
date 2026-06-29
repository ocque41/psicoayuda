import { describe, expect, it } from "vitest";
import {
  type ClientFrame,
  MAX_MESSAGE_LENGTH,
  parseClientFrame,
} from "@/shared/chat-protocol";

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

  it("rechaza send que excede el tamaño máximo", () => {
    const big = "x".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(frame({ type: "send", clientMsgId: "c1", content: big })).toBeNull();
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
