import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft-storage";

// localStorage stub (node env, sin DOM): un Map simple basta para el contrato.
function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", ls);
  return store;
}

describe("draft-storage", () => {
  beforeEach(() => {
    installLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("guarda y restaura dentro del TTL", () => {
    saveDraft("k", { a: "1" });
    expect(loadDraft<{ a: string }>("k", 1000)).toEqual({ a: "1" });
  });

  it("caduca pasado el TTL y limpia la clave", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    saveDraft("k", "hola");
    vi.setSystemTime(new Date("2026-07-01T02:00:00Z")); // +2h
    expect(loadDraft<string>("k", 60 * 60 * 1000)).toBeNull(); // TTL 1h
    expect(localStorage.getItem("k")).toBeNull(); // se limpió
  });

  it("trata el formato viejo (sin sello de tiempo) como caducado", () => {
    localStorage.setItem("k", JSON.stringify({ email: "a@b.com" })); // formato previo
    expect(loadDraft("k", 1000)).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("entrada ilegible -> null y se limpia", () => {
    localStorage.setItem("k", "no-json");
    expect(loadDraft("k", 1000)).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("clearDraft borra la clave", () => {
    saveDraft("k", "x");
    clearDraft("k");
    expect(localStorage.getItem("k")).toBeNull();
  });
});
