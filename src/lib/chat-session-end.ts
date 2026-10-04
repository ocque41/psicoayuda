const EVENT = "nido:chat-session-ended";
const SIGNAL = "nido:chat-session-ended:v1";
const ACCOUNT_SIGNAL = "nido:account-session-changed:v1";
export const SESSION_CHANGED_EVENT = "nido:session-changed";
export const ACCOUNT_SESSION_CHANGED_EVENT = "nido:account-session-changed";

/** Acceso confirmado: revalidar al dueño, sin anunciar logout ni borrar datos. */
export function announceAccountSessionChange() {
  window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED_EVENT));
  const signal = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(ACCOUNT_SIGNAL, signal);
  } catch {
    /* BroadcastChannel funciona también cuando storage está bloqueado. */
  }
  try {
    const channel = new window.BroadcastChannel(ACCOUNT_SIGNAL);
    channel.postMessage(signal);
    channel.close();
  } catch {
    /* Sin ambos transportes, las vistas revalidan al recuperar el foco. */
  }
}

/** Sólo después de que BetterAuth haya confirmado la salida. */
export function announceChatSessionEnd() {
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  try {
    // Únicamente una señal de invalidación; nunca contenido ni identificadores.
    localStorage.setItem(SIGNAL, `${Date.now()}:${Math.random()}`);
  } catch {
    /* La pestaña actual sigue protegida. */
  }
}

export async function completeChatSignOut(
  clearCapabilities: () => Promise<unknown>,
  signOut: () => Promise<{ error?: unknown }>,
) {
  await clearCapabilities();
  const result = await signOut();
  if (result.error) throw new Error("No se pudo cerrar la sesión.");
  announceChatSessionEnd();
}

export function onChatSessionEnd(callback: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === SIGNAL && event.newValue !== null) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", storage);
  };
}

// SiteNav se monta también en páginas de notas sin una sala de chat. Un único
// puente propaga la invalidación a sus listeners aunque haya más de una nav.
let bridges = 0;
let accountChannel: BroadcastChannel | undefined;
const received = new Set<string>();
function receiveAccountChange(signal: unknown) {
  if (
    typeof signal !== "string" ||
    !/^\d{1,16}:[a-z0-9]{1,24}$/.test(signal) ||
    received.has(signal)
  )
    return;
  received.add(signal);
  const oldest = received.values().next().value;
  if (received.size > 32 && oldest !== undefined) received.delete(oldest);
  window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED_EVENT));
}
const receiveSessionEnd = (event: StorageEvent) => {
  if (event.key === SIGNAL && event.newValue !== null)
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  if (event.key === ACCOUNT_SIGNAL) receiveAccountChange(event.newValue);
};
export function bridgeChatSessionEnd(): () => void {
  if (bridges++ === 0) {
    window.addEventListener("storage", receiveSessionEnd);
    try {
      accountChannel = new window.BroadcastChannel(ACCOUNT_SIGNAL);
      accountChannel.onmessage = (event) => receiveAccountChange(event.data);
    } catch {
      /* La señal de storage sigue disponible en navegadores sin canal. */
    }
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--bridges === 0) {
      window.removeEventListener("storage", receiveSessionEnd);
      accountChannel?.close();
      accountChannel = undefined;
      received.clear();
    }
  };
}
