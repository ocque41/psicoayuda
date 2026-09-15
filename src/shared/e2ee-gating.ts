/**
 * Regla de cuándo pedir el código de recuperación dentro de una sala. Vive
 * fuera del componente para poder probarla: dentro del chat es fácil romperla
 * sin darse cuenta.
 *
 * Principio:
 * - El PROFESIONAL nunca queda bloqueado en una sala: tiene cuenta y puede
 *   atender. Si este dispositivo no tiene su clave, se crea y publica una nueva
 *   en silencio y se le deja un aviso discreto (no bloqueante) por si quiere
 *   recuperar el historial anterior con su código. El código se gestiona en la
 *   sección "Cifrado" de su panel, no como muro en cada chat.
 * - La PERSONA no tiene cuenta: si este dispositivo no tiene la clave y hay
 *   historial cifrado, el código es la única forma de leerlo (panel). Si no hay
 *   nada cifrado aún, se crea su clave y se le muestra el código una vez.
 * - Única excepción en la vista "como la persona" del profesional: la clave real
 *   es de la persona y no se le puede pedir su código; se crea una nueva en
 *   silencio para poder escribir como ella.
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
  /** Mostrar el panel de recuperación como paso obligatorio (solo personas). */
  restore: boolean;
  /** Generar (y publicar, si es profesional) la clave en silencio. */
  create: boolean;
  /** Al crear la clave, ¿se muestra el código de recuperación? */
  showCode: boolean;
  /**
   * Aviso discreto con acceso OPCIONAL al código (profesional). El tipo
   * distingue el caso para redactar el aviso con precisión.
   */
  notice: "rotated" | "mismatch" | null;
};

export function decideE2eeGate(input: E2eeGateInput): E2eeGateDecision {
  const { role, proVisitor, hasLocalIdentity, accountPublicKey } = input;
  const isPro = role === "professional";

  if (hasLocalIdentity) {
    if (
      isPro &&
      accountPublicKey &&
      input.localPublicKey !== accountPublicKey
    ) {
      // La cuenta publicó otra clave (otro dispositivo): este equipo sigue
      // funcionando con la suya y se le ofrece el código para unificar.
      return {
        restore: false,
        create: false,
        showCode: false,
        notice: "mismatch",
      };
    }
    return { restore: false, create: false, showCode: false, notice: null };
  }

  if (isPro) {
    // Sin clave local: se crea y publica una nueva para poder atender ya. Si la
    // cuenta tenía clave (otro dispositivo), el historial anterior necesita el
    // código: aviso discreto, nunca muro.
    return {
      restore: false,
      create: true,
      showCode: false,
      notice: accountPublicKey !== null ? "rotated" : null,
    };
  }

  if (input.envelopes > 0) {
    if (proVisitor) {
      // Vista "como la persona" del profesional: clave nueva en silencio.
      return { restore: false, create: true, showCode: false, notice: null };
    }
    // Persona en un dispositivo nuevo: sin el código no puede leer.
    return { restore: true, create: false, showCode: false, notice: null };
  }

  // Persona al inicio de la conversación: se crea su clave y se le da el código.
  return { restore: false, create: true, showCode: !proVisitor, notice: null };
}
