/**
 * Regla de cuándo pedir el código de recuperación dentro de una sala. Vive
 * fuera del componente para poder probarla: dentro del chat es fácil romperla
 * sin darse cuenta.
 *
 * Principio:
 * - NADIE rota su clave en silencio cuando la cuenta ya tiene una publicada: al
 *   rotar, el historial anterior se vuelve ilegible en TODOS los dispositivos
 *   (los mensajes viejos quedaron cifrados para la clave anterior). Por eso, si
 *   la cuenta ya tiene clave y este dispositivo no, se pide el CÓDIGO (uno solo
 *   sirve para todas las conversaciones) con la opción explícita de empezar de
 *   cero. El profesional nunca pierde su historial por entrar desde otro
 *   navegador o por volver a entrar.
 * - El PROFESIONAL solo crea su clave en silencio la primera vez (ni cuenta ni
 *   dispositivo tienen clave): ahí no hay nada que perder. El código se gestiona
 *   en la sección "Cifrado" de su panel, no como muro en cada chat.
 * - La PERSONA no tiene cuenta: si este dispositivo no tiene la clave y hay
 *   historial cifrado, el código es la única forma de leerlo (panel). Si no hay
 *   nada cifrado aún, se crea su clave y se le muestra el código una vez.
 * - Única excepción en la vista "como la persona" del profesional: la clave real
 *   es de la persona y no se le puede pedir su código; si el dispositivo ya tiene
 *   la clave de la persona (o el profesional restauró su keystore, que la
 *   incluye), se usa esa; si no, se crea una nueva en silencio para poder
 *   escribir como ella.
 */

export type E2eeGateRole = "seeker" | "professional";

export type E2eeGateInput = {
  /** Rol de la vista actual (con la que se lee y se escribe). */
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
  /** Mostrar el panel de recuperación como paso obligatorio para leer. */
  restore: boolean;
  /** Generar (y publicar, si es profesional) la clave en silencio. */
  create: boolean;
  /** Al crear la clave, ¿se muestra el código de recuperación? */
  showCode: boolean;
  /**
   * Aviso discreto con acceso OPCIONAL al código (profesional): la cuenta tiene
   * publicada otra clave (otro dispositivo) y este equipo sigue con la suya.
   */
  notice: "mismatch" | null;
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
    if (accountPublicKey !== null) {
      // La cuenta YA tiene clave (otro dispositivo). Crear y publicar una nueva
      // en silencio rotaría la clave de la cuenta y dejaría ilegible el
      // historial en todos los dispositivos. Se pide el código (uno para todo)
      // con la opción explícita de empezar de cero.
      return { restore: true, create: false, showCode: false, notice: null };
    }
    // Primera vez: ni la cuenta ni este dispositivo tienen clave. No hay nada
    // que perder, se crea en silencio y el código queda en su panel.
    return { restore: false, create: true, showCode: false, notice: null };
  }

  if (input.envelopes > 0) {
    if (proVisitor) {
      // Vista "como la persona": se restaura con el keystore del profesional (que
      // incluye la clave de la persona si este dispositivo la creó alguna vez);
      // si no puede, el panel ofrece empezar de cero.
      return { restore: true, create: false, showCode: false, notice: null };
    }
    // Persona en un dispositivo nuevo: sin el código no puede leer.
    return { restore: true, create: false, showCode: false, notice: null };
  }

  // Persona al inicio de la conversación: se crea su clave y se le da el código.
  return { restore: false, create: true, showCode: !proVisitor, notice: null };
}
