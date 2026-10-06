const EVENT = "nido:chat-session-ended";
const SIGNAL = "nido:chat-session-ended:v1";
export const SESSION_CHANGED_EVENT = "nido:session-changed";

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
const receiveSessionEnd = (event: StorageEvent) => {
  if (event.key === SIGNAL && event.newValue !== null)
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
};
export function bridgeChatSessionEnd(): () => void {
  if (bridges++ === 0) window.addEventListener("storage", receiveSessionEnd);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--bridges === 0)
      window.removeEventListener("storage", receiveSessionEnd);
  };
}
