import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Resultado de intentar vaciar el DO:
 * - "purged": el contenido se borró de verdad.
 * - "unavailable": no hay runtime de Cloudflare (dev local) o falta el secreto;
 *   no había contenido real que borrar.
 * - "failed": había binding pero la petición falló; NO se debe dar por borrado.
 */
export type PurgeResult = "purged" | "unavailable" | "failed";

export async function purgeConversationMessagesDetailed(
  conversationId: string,
): Promise<PurgeResult> {
  let namespace: DurableObjectNamespace | undefined;
  let secret: string | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    namespace = (env as { Conversation?: DurableObjectNamespace }).Conversation;
    secret =
      process.env.INTERNAL_NOTIFY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  } catch {
    // Sin runtime de Cloudflare (dev local): no hay DO que borrar.
    return "unavailable";
  }
  if (!namespace || !secret) return "unavailable";

  try {
    const stub = namespace.get(namespace.idFromName(conversationId));
    const response = await stub.fetch("https://do/purge", {
      method: "POST",
      headers: { "x-nido-internal": secret },
    });
    return response.ok ? "purged" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Borra TODO el contenido de un chat del Durable Object (su SQLite). Lo usan el
 * borrado definitivo (acción de la persona o del profesional) y el borrado de
 * cuenta. El espejo en D1 se borra por separado, pero el contenido del chat solo
 * vive en el DO.
 *
 * Direccionamos el DO con `idFromName(conversationId)` — la MISMA derivación que
 * usa partyserver para el WebSocket (getServerByName hace exactamente esto), así
 * que golpeamos la instancia real. NO importamos `partyserver` aquí a propósito:
 * arrastra `cloudflare:workers`, que rompe el build de webpack de Next.
 *
 * Best-effort y silencioso: en local (sin binding del DO) o si algo falla,
 * devuelve false sin romper el flujo que lo llama.
 */
export async function purgeConversationMessages(
  conversationId: string,
): Promise<boolean> {
  return (await purgeConversationMessagesDetailed(conversationId)) === "purged";
}

/**
 * Corta las conexiones WebSocket vivas de un chat SIN borrar su contenido (a
 * diferencia de purge). Lo usan el cierre de solicitud y la suspensión de un
 * profesional para hacer efectivo el kill-switch: el chequeo de sesión en D1
 * solo se evalúa al CONECTAR y, con hibernación del Durable Object, un socket ya
 * abierto sobrevivía. Best-effort y silencioso (en local/sin binding del DO no
 * rompe el flujo de cierre).
 */
export async function disconnectConversationSockets(
  conversationId: string,
): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const namespace = (env as { Conversation?: DurableObjectNamespace })
      .Conversation;
    const secret =
      process.env.INTERNAL_NOTIFY_SECRET ?? process.env.BETTER_AUTH_SECRET;
    if (!namespace || !secret) return false;

    const stub = namespace.get(namespace.idFromName(conversationId));
    const response = await stub.fetch("https://do/disconnect", {
      method: "POST",
      headers: { "x-nido-internal": secret },
    });
    return response.ok;
  } catch {
    return false;
  }
}
