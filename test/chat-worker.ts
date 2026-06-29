// Worker mínimo SOLO para la prueba de integración en runtime de Workers.
// Enruta /parties/* al Durable Object real (mismo código que producción) y
// re-exporta Conversation para que workerd lo instancie. Además captura en
// memoria las llamadas internas del DO (email / muestra de tiempo de respuesta)
// para poder afirmarlas desde el script e2e.
import { routePartykitRequest } from "partyserver";
import { makeOnBeforeConnect } from "../src/server/auth-gate";
import { Conversation } from "../src/server/conversation";
import type { Env } from "../src/server/types";

export { Conversation };

const recorded: unknown[] = [];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/internal/chat-event") {
      recorded.push(await request.json());
      return Response.json({ ok: true });
    }
    if (url.pathname === "/__nido-calls") {
      return Response.json(recorded);
    }

    const routed = await routePartykitRequest(request, env, {
      prefix: "parties",
      onBeforeConnect: makeOnBeforeConnect(env),
    });
    return routed ?? new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
