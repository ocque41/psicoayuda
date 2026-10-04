import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as drafts from "@/lib/practice/note-drafts";

const scope: drafts.NoteDraftScope = {
  accountId: "fixture-account",
  professionalId: "fixture-pro",
  patientId: "fixture-patient",
  appointmentId: "fixture-appointment",
  slot: "fixture-note",
};
const note = {
  id: "fixture-note",
  revision: 4,
  content: "Borrador ficticio",
  saved: "Guardado ficticio",
};
const remember = (input = scope, value = note) =>
  drafts.rememberNoteDraft(
    input,
    { ...value, id: input.slot === null ? value.id : input.slot },
    drafts.noteDraftGeneration(),
  );
const read = (input = scope) =>
  drafts.readNoteDraft(input, drafts.noteDraftGeneration());
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  drafts.clearNoteDrafts();
});
afterEach(() => {
  drafts.clearNoteDrafts();
  vi.useRealTimers();
});
describe("borradores sólo en memoria del documento", () => {
  it("recupera el ID estable de una nota nueva sin exponer texto en su metadata", () => {
    const freshScope = { ...scope, slot: null };
    const fresh = {
      id: "fixture-stable-new-id",
      revision: 0,
      content: "Nueva nota ficticia",
      saved: "",
    };
    expect(remember(freshScope, fresh)).toBe(true);
    expect(drafts.noteDraftMetadata(freshScope)).toEqual({
      id: fresh.id,
      revision: 0,
    });
    expect(read(freshScope)).toEqual(fresh);
    const literalNew = { ...scope, slot: "new" };
    expect(remember(literalNew, { ...note, id: "new" })).toBe(true);
    expect(read(literalNew)?.id).toBe("new");
    expect(read(freshScope)).toEqual(fresh);
  });
  it("acota cuenta/profesional/ficha/nota/sesión y no promueve revisión", () => {
    expect(remember()).toBe(true);
    expect(read()).toEqual(note);
    for (const patch of [
      { accountId: "other" },
      { professionalId: "other" },
      { patientId: "other" },
      { appointmentId: "other" },
      { appointmentId: null },
      { slot: "other" },
    ])
      expect(read({ ...scope, ...patch })).toBeNull();
    const copy = read();
    if (copy) copy.content = "Cambio externo ficticio";
    expect(read()).toEqual(note);
  });
  it("expira a los15 minutos y leer no alarga el TTL", () => {
    remember();
    vi.advanceTimersByTime(drafts.NOTE_DRAFT_TTL_MS - 1);
    expect(read()).toEqual(note);
    vi.advanceTimersByTime(1);
    expect(read()).toBeNull();
  });
  it("remontar un draft idéntico no renueva el TTL; editar sí", () => {
    remember();
    vi.advanceTimersByTime(1000);
    remember();
    vi.advanceTimersByTime(drafts.NOTE_DRAFT_TTL_MS - 1000);
    expect(read()).toBeNull();
    remember();
    vi.advanceTimersByTime(1000);
    remember(scope, { ...note, content: "Segundo borrador ficticio" });
    vi.advanceTimersByTime(drafts.NOTE_DRAFT_TTL_MS - 1000);
    expect(read()?.content).toBe("Segundo borrador ficticio");
    vi.advanceTimersByTime(1000);
    expect(read()).toBeNull();
  });
  it("rechaza exceder entradas sin expulsar otro borrador", () => {
    for (let index = 0; index < drafts.NOTE_DRAFT_MAX_ENTRIES; index++)
      expect(remember({ ...scope, slot: `fixture-note-${index}` })).toBe(true);
    expect(remember({ ...scope, slot: "overflow" })).toBe(false);
    expect(read({ ...scope, slot: "fixture-note-0" })).toEqual({
      ...note,
      id: "fixture-note-0",
    });
  });
  it("acota caracteres y retira una copia obsoleta si no cabe la edición nueva", () => {
    const big = {
      ...note,
      content: "A".repeat(12000),
      saved: "B".repeat(12000),
    };
    for (let index = 0; index < 4; index++)
      expect(remember({ ...scope, slot: `big-${index}` }, big)).toBe(true);
    expect(remember()).toBe(false);
    drafts.forgetNoteDraft({ ...scope, slot: "big-0" });
    remember(scope, { ...note, content: "A", saved: "" });
    expect(
      remember(
        { ...scope, slot: "small" },
        { ...note, content: "A".repeat(11999), saved: "B".repeat(11999) },
      ),
    ).toBe(true);
    expect(remember(scope, big)).toBe(false);
    expect(read()).toBeNull();
    expect(read({ ...scope, slot: "small" })).not.toBeNull();
  });
  it("guardar o borrar un ámbito mantiene los otros", () => {
    remember();
    remember({ ...scope, slot: "other" });
    remember(scope, { ...note, content: note.saved });
    expect(read()).toBeNull();
    expect(read({ ...scope, slot: "other" })).toEqual({ ...note, id: "other" });
  });
  it("limpiar la cuenta invalida lecturas/escrituras de respuestas anteriores", () => {
    remember();
    const epoch = drafts.noteDraftGeneration();
    drafts.clearNoteDrafts();
    expect(drafts.readNoteDraft(scope, epoch)).toBeNull();
    expect(drafts.rememberNoteDraft(scope, note, epoch)).toBe(false);
  });
  it("rechaza ámbitos o tamaños inválidos", () => {
    expect(
      drafts.rememberNoteDraft(
        scope,
        { ...note, id: "another-note" },
        drafts.noteDraftGeneration(),
      ),
    ).toBe(false);
    expect(remember({ ...scope, accountId: "" })).toBe(false);
    expect(remember({ ...scope, slot: "X".repeat(101) })).toBe(false);
    expect(remember(scope, { ...note, content: "X".repeat(12001) })).toBe(
      false,
    );
    expect(remember(scope, { ...note, revision: -1 })).toBe(false);
  });
});
