import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  onChatSessionEnd,
  SESSION_CHANGED_EVENT,
} from "./chat-session-end";

export type E2eeActorCheck = () => Promise<{
  ok: boolean;
  expiresAt?: number;
}>;

/** Sólo invalida memoria/UI. Nunca borra IndexedDB, claves ni respaldos. */
export function createE2eeSessionGuard(
  checkActor: E2eeActorCheck,
  onInvalidated: () => void,
) {
  let revision = 0;
  let blocked = false;
  let expiresAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (blocked) return;
    blocked = true;
    revision += 1;
    clearTimeout(timer);
    onInvalidated();
  };
  const current = (ticket: number) => {
    if (expiresAt !== undefined && expiresAt <= Date.now()) invalidate();
    return !blocked && revision === ticket;
  };
  return {
    ticket: () => revision,
    current,
    invalidate,
    start() {
      revision += 1;
      blocked = false;
      expiresAt = undefined;
    },
    dispose() {
      blocked = true;
      revision += 1;
      clearTimeout(timer);
    },
    async authorize(ticket = revision) {
      if (!current(ticket)) return false;
      try {
        const result = await checkActor();
        if (!current(ticket)) return false;
        if (
          !result.ok ||
          (result.expiresAt !== undefined &&
            (!Number.isFinite(result.expiresAt) ||
              result.expiresAt <= Date.now()))
        ) {
          invalidate();
          return false;
        }
        // Un resultado concurrente no puede alargar una sesión ya observada.
        if (result.expiresAt !== undefined) {
          expiresAt = Math.min(expiresAt ?? Infinity, result.expiresAt);
          clearTimeout(timer);
          timer = setTimeout(
            invalidate,
            Math.min(expiresAt - Date.now(), 2_147_483_647),
          );
        }
        return current(ticket);
      } catch {
        if (current(ticket)) invalidate();
        return false;
      }
    },
  };
}

export function listenE2eeSessionInvalidation(invalidate: () => void) {
  const stop = onChatSessionEnd(invalidate);
  window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
  window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, invalidate);
  return () => {
    stop();
    window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
    window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, invalidate);
  };
}
