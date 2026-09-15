// Payload del mensaje-tarjeta de lista de espera que el profesional envía en el
// chat. Viaja DENTRO del sobre E2EE como texto plano JSON (el servidor sigue sin
// poder leerlo), así que el DO no necesita conocer ningún tipo nuevo y el
// historial/paginación/borrado funcionan igual. PURO (sin runtime) para test.

export const WAITLIST_PROMPT_MARKER = "nido:waitlist-prompt";
export const WAITLIST_PROMPT_VERSION = 1;

export type WaitlistPromptPayload = {
  nido: typeof WAITLIST_PROMPT_MARKER;
  v: typeof WAITLIST_PROMPT_VERSION;
};

/** Texto plano (pre-cifrado) de la tarjeta que envía el profesional. */
export function buildWaitlistPromptPayload(): string {
  const payload: WaitlistPromptPayload = {
    nido: WAITLIST_PROMPT_MARKER,
    v: WAITLIST_PROMPT_VERSION,
  };
  return JSON.stringify(payload);
}

/**
 * ¿Este texto descifrado es una tarjeta de lista de espera? Cualquier fallo o
 * texto humano normal (aunque parezca JSON) devuelve false.
 */
export function isWaitlistPromptPayload(
  text: string | null | undefined,
): boolean {
  if (!text || text.length > 200 || !text.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(text) as Partial<WaitlistPromptPayload>;
    return (
      parsed?.nido === WAITLIST_PROMPT_MARKER &&
      parsed?.v === WAITLIST_PROMPT_VERSION
    );
  } catch {
    return false;
  }
}
