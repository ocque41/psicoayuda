import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: mocks.remove }),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: async () => null }));

import { clearChatSessionCookies } from "@/app/actions-chat-session";
import {
  announceChatSessionEnd,
  bridgeChatSessionEnd,
  completeChatSignOut,
  onChatSessionEnd,
  SESSION_CHANGED_EVENT,
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
    Object.defineProperty(event, "newValue", { value: "fictional-signal" });
    windowFixture.dispatchEvent(event);
    expect(callback).toHaveBeenCalledTimes(2);
    stop();
    announceChatSessionEnd();
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

it("no anuncia cierre ni session-changed si BetterAuth devuelve error o lanza", async () => {
  const surface = new EventTarget();
  vi.stubGlobal("window", surface);
  const events = vi.fn();
  surface.addEventListener(SESSION_CHANGED_EVENT, events);
  surface.addEventListener("nido:chat-session-ended", events);
  const storage = vi.fn();
  vi.stubGlobal("localStorage", { setItem: storage });
  const clear = vi.fn(async () => undefined);
  await expect(
    completeChatSignOut(clear, async () => ({
      error: { message: "fictional failure" },
    })),
  ).rejects.toThrow();
  await expect(
    completeChatSignOut(clear, async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow();
  expect(events).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
  const signOut = vi.fn(async () => ({ error: null }));
  await completeChatSignOut(clear, signOut);
  expect(clear.mock.invocationCallOrder[2]).toBeLessThan(
    signOut.mock.invocationCallOrder[0],
  );
  expect(events).toHaveBeenCalledTimes(2);
  expect(storage).toHaveBeenCalledOnce();
});

it("SiteNav propaga session-changed a notas en otra pestaña una sola vez y limpia el puente", () => {
  const surface = new EventTarget();
  vi.stubGlobal("window", surface);
  const invalidate = vi.fn();
  surface.addEventListener(SESSION_CHANGED_EVENT, invalidate);
  const stopA = bridgeChatSessionEnd(),
    stopB = bridgeChatSessionEnd();
  const signal = new Event("storage");
  Object.defineProperties(signal, {
    key: { value: "nido:chat-session-ended:v1" },
    newValue: { value: "fictional-signal" },
  });
  surface.dispatchEvent(signal);
  expect(invalidate).toHaveBeenCalledOnce();
  stopA();
  stopA();
  surface.dispatchEvent(signal);
  expect(invalidate).toHaveBeenCalledTimes(2);
  stopB();
  surface.dispatchEvent(signal);
  expect(invalidate).toHaveBeenCalledTimes(2);
});
