import { describe, expect, it } from "vitest";
import {
  applyProChatActivity,
  type ProChatSummary,
  proChatSocketTargets,
  proChatsFingerprint,
} from "@/lib/pro-chats";

const chat: ProChatSummary = {
  id: "fixture",
  need: null,
  urgency: null,
  seekerName: "Ficticio",
  lastActivityAt: 100,
  lastMessageRole: "seeker",
  status: "open",
  closedReason: null,
  unread: true,
};
describe("metadatos de bandeja", () => {
  it("no acepta actividad atrasada o inválida ni borra no leídos", () => {
    const rows = [chat];
    expect(
      applyProChatActivity(rows, {
        conversationId: chat.id,
        role: "professional",
        at: 10,
      }),
    ).toBe(rows);
    expect(
      applyProChatActivity(rows, {
        conversationId: chat.id,
        role: "professional",
        at: Number.NaN,
      }),
    ).toBe(rows);
    expect(
      applyProChatActivity(rows, {
        conversationId: chat.id,
        role: "professional",
        at: 101,
      })[0].unread,
    ).toBe(false);
  });
  it("refresca nombres/estado/motivo, además de horas", () => {
    expect(proChatsFingerprint([chat])).not.toBe(
      proChatsFingerprint([{ ...chat, seekerName: "Otro nombre ficticio" }]),
    );
    expect(proChatsFingerprint([chat])).not.toBe(
      proChatsFingerprint([{ ...chat, closedReason: "resolved" }]),
    );
  });
  it("limita canales activos sin sala abierta, históricos ni cap negativo", () => {
    expect(proChatSocketTargets([chat], "active", -1)).toEqual([]);
    expect(proChatSocketTargets([chat], chat.id)).toEqual([]);
    expect(
      proChatSocketTargets([{ ...chat, status: "closed" }], "active"),
    ).toEqual([]);
    expect(
      proChatSocketTargets(
        Array.from({ length: 10 }, (_, n) => ({ ...chat, id: String(n) })),
        "active",
        99,
      ),
    ).toHaveLength(5);
  });
});
