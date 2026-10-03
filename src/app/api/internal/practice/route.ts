import { timingSafeEqual } from "node:crypto";
import { runPracticeJobs } from "@/lib/practice/jobs";
export async function POST(request: Request) {
  const provided = request.headers.get("x-nido-internal");
  const expected =
    process.env.INTERNAL_NOTIFY_SECRET || process.env.BETTER_AUTH_SECRET;
  if (
    !provided ||
    !expected ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return new Response("No autorizado", { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runPracticeJobs()) });
  } catch {
    return Response.json(
      { ok: false, error: "No pudimos completar los trabajos de la consulta." },
      { status: 500 },
    );
  }
}
