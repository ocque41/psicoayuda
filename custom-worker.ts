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
import handler, { DOQueueHandler } from "./.open-next/worker.js";
import { makeOnBeforeConnect } from "./src/server/auth-gate";
import { Conversation } from "./src/server/conversation";
import type { Env } from "./src/server/types";

// `DOQueueHandler` (cola de revalidación ISR de OpenNext) se re-exporta porque
// Wrangler exige que el entrypoint exporte toda clase referenciada por un
// binding de Durable Object; si no, el deploy falla (igual que con Conversation).
export { Conversation, DOQueueHandler };

const REQUEST_TIMEOUT_MS = 12_000;

function healthResponse(): Response {
  return Response.json(
    { ok: true, service: "nido", runtime: "cloudflare-workers" },
    {
      headers: {
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    },
  );
}

function unavailableResponse(request: Request): Response {
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const headers = {
    "cache-control": "no-store",
    "retry-after": "30",
    "x-robots-tag": "noindex",
  };

  if (!acceptsHtml) {
    return Response.json(
      { ok: false, error: "Servicio temporalmente no disponible" },
      { status: 503, headers },
    );
  }

  // Última red de seguridad: si Next, D1 o la caché fallan, la persona sigue
  // recibiendo una página pequeña y útil en vez del error genérico de Cloudflare.
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Nido · Volvemos enseguida</title><style>body{margin:0;background:#faf6f0;color:#2b2723;font:18px/1.55 system-ui,sans-serif}main{max-width:42rem;margin:10vh auto;padding:2rem}h1{font-size:clamp(2rem,7vw,3.5rem);line-height:1.05}a{display:inline-block;margin:.4rem .5rem .4rem 0;padding:.8rem 1rem;border-radius:.7rem;background:#2f7a5b;color:white;font-weight:700;text-decoration:none}.alt{background:#fff;color:#2f7a5b;border:1px solid #2f7a5b}</style><main><p>Nido · Ayuda psicológica en Venezuela</p><h1>Estamos tardando más de lo normal</h1><p>La plataforma no pudo responder a tiempo. Intenta de nuevo en unos segundos.</p><p><a href="/">Reintentar</a><a class="alt" href="/emergencia">Ver ayuda de emergencia</a></p><p>Si tú o alguien corre peligro inmediato, llama al 911 o busca ayuda presencial ahora mismo.</p></main></html>`,
    {
      status: 503,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    },
  );
}

async function withTimeout(request: Request, response: Promise<Response>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((resolve) => {
    timeoutId = setTimeout(
      () => resolve(unavailableResponse(request)),
      REQUEST_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([response, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.saludmental-venezuela.com") {
      url.hostname = "saludmental-venezuela.com";
      return new Response(null, {
        status: 308,
        headers: {
          location: url.toString(),
          "cache-control": "public, max-age=86400",
        },
      });
    }

    // Endpoint sin Next, D1 ni caché. Permite distinguir un Worker sano de un
    // fallo de aplicación en los smoke tests y en la observabilidad.
    if (url.pathname === "/healthz") return healthResponse();

    try {
      const response = (async () => {
        const routed = await routePartykitRequest(request, env, {
          prefix: "parties",
          onBeforeConnect: makeOnBeforeConnect(env),
        });
        return routed ?? handler.fetch(request, env, ctx);
      })();
      return await withTimeout(request, response);
    } catch (error) {
      console.error("request failed", {
        method: request.method,
        pathname: url.pathname,
        error,
      });
      return unavailableResponse(request);
    }
  },

  // Crons (ver wrangler.jsonc `triggers.crons`). Disparan un endpoint interno por
  // loopback al propio handler de Next/opennext (donde `db` corre contra D1) con
  // el secreto compartido. Enrutamos según el cron que disparó:
  //  - "0 3 * * *"    → retención (cierra a los 90 días sin actividad, anonimiza a 180).
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
