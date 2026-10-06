import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const source = await readFile(
  new URL("../../public/nido-push-sw.js", import.meta.url),
  "utf8",
);
const listeners = new Map<string, (event: unknown) => void>();
const show = vi.fn(
  async (
    _title: string,
    _options: NotificationOptions & { renotify: boolean },
  ) => {},
);
const open = vi.fn(async () => {});
const match = vi.fn(async () => []);
beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://nido.example.invalid" },
      registration: { showNotification: show },
      clients: { openWindow: open, matchAll: match },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        listeners.set(name, handler),
    },
  });
});
describe("service worker: aviso visible y destinos fijos", () => {
  it("el destino de mensajes del paciente corresponde a una ruta real", async () => {
    let done: Promise<unknown> | undefined;
    listeners.get("push")?.({
      data: {
        json: () => ({
          v: 1,
          id: "fictitious_delivery_1234",
          kind: "chat",
          role: "patient",
        }),
      },
      waitUntil: (value: Promise<unknown>) => {
        done = value;
      },
    });
    await done;
    const path = show.mock.calls[0][1].data.destination;
    await expect(
      readFile(new URL(`../app${path}/page.tsx`, import.meta.url), "utf8"),
    ).resolves.toContain("requirePatientAccount");
  });
  it("un click resuelve el UUID opaco por el endpoint autenticado", async () => {
    let done: Promise<unknown> | undefined;
    const id = "00000000-0000-4000-8000-000000000001";
    listeners.get("notificationclick")?.({
      notification: {
        close: vi.fn(),
        data: { deliveryId: id, destination: "https://evil.invalid" },
      },
      waitUntil: (value: Promise<unknown>) => {
        done = value;
      },
    });
    await done;
    expect(open).toHaveBeenCalledWith(
      `https://nido.example.invalid/api/push/open?delivery=${id}`,
    );
  });
  it("muestra sólo texto genérico y deduplica con tag estable", async () => {
    let done: Promise<unknown> | undefined;
    const event = {
      data: {
        json: () => ({
          v: 1,
          id: "fictitious_delivery_1234",
          kind: "chat",
          role: "patient",
          text: "no mostrar",
        }),
      },
      waitUntil: (value: Promise<unknown>) => {
        done = value;
      },
    };
    listeners.get("push")?.(event);
    await done;
    listeners.get("push")?.(event);
    await done;
    expect(show).toHaveBeenCalledTimes(2);
    const options = show.mock.calls[0][1];
    expect(JSON.stringify(options)).not.toContain("no mostrar");
    expect(options.tag).toBe(show.mock.calls[1][1].tag);
    expect(options.renotify).toBe(false);
  });
  it("payload malformado conserva una notificación visible genérica", async () => {
    let done: Promise<unknown> | undefined;
    listeners.get("push")?.({
      data: {
        json: () => {
          throw new Error("bad");
        },
      },
      waitUntil: (value: Promise<unknown>) => {
        done = value;
      },
    });
    await done;
    expect(show).toHaveBeenCalledWith(
      "Nido",
      expect.objectContaining({
        data: { destination: "/entrar", deliveryId: null },
      }),
    );
  });
  it("click no puede abrir una URL enviada por terceros", async () => {
    let done: Promise<unknown> | undefined;
    const close = vi.fn();
    listeners.get("notificationclick")?.({
      notification: { close, data: { destination: "https://evil.invalid" } },
      waitUntil: (value: Promise<unknown>) => {
        done = value;
      },
    });
    await done;
    expect(close).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("https://nido.example.invalid/entrar");
  });
  it("no registra fetch ni almacena páginas privadas", () => {
    expect(listeners.has("fetch")).toBe(false);
    expect(source).not.toContain("caches.");
  });
});
