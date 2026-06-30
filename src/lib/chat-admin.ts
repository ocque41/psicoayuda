import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Borra TODO el contenido de un chat del Durable Object (su SQLite). Lo usa la
 * anonimización del admin para honrar de verdad la promesa de borrado: el espejo
 * en D1 se anonimiza por separado, pero el contenido del chat solo vive en el DO.
 *
 * Direccionamos el DO con `idFromName(conversationId)` — la MISMA derivación que
 * usa partyserver para el WebSocket (getServerByName hace exactamente esto), así
 * que golpeamos la instancia real. NO importamos `partyserver` aquí a propósito:
 * arrastra `cloudflare:workers`, que rompe el build de webpack de Next.
 *
 * Best-effort y silencioso: en local (sin binding del DO) o si algo falla,
 * devuelve false sin romper el flujo de anonimización del registro en D1.
 */
export async function purgeConversationMessages(
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
    const response = await stub.fetch("https://do/purge", {
      method: "POST",
      headers: { "x-nido-internal": secret },
    });
    return response.ok;
  } catch {
    return false;
  }
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
