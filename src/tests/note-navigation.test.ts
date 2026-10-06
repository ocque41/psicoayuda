import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Contrato de unload real sobre EventTarget. Los enlaces/diálogos y React se
// prueban por separado en el navegador, sin un DOM simulado en esta suite.
let browser: EventTarget & { location: { assign: ReturnType<typeof vi.fn> } };
let documentTarget: EventTarget;
let cleanup: (() => void)[];
const unload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  browser.dispatchEvent(event);
  return event;
};
beforeEach(() => {
  vi.resetModules();
  cleanup = [];
  browser = Object.assign(new EventTarget(), { location: { assign: vi.fn() } });
  documentTarget = new EventTarget();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", documentTarget);
});
afterEach(() => {
  for (const release of cleanup) release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("guards de notas comparten una decisión efímera de salida", () => {
  it("registra un solo listener para varios borradores y conserva el guard hasta guardar el último", async () => {
    const { registerNoteNavigation } = await import(
      "@/lib/practice/note-navigation"
    );
    const added = vi.spyOn(browser, "addEventListener");
    const removed = vi.spyOn(browser, "removeEventListener");
    cleanup.push(
      registerNoteNavigation(vi.fn()),
      registerNoteNavigation(vi.fn()),
    );
    expect(added).toHaveBeenCalledTimes(1);
    expect(unload().defaultPrevented).toBe(true);
    cleanup[0]();
    expect(unload().defaultPrevented).toBe(true);
    expect(removed).not.toHaveBeenCalled();
    cleanup[1]();
    expect(unload().defaultPrevented).toBe(false);
    expect(removed).toHaveBeenCalledTimes(1);
    cleanup = [];
  });
  it("confirmar descarta todos los borradores en un solo unload y no desactiva las salidas siguientes", async () => {
    const { registerNoteNavigation, leaveWithUnsavedNotes } = await import(
      "@/lib/practice/note-navigation"
    );
    cleanup.push(
      registerNoteNavigation(vi.fn()),
      registerNoteNavigation(vi.fn()),
    );
    const decisions: boolean[] = [];
    browser.location.assign.mockImplementation(() =>
      decisions.push(unload().defaultPrevented),
    );
    leaveWithUnsavedNotes("https://nido.example.test/otra-ficha");
    expect(decisions).toEqual([false]);
    expect(unload().defaultPrevented).toBe(true);
  });
  it("cancelar desde otro formulario no consume permanentemente la protección de notas", async () => {
    const { registerNoteNavigation, leaveWithUnsavedNotes } = await import(
      "@/lib/practice/note-navigation"
    );
    cleanup.push(
      registerNoteNavigation(vi.fn()),
      registerNoteNavigation(vi.fn()),
    );
    const otherForm = (event: Event) => event.preventDefault();
    browser.addEventListener("beforeunload", otherForm);
    let cancelled = false;
    browser.location.assign.mockImplementation(() => {
      cancelled = unload().defaultPrevented;
    });
    leaveWithUnsavedNotes("https://nido.example.test/otra-ficha");
    expect(cancelled).toBe(true);
    browser.removeEventListener("beforeunload", otherForm);
    expect(unload().defaultPrevented).toBe(true);
  });
  it("un fallo al navegar conserva el guard", async () => {
    const { registerNoteNavigation, leaveWithUnsavedNotes } = await import(
      "@/lib/practice/note-navigation"
    );
    cleanup.push(registerNoteNavigation(vi.fn()));
    browser.location.assign.mockImplementation(() => {
      throw new Error("Fallo ficticio de navegación");
    });
    expect(() =>
      leaveWithUnsavedNotes("https://nido.example.test/otra-ficha"),
    ).toThrow("Fallo ficticio");
    expect(unload().defaultPrevented).toBe(true);
  });
  it("desmontar los guards borra una autorización pendiente antes de registrar otro editor", async () => {
    const { registerNoteNavigation, leaveWithUnsavedNotes } = await import(
      "@/lib/practice/note-navigation"
    );
    cleanup.push(registerNoteNavigation(vi.fn()));
    leaveWithUnsavedNotes("https://nido.example.test/otra-ficha");
    cleanup[0]();
    cleanup = [registerNoteNavigation(vi.fn())];
    expect(unload().defaultPrevented).toBe(true);
  });
});
