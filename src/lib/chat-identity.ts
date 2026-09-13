/**
 * Resolución ÚNICA de la identidad del visitante en una conversación.
 *
 * Una misma persona puede tener a la vez dos credenciales para la MISMA sala:
 *  - Profesional: sesión de better-auth (dueño de la conversación) o cookie HMAC
 *    `PRO_COOKIE` minteada al abrir su sala (válida 72 h).
 *  - Persona (seeker): cookie HMAC `SEEKER_COOKIE` + sesión vigente en D1, que
 *    llega por el enlace de acceso.
 *
 * Antes cada capa rompía el empate a su manera (la página y las acciones daban
 * prioridad al seeker; el WebSocket al profesional), así que un navegador con
 * ambas credenciales veía la sala con una identidad y escribía con otra: el
 * mensaje aparecía "como el otro". Esta función centraliza la regla para que
 * página, acciones y WebSocket decidan SIEMPRE lo mismo:
 *
 *   1. La identidad PROFESIONAL gana por defecto (es la autenticada y la
 *      explícita: quien administra la sala).
 *   2. El profesional puede forzar la vista de la persona con `?como=persona`
 *      (solo si esa credencial de seeker está vigente): así puede ver/escribir
 *      como ella de forma deliberada, nunca por accidente.
 *   3. Sin credencial profesional, gana la del seeker. Sin ninguna: null.
 *
 * Módulo puro (sin `server-only` ni DB) para poder testearlo y reutilizarlo en
 * el Worker (auth-gate) sin arrastrar dependencias de Next.
 */
export type ChatIdentity = "professional" | "seeker";

export type ChatCredentials = {
  /** Sesión better-auth del profesional dueño O cookie HMAC de la sala. */
  professional: boolean;
  /** Cookie HMAC del seeker + sesión vigente en D1. */
  seeker: boolean;
};

export function chooseChatIdentity(
  credentials: ChatCredentials,
  preferPersona = false,
): ChatIdentity | null {
  if (preferPersona && credentials.seeker) return "seeker";
  if (credentials.professional) return "professional";
  if (credentials.seeker) return "seeker";
  return null;
}
