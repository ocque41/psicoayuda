import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  announceAccountSessionChange,
  bridgeChatSessionEnd,
} from "@/lib/chat-session-end";
import { createPatientSessionBoundary } from "@/lib/patient/session-boundary";
import {
  noteDraftGeneration,
  readNoteDraft,
  rememberNoteDraft,
} from "@/lib/practice/note-drafts";

const KEY = "nido:account-session-changed:v1";
const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
});
function surface() {
  const target = new EventTarget();
  vi.stubGlobal("window", target);
  return target;
}
function storage(target: EventTarget, value: unknown, key = KEY) {
  const event = new Event("storage");
  Object.assign(event, { key, newValue: value });
  target.dispatchEvent(event);
}

describe("cambio de sesión confirmado sin logout", () => {
  it("anuncia revalidación local y señal opaca sin borrar borradores ni emitir cierre", () => {
    const target = surface();
    const revalidate = vi.fn(),
      end = vi.fn();
    target.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, revalidate);
    target.addEventListener("nido:chat-session-ended", end);
    const scope = {
      accountId: "fictional-a",
      professionalId: "fictional-pro",
      patientId: "fictional-patient",
      appointmentId: "fictional-appointment",
      slot: "fictional-note",
    };
    const generation = noteDraftGeneration();
    const note = {
      id: "fictional-note",
      revision: 1,
      content: "Borrador ficticio sin guardar",
      saved: "",
    };
    expect(rememberNoteDraft(scope, note, generation)).toBe(true);
    const draft = '{"fixture":"bytes de borrador"}';
    const stored = new Map([["fixture-draft", draft]]);
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    announceAccountSessionChange();
    expect(revalidate).toHaveBeenCalledOnce();
    expect(readNoteDraft(scope, generation)).toBeNull();
    expect(readNoteDraft(scope, noteDraftGeneration())).toEqual(note);
    expect(end).not.toHaveBeenCalled();
    expect(stored.get(KEY)).toMatch(/^\d+:[a-z0-9]+$/);
    expect(stored.get("fixture-draft")).toBe(draft);
    expect([...stored.keys()]).toEqual(["fixture-draft", KEY]);
  });

  it("storage revalida una sola vez, ignora otros datos y limpia el puente compartido", () => {
    const target = surface();
    const changed = vi.fn();
    target.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, changed);
    const stopA = bridgeChatSessionEnd(),
      stopB = bridgeChatSessionEnd();
    stops.push(stopA, stopB);
    storage(target, "123:a");
    storage(target, "123:a");
    storage(target, null);
    storage(target, '{"userId":"fictitious"}');
    storage(target, "123:b", "unrelated");
    expect(changed).toHaveBeenCalledOnce();
    stopA();
    stopA();
    storage(target, "124:b");
    expect(changed).toHaveBeenCalledTimes(2);
    stopB();
    storage(target, "125:c");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("BroadcastChannel mantiene el aviso con storage bloqueado y cierra ambos canales", () => {
    const target = surface();
    const channels: FakeChannel[] = [];
    class FakeChannel {
      onmessage?: (event: { data: unknown }) => void;
      closed = false;
      constructor(readonly name: string) {
        channels.push(this);
      }
      postMessage(data: unknown) {
        for (const channel of channels)
          if (channel !== this && !channel.closed && channel.name === this.name)
            channel.onmessage?.({ data });
      }
      close() {
        this.closed = true;
      }
    }
    Object.assign(target, { BroadcastChannel: FakeChannel });
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const changed = vi.fn();
    target.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, changed);
    const stop = bridgeChatSessionEnd();
    stops.push(stop);
    announceAccountSessionChange();
    expect(changed).toHaveBeenCalledTimes(2); // local + otra pestaña simulada
    expect(channels.map((channel) => channel.closed)).toEqual([false, true]);
    stop();
    expect(channels.every((channel) => channel.closed)).toBe(true);
  });

  it("sin ambos transportes conserva el aviso local sin lanzar ni simular entrega remota", () => {
    const target = surface();
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const changed = vi.fn();
    target.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, changed);
    expect(() => announceAccountSessionChange()).not.toThrow();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("una señal recibida cancela el resultado antiguo; sólo el dueño distinto es terminal", async () => {
    const target = surface();
    const stopBridge = bridgeChatSessionEnd();
    stops.push(stopBridge);
    const valid = (userId: string) => ({
      userId,
      expiresAt: Date.now() + 60_000,
    });
    let release!: (value: ReturnType<typeof valid>) => void;
    const stale = new Promise<ReturnType<typeof valid>>((resolve) => {
      release = resolve;
    });
    const read = vi
      .fn()
      .mockResolvedValueOnce(valid("A"))
      .mockResolvedValueOnce(valid("A"))
      .mockReturnValueOnce(stale)
      .mockResolvedValueOnce(valid("B"));
    const changed = vi.fn();
    const guard = createPatientSessionBoundary("A", read, changed);
    const revalidate = () => void guard.check();
    target.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, revalidate);
    try {
      await guard.check();
      storage(target, "123:a");
      expect(changed).toHaveBeenLastCalledWith({ status: "checking" });
      await Promise.resolve();
      expect(changed).toHaveBeenLastCalledWith({ status: "authorized" });
      const pending = guard.check();
      storage(target, "124:b");
      expect(read.mock.calls[2][0].aborted).toBe(true);
      await Promise.resolve();
      expect(changed).toHaveBeenLastCalledWith({
        status: "revoked",
        accountPresent: true,
      });
      release(valid("A"));
      await pending;
      expect(changed).toHaveBeenLastCalledWith({
        status: "revoked",
        accountPresent: true,
      });
    } finally {
      target.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, revalidate);
      guard.dispose();
    }
  });
});
