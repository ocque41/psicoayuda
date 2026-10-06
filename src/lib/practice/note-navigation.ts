// Registro efímero de guards/keys opacas, sin contenido clínico.
// Sólo se conecta mientras hay borradores; no intercepta el router ni history.
type Guard = (href: string, count: number) => void;
const guards = new Map<Guard, string | symbol>();
let retained = new Set<string>();
let unloadConnected = false;
let navigationConnected = false;
let approvedUnload = false;

function warn(event: BeforeUnloadEvent) {
  if (approvedUnload) {
    approvedUnload = false;
    return;
  }
  if (guards.size || retained.size) event.preventDefault();
}
function ask(event: Event, href: string) {
  const guard = guards.keys().next().value;
  if (!guard) return;
  event.preventDefault();
  event.stopPropagation();
  guard(href, new Set([...guards.values(), ...retained]).size);
}
function guardLink(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (
    !(anchor instanceof HTMLAnchorElement) ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  )
    return;
  const next = new URL(anchor.href, window.location.href);
  if (
    next.origin !== location.origin ||
    (next.pathname === location.pathname && next.search === location.search)
  )
    return;
  ask(event, next.href);
}
function guardFilter(event: SubmitEvent) {
  if (event.defaultPrevented) return;
  const form = event.target;
  if (
    !(form instanceof HTMLFormElement) ||
    !form.hasAttribute("data-note-navigation")
  )
    return;
  const next = new URL(form.action, window.location.href);
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form))
    if (typeof value === "string") params.append(name, value);
  next.search = params.toString();
  ask(event, next.href);
}

function syncListeners() {
  if (typeof window === "undefined") return;
  const needsUnload = !!(guards.size || retained.size);
  if (needsUnload !== unloadConnected) {
    unloadConnected = needsUnload;
    if (needsUnload) window.addEventListener("beforeunload", warn);
    else window.removeEventListener("beforeunload", warn);
  }
  const needsNavigation = !!guards.size;
  if (needsNavigation !== navigationConnected) {
    navigationConnected = needsNavigation;
    if (needsNavigation) {
      document.addEventListener("click", guardLink, true);
      document.addEventListener("submit", guardFilter, true);
    } else {
      document.removeEventListener("click", guardLink, true);
      document.removeEventListener("submit", guardFilter, true);
    }
  }
  if (!needsUnload) approvedUnload = false;
}
export function setRetainedNoteKeys(keys: string[]) {
  retained = new Set(keys);
  syncListeners();
}
export function registerNoteNavigation(
  guard: Guard,
  key: string | symbol = Symbol(),
) {
  guards.set(guard, key);
  syncListeners();
  return () => {
    guards.delete(guard);
    syncListeners();
  };
}

export function leaveWithUnsavedNotes(href: string) {
  // Una sola autorización para el siguiente beforeunload, consumida incluso si
  // otro formulario cancela la salida. No desactiva guards futuros.
  approvedUnload = true;
  try {
    window.location.assign(href);
  } catch (error) {
    approvedUnload = false;
    throw error;
  }
}
