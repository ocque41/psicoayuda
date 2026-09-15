/**
 * Regla de cuándo pedir el código de recuperación dentro de una sala. Vive
 * fuera del componente para poder probarla: dentro del chat es fácil romperla
 * sin darse cuenta, y de ella depende que alguien pueda leer sus mensajes.
 *
 * Principio:
 * - Sin la clave en ESTE dispositivo no se puede leer NI escribir: el código de
 *   recuperación (o crear una clave nueva, perdiendo el historial) es
 *   obligatorio. Esto vale también para el profesional: si su navegador es un
 *   desconocido para esa conversación, se le pide el código igual.
 * - Nada de avisos que prometan lectura: quien no tiene la clave no ve el
 *   contenido.
 * - Si el dispositivo SÍ tiene la clave, no se interrumpe a nadie.
 * - Única excepción: la vista "como la persona" del profesional, donde la clave
 *   real es de la persona y no se le puede pedir su código; ahí se crea una
 *   clave nueva en silencio para poder escribir como ella.
 */

export type E2eeGateRole = "seeker" | "professional";

export type E2eeGateInput = {
  /** Rol de la vista actual (con la que se lee y escribe). */
  role: E2eeGateRole;
  /** Profesional autenticado: su vista o la vista "como la persona". */
  proVisitor: boolean;
  /** Este dispositivo ya tiene una clave para este slot. */
  hasLocalIdentity: boolean;
  /** Clave pública de la cuenta del profesional (null si no hay ninguna). */
  accountPublicKey: string | null;
  /** Clave pública de la identidad local (null si no hay). */
  localPublicKey: string | null;
  /** Mensajes cifrados presentes en el historial recibido. */
  envelopes: number;
};

export type E2eeGateDecision = {
  /** Mostrar el panel de recuperación (el código es imprescindible). */
  restore: boolean;
  /** Generar la clave en silencio (sin código ni panel). */
  create: boolean;
  /** Al crear la clave, ¿se muestra el código de recuperación? */
  showCode: boolean;
};

export function decideE2eeGate(input: E2eeGateInput): E2eeGateDecision {
  const { role, proVisitor, hasLocalIdentity, accountPublicKey } = input;
  const isPro = role === "professional";

  if (hasLocalIdentity) {
    // La clave local no sirve si la cuenta publicó otra distinta: hay que
    // decidir (recuperar la de la cuenta o quedarse con la de este equipo).
    const mismatch =
      isPro &&
      accountPublicKey !== null &&
      input.localPublicKey !== accountPublicKey;
    return { restore: mismatch, create: false, showCode: false };
  }

  if (isPro && accountPublicKey) {
    // La clave de la cuenta vive en otro dispositivo: sin código no se lee.
    return { restore: true, create: false, showCode: false };
  }

  if (input.envelopes > 0) {
    if (proVisitor && !isPro) {
      // Vista "como la persona": la clave real es de la persona y no se le
      // puede pedir su código; se crea una nueva en silencio para escribir.
      return { restore: false, create: true, showCode: false };
    }
    return { restore: true, create: false, showCode: false };
  }

  // Nada cifrado todavía: se puede empezar de cero sin interrumpir.
  return { restore: false, create: true, showCode: !proVisitor };
}
