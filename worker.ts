// Custom Cloudflare Worker entrypoint.
//
// OpenNext generates `.open-next/worker.js`, which exports only a `fetch`
// handler. We wrap it to add a `scheduled()` handler for the retention cron
// trigger declared in wrangler.jsonc (`triggers.crons`).
//
// The scheduled handler calls the authenticated internal route through
// OpenNext's own fetch handler so the retention logic runs inside a normal
// request context (D1 binding, env vars on process.env, etc.) rather than a
// bare scheduled context where those would be unavailable.
//
// Docs: https://opennext.js.org/cloudflare/howtos/custom-worker

// biome-ignore lint/suspicious/noTsIgnore: `.open-next/worker.js` only exists after the OpenNext build, so `@ts-expect-error` would itself error (unused directive) once it resolves.
// @ts-ignore `.open-next/worker.js` is generated at build time.
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(
    _controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ) {
    const base = env.BETTER_AUTH_URL ?? "https://nido-venezuela.workers.dev";
    const request = new Request(new URL("/api/cron/retention", base), {
      method: "POST",
      headers: { "x-cron-secret": env.CRON_SECRET ?? "" },
    });

    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv>;
