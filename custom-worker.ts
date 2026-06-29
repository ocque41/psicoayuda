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
    const routed = await routePartykitRequest(request, env, {
      prefix: "parties",
      onBeforeConnect: makeOnBeforeConnect(env),
    });
    if (routed) return routed;
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
