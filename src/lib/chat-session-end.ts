const EVENT = "nido:chat-session-ended";
const SIGNAL = "nido:chat-session-ended:v1";
export function announceChatSessionEnd() {
  window.dispatchEvent(new Event(EVENT));
  try {
    localStorage.setItem(SIGNAL, `${Date.now()}:${Math.random()}`);
  } catch {
    /* La pestaña actual sigue protegida. */
  }
}
export function onChatSessionEnd(callback: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === SIGNAL) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", storage);
  };
}
