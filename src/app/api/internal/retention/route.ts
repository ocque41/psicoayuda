import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runTrialReminderJobs } from "@/lib/practice/plan-migration";
import { runRetention } from "@/lib/retention";
import { runScreeningReminderJobs } from "@/lib/screening/reminders";

// Endpoint interno disparado por el cron de Cloudflare (custom-worker.ts
// `scheduled()`), con el mismo secreto compartido que el callback del chat.
// Corre en el runtime de opennext (donde `db` funciona contra D1).
function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-nido-internal");
  const expected =
    process.env.INTERNAL_NOTIFY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runRetention();
    // Aviso de fin de prueba: un fallo aquí no debe frenar la retención.
    const trial = await runTrialReminderJobs().catch(() => ({
      reminded: 0,
      failed: 1,
    }));
    const screening = await runScreeningReminderJobs().catch(() => ({
      reminded: 0,
      failed: 1,
    }));
    return NextResponse.json({ ok: true, ...result, trial, screening });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}
