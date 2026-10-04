// Worker mínimo SOLO para la prueba de integración en runtime de Workers.
// Enruta /parties/* al Durable Object real (mismo código que producción) y
// re-exporta Conversation para que workerd lo instancie. Además captura en
// memoria las llamadas internas del DO (email / muestra de tiempo de respuesta)
// para poder afirmarlas desde el script e2e.
import { routePartykitRequest } from "partyserver";
import { makeOnBeforeConnect } from "../src/server/auth-gate";
import { Conversation as ProductionConversation } from "../src/server/conversation";
import type { Env } from "../src/server/types";

const fixtureStatus = new Map<string, "open" | "closed">();
const fixtureDatabase = {
  prepare: (query: string) => ({
    bind: (...params: unknown[]) => ({
      first: async () => {
        const status = fixtureStatus.get(String(params[1])) ?? "open";
        return query.includes("professional_status")
          ? {
              conversation_status: status,
              professional_status: "approved",
              owner_id: "pro_1",
              deleted_at: null,
              anonymized_at: null,
            }
          : {
              status,
              revoked_at: null,
              expires_at: Date.now() + 3600000,
              deleted_at: null,
              anonymized_at: null,
            };
      },
    }),
  }),
} as unknown as D1Database;

// Transporte de prueba explícito. La aplicación real siempre recibe el binding
// D1; este fixture también permite probar el guard de una conexión ya abierta.
export class Conversation extends ProductionConversation {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, { ...env, DB: env.DB ?? fixtureDatabase });
  }
}

const recorded: unknown[] = [];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/internal/chat-event") {
      if (request.method !== "POST")
        return new Response("Método no permitido", { status: 405 });
      if (request.headers.get("x-nido-internal") !== env.INTERNAL_NOTIFY_SECRET)
        return new Response("Sin autorización", { status: 401 });
      recorded.push(await request.json());
      return Response.json({ ok: true });
    }
    if (url.pathname === "/__nido-calls") {
      return Response.json(recorded);
    }
    // Espejo EXACTO del borrado de producción (chat-admin.ts): direcciona el DO
    // por idFromName(room) y vacía su SQLite. Misma derivación que el WebSocket.
    if (url.pathname === "/__purge") {
      const room = url.searchParams.get("room");
      if (!room) return new Response("room required", { status: 400 });
      const stub = env.Conversation.get(env.Conversation.idFromName(room));
      const purged = await stub.fetch("https://do/purge", {
        method: "POST",
        headers: { "x-nido-internal": "test-secret" },
      });
      return new Response(await purged.text(), { status: purged.status });
    }

    const routed = await routePartykitRequest(request, env, {
      prefix: "parties",
      onBeforeConnect: async (upgradeRequest, lobby) => {
        // Harness explícito de transporte: las pruebas de autorización D1
        // viven en auth-gate-d1.test.ts. Producción nunca permite faltar D1.
        fixtureStatus.set(
          lobby.name,
          request.headers.get("x-test-can-send") === "0" ? "closed" : "open",
        );
        const result = await makeOnBeforeConnect({
          ...env,
          DB: env.DB ?? fixtureDatabase,
        })(upgradeRequest, lobby);
        // Solo-test: la base simulada no conserva cambios de estado;
        // este header permite forzar `x-nido-can-send` para el caso de solo
        // lectura (nunca existe en producción: el gate pisa el valor que llega).
        const override = request.headers.get("x-test-can-send");
        if (result instanceof Request && override) {
          const headers = new Headers(result.headers);
          headers.set("x-nido-can-send", override);
          return new Request(result, { headers });
        }
        return result;
      },
    });
    return routed ?? new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
