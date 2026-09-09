import { createHash, timingSafeEqual } from "node:crypto";
import { closeAndAnonymizeStaleRequests } from "@/lib/retention";

// Must run on every cron invocation — never prerender or cache.
export const dynamic = "force-dynamic";

/**
 * Constant-time secret comparison. Both inputs are SHA-256 hashed first so the
 * compared buffers are always the same length (timingSafeEqual throws otherwise).
 */
function secretsMatch(provided: string, expected: string) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Retention cron endpoint. Triggered by the Cloudflare cron via the custom
 * worker's scheduled() handler (worker.ts), which forwards the shared secret in
 * the `x-cron-secret` header. Set the secret with `wrangler secret put CRON_SECRET`.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (!expected || !provided || !secretsMatch(provided, expected)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await closeAndAnonymizeStaleRequests(new Date());
    // Surfaced via Cloudflare Workers observability for an unattended job.
    console.log("[cron] retention", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] retention failed", error);
    return Response.json(
      { ok: false, error: "retention_failed" },
      { status: 500 },
    );
  }
}
