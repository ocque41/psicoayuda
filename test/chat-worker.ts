// Worker mínimo SOLO para la prueba de integración en runtime de Workers.
// Enruta /parties/* al Durable Object real (mismo código que producción) y
// re-exporta Conversation para que miniflare lo instancie.
import { routePartykitRequest } from "partyserver";
import { makeOnBeforeConnect } from "../src/server/auth-gate";
import { Conversation } from "../src/server/conversation";
import type { Env } from "../src/server/types";

export { Conversation };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const routed = await routePartykitRequest(request, env, {
      prefix: "parties",
      onBeforeConnect: makeOnBeforeConnect(env),
    });
    return routed ?? new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
