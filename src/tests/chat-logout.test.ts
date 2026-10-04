import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: mocks.remove }),
}));

import { clearChatSessionCookies } from "@/app/actions-chat-session";
import {
  announceChatSessionEnd,
  onChatSessionEnd,
} from "@/lib/chat-session-end";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("salida de chat", () => {
  it("limpia las capacidades del navegador sin borrar sus claves/datos", async () => {
    await clearChatSessionCookies();
    expect(mocks.remove.mock.calls.map((call) => call[0])).toEqual([
      "nido_pro",
      "nido_pro_avisos",
      "nido_seeker",
    ]);
  });
  it("bloquea la pestaña actual y escucha otras pestañas con limpieza de listeners", () => {
    const windowFixture = new EventTarget();
    const stored = new Map<string, string>();
    vi.stubGlobal("window", windowFixture);
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    const callback = vi.fn();
    const stop = onChatSessionEnd(callback);
    announceChatSessionEnd();
    expect(callback).toHaveBeenCalledOnce();
    expect([...stored.keys()]).toEqual(["nido:chat-session-ended:v1"]);
    const event = new Event("storage");
    Object.defineProperty(event, "key", {
      value: "nido:chat-session-ended:v1",
    });
    windowFixture.dispatchEvent(event);
    expect(callback).toHaveBeenCalledTimes(2);
    stop();
    announceChatSessionEnd();
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
