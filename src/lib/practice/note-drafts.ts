import { setRetainedNoteKeys } from "./note-navigation";

// RAM del documento únicamente. Nunca escribir texto en storage/history/URLs.
export type NoteDraftScope = {
  accountId: string;
  professionalId: string;
  patientId: string;
  appointmentId: string | null;
  slot: string | null;
};
export type NoteDraft = {
  id: string;
  revision: number;
  content: string;
  saved: string;
};
export const NOTE_DRAFT_TTL_MS = 15 * 60 * 1000;
export const NOTE_DRAFT_MAX_ENTRIES = 12;
export const NOTE_DRAFT_MAX_CHARS = 96000;
type Entry = { draft: NoteDraft; expiresAt: number; chars: number };
type Notice = { type: "session" } | { type: "removed"; key: string };
const entries = new Map<string, Entry>();
const subscribers = new Set<(notice: Notice) => void>();
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let connected = false;

export function noteDraftKey(scope: NoteDraftScope) {
  return JSON.stringify([
    scope.accountId,
    scope.professionalId,
    scope.patientId,
    scope.appointmentId,
    scope.slot,
  ]);
}
function notify(notice: Notice) {
  for (const subscriber of subscribers) subscriber(notice);
}
function sync() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  setRetainedNoteKeys([...entries.keys()]);
  if (entries.size)
    timer = setTimeout(
      prune,
      Math.max(
        1,
        Math.min(...[...entries.values()].map((entry) => entry.expiresAt)) -
          Date.now(),
      ),
    );
}
function prune() {
  for (const [key, entry] of entries)
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      notify({ type: "removed", key });
    }
  sync();
}
function connect() {
  if (connected || typeof window === "undefined") return;
  connected = true;
  window.addEventListener("nido:session-changed", clearNoteDrafts);
  window.addEventListener("pagehide", clearNoteDrafts);
}
export function noteDraftGeneration() {
  connect();
  return generation;
}
export function subscribeNoteDrafts(subscriber: (notice: Notice) => void) {
  connect();
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
export function clearNoteDrafts() {
  entries.clear();
  generation++;
  sync();
  notify({ type: "session" });
}
export function forgetNoteDraft(scope: NoteDraftScope, expected?: NoteDraft) {
  const key = noteDraftKey(scope);
  const current = entries.get(key)?.draft;
  if (
    expected &&
    (!current ||
      current.id !== expected.id ||
      current.revision !== expected.revision ||
      current.content !== expected.content ||
      current.saved !== expected.saved)
  )
    return false;
  if (entries.delete(key)) {
    sync();
    notify({ type: "removed", key });
    return true;
  }
  return false;
}
export function noteDraftMetadata(scope: NoteDraftScope) {
  connect();
  prune();
  const entry = entries.get(noteDraftKey(scope));
  return entry ? { id: entry.draft.id, revision: entry.draft.revision } : null;
}
// El editor llama únicamente tras autorización server fresca del ámbito exacto.
// generation evita restaurar una respuesta anterior a logout/cambio de cuenta.
export function readNoteDraft(
  scope: NoteDraftScope,
  expectedGeneration: number,
): NoteDraft | null {
  prune();
  if (expectedGeneration !== generation) return null;
  const entry = entries.get(noteDraftKey(scope));
  return entry ? { ...entry.draft } : null;
}
export function rememberNoteDraft(
  scope: NoteDraftScope,
  draft: NoteDraft,
  expectedGeneration: number,
) {
  connect();
  prune();
  if (expectedGeneration !== generation) return false;
  if (
    (scope.slot !== null && scope.slot !== draft.id) ||
    (scope.slot === null && scope.appointmentId === null) ||
    [scope.accountId, scope.professionalId, scope.patientId, draft.id].some(
      (value) => !value || value.length > 100,
    ) ||
    (scope.slot !== null && (!scope.slot || scope.slot.length > 100)) ||
    (scope.appointmentId !== null &&
      (!scope.appointmentId || scope.appointmentId.length > 100)) ||
    !Number.isInteger(draft.revision) ||
    draft.revision < 0 ||
    draft.content.length > 12000 ||
    draft.saved.length > 12000
  )
    return false;
  if (draft.content === draft.saved) {
    forgetNoteDraft(scope);
    return true;
  }
  const key = noteDraftKey(scope);
  const prior = entries.get(key);
  if (
    prior &&
    prior.draft.id === draft.id &&
    prior.draft.revision === draft.revision &&
    prior.draft.content === draft.content &&
    prior.draft.saved === draft.saved
  )
    return true;
  const chars = draft.content.length + draft.saved.length;
  const used =
    [...entries.values()].reduce((sum, entry) => sum + entry.chars, 0) -
    (prior?.chars || 0);
  if (
    (!prior && entries.size >= NOTE_DRAFT_MAX_ENTRIES) ||
    used + chars > NOTE_DRAFT_MAX_CHARS
  ) {
    forgetNoteDraft(scope);
    return false;
  }
  entries.set(key, {
    draft: { ...draft },
    chars,
    expiresAt: Date.now() + NOTE_DRAFT_TTL_MS,
  });
  sync();
  return true;
}
