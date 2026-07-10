// Entrada del Worker de Cloudflare (wrangler `main`). Une dos capas en UN solo
// Worker: el chat en tiempo real (Durable Object vía partyserver en /parties/*)
// y todo lo demás servido por el handler de @opennextjs/cloudflare (Next.js).
//
// Re-exportar `Conversation` es OBLIGATORIO: si el binding del DO referencia una
// clase no exportada por el worker, el deploy falla (opennextjs-cloudflare #502).
//
// `./.open-next/worker.js` solo existe tras `opennextjs-cloudflare build`, por eso
// este archivo se excluye del typecheck de Next (se compila con wrangler/esbuild).

import { routePartykitRequest } from "partyserver";
// @ts-expect-error — generado por opennextjs-cloudflare build
import handler from "./.open-next/worker.js";
import { makeOnBeforeConnect } from "./src/server/auth-gate";
import { Conversation } from "./src/server/conversation";
import type { Env } from "./src/server/types";

export { Conversation };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.saludmental-venezuela.com") {
      url.hostname = "saludmental-venezuela.com";
      return Response.redirect(url.toString(), 308);
    }

    const routed = await routePartykitRequest(request, env, {
      prefix: "parties",
      onBeforeConnect: makeOnBeforeConnect(env),
    });
    if (routed) return routed;
    return handler.fetch(request, env, ctx);
  },

  // Crons (ver wrangler.jsonc `triggers.crons`). Disparan un endpoint interno por
  // loopback al propio handler de Next/opennext (donde `db` corre contra D1) con
  // el secreto compartido. Enrutamos según el cron que disparó:
  //  - "0 3 * * *"    → retención (cierra a 30 días, anonimiza a 90).
  //  - "0 * / 12 * * *" → informe de clics por correo (cada 12h).
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const base = env.BETTER_AUTH_URL?.replace(/\/+$/, "") ?? "";
    const secret = env.INTERNAL_NOTIFY_SECRET ?? env.BETTER_AUTH_SECRET;
    if (!base || !secret) return;
    const path =
      controller.cron === "0 3 * * *"
        ? "/api/internal/retention"
        : "/api/internal/click-report";
    const task = handler
      .fetch(
        new Request(`${base}${path}`, {
          method: "POST",
          headers: { "x-nido-internal": secret },
        }),
        env,
        ctx,
      )
      .then(() => undefined)
      .catch(() => undefined);
    ctx.waitUntil(task);
    await task;
  },

  // Reenvío del correo entrante del dominio (p. ej. respuestas a `equipo@` del
  // envío de feedback) SIEMPRE a las dos cuentas del equipo. Requiere Email
  // Routing activado en Cloudflare y AMBOS destinos verificados; la regla de
  // enrutado (equipo@ o catch-all → este Worker) se configura en el panel.
  // Nunca @implicacf.com (regla del proyecto).
  async email(message: ForwardableEmailMessage): Promise<void> {
    await Promise.all([
      message.forward("martinezra02@gmail.com"),
      message.forward("ocquema@hotmail.com"),
    ]);
  },
} satisfies ExportedHandler<Env>;
