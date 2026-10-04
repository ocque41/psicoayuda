// Registro efímero de guards, sin contenido ni identidad de pacientes/sesiones.
// Sólo se conecta mientras hay borradores; no intercepta el router ni history.
type Guard = (href: string, count: number) => void;
const guards = new Set<Guard>();
let approvedUnload = false;

function warn(event: BeforeUnloadEvent) {
  if (approvedUnload) {
    approvedUnload = false;
    return;
  }
  if (guards.size) event.preventDefault();
}
function ask(event: Event, href: string) {
  const guard = guards.values().next().value;
  if (!guard) return;
  event.preventDefault();
  event.stopPropagation();
  guard(href, guards.size);
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

export function registerNoteNavigation(guard: Guard) {
  if (!guards.size) {
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    document.addEventListener("submit", guardFilter, true);
  }
  guards.add(guard);
  return () => {
    guards.delete(guard);
    if (!guards.size) {
      approvedUnload = false;
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
      document.removeEventListener("submit", guardFilter, true);
    }
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
