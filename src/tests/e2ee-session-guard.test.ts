import { afterEach, describe, expect, it, vi } from "vitest";
import { completeChatSignOut } from "@/lib/chat-session-end";
import {
  createE2eeSessionGuard,
  listenE2eeSessionInvalidation,
} from "@/lib/e2ee-session-guard";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("invalidación de recuperación E2EE", () => {
  it.each([
    "nido:session-changed",
    "nido:account-session-changed",
    "nido:chat-session-ended",
    "storage",
  ])("retira el código abierto y rechaza respuestas pendientes tras %s", async (event) => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    let resolve!: (result: { ok: boolean }) => void;
    const check = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((r) => {
          resolve = r;
        }),
    );
    let code: string | null = "Código ficticio en memoria";
    const guard = createE2eeSessionGuard(check, () => {
      code = null;
    });
    const stop = listenE2eeSessionInvalidation(guard.invalidate);
    const ticket = guard.ticket();
    const pending = guard.authorize(ticket);
    const signal = new Event(event);
    if (event === "storage")
      Object.assign(signal, {
        key: "nido:chat-session-ended:v1",
        newValue: "señal ficticia",
      });
    target.dispatchEvent(signal);
    expect(code).toBeNull();
    resolve({ ok: true });
    expect(await pending).toBe(false);
    expect(guard.current(ticket)).toBe(false);
    expect(await guard.authorize()).toBe(false);
    expect(check).toHaveBeenCalledOnce();
    stop();
    guard.dispose();
  });
  it("cierra por caducidad aunque no llegue un evento; no concede un ticket nuevo", async () => {
    vi.useFakeTimers();
    const invalidated = vi.fn();
    const guard = createE2eeSessionGuard(
      async () => ({ ok: true, expiresAt: Date.now() + 1000 }),
      invalidated,
    );
    expect(await guard.authorize()).toBe(true);
    await vi.advanceTimersByTimeAsync(1001);
    expect(invalidated).toHaveBeenCalledOnce();
    expect(await guard.authorize()).toBe(false);
    guard.dispose();
  });
  it("actor distinto bloquea las siguientes comprobaciones", async () => {
    const invalidated = vi.fn();
    const guard = createE2eeSessionGuard(
      async () => ({ ok: false }),
      invalidated,
    );
    expect(await guard.authorize()).toBe(false);
    expect(invalidated).toHaveBeenCalledOnce();
    expect(await guard.authorize()).toBe(false);
    guard.dispose();
  });
  it("un logout rechazado no invalida; tras éxito sí", async () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    const invalidated = vi.fn();
    const stop = listenE2eeSessionInvalidation(invalidated);
    await expect(
      completeChatSignOut(
        async () => {},
        async () => ({ error: true }),
      ),
    ).rejects.toThrow();
    expect(invalidated).not.toHaveBeenCalled();
    await completeChatSignOut(
      async () => {},
      async () => ({}),
    );
    expect(invalidated).toHaveBeenCalledTimes(2);
    stop();
  });
});
