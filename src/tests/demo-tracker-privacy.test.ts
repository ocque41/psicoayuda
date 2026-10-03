import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClickTracker, trackConversion } from "@/components/click-tracker";
import { LastActionTracker } from "@/components/last-action-tracker";

const effects = vi.hoisted(() => ({ callbacks: [] as Array<() => unknown> }));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useEffect: (callback: () => unknown) => effects.callbacks.push(callback),
}));

describe("privacidad de los ejemplos editables de la demo", () => {
  const listeners = new Map<string, (event: Event) => void>();
  const cleanups: Array<() => void> = [];
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  const sendBeacon = vi.fn();

  function mountTrackers() {
    ClickTracker();
    LastActionTracker();
    for (const callback of effects.callbacks.splice(0)) {
      const cleanup = callback();
      if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("location", {
      pathname: "/demo/consulta",
      search: "?utm_source=ejemplo-ficticio",
      host: "nido.example.test",
    });
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("navigator", { sendBeacon });
    vi.stubGlobal("document", {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => listeners.delete(type),
    });
  });

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    listeners.clear();
    effects.callbacks.length = 0;
    vi.unstubAllGlobals();
  });

  it("no lee textos, guarda UTM o registra conversiones al interactuar con la demo", () => {
    const closest = vi.fn(() => {
      throw new Error("No debe leer el control de la demo");
    });
    const event = { target: { closest } } as unknown as Event;
    mountTrackers();
    expect(storage.getItem).not.toHaveBeenCalled();
    listeners.get("click")?.(event);
    listeners.get("pointerdown")?.(event);
    trackConversion("ejemplo", "Texto ficticio de un ejemplo");
    expect(closest).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith("nido:lastAction");
  });

  it("sigue excluyendo la demo al navegar desde el sitio y tolera storage bloqueado", () => {
    location.pathname = "/para-psicologos";
    mountTrackers();
    expect(storage.setItem).toHaveBeenCalledWith(
      "nido:utm",
      JSON.stringify({ source: "ejemplo-ficticio" }),
    );
    storage.setItem.mockClear();
    storage.removeItem.mockImplementationOnce(() => {
      throw new Error("Storage no disponible");
    });
    location.pathname = "/demo/consulta";
    const event = { target: {} } as Event;
    expect(() => listeners.get("pointerdown")?.(event)).not.toThrow();
    expect(() => listeners.get("click")?.(event)).not.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
