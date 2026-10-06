import { timingSafeEqual } from "node:crypto";
import { syncConnectedGoogleCalendars } from "@/lib/calendar/sync";
import { runPracticeJobs } from "@/lib/practice/jobs";
import { runAppointmentReminderJobs } from "@/lib/practice/reminders";
import { runWebPushJobs } from "@/lib/push/jobs";
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
    const [practiceResult, remindersResult, calendarResult, pushResult] =
      await Promise.allSettled([
        runPracticeJobs(),
        runAppointmentReminderJobs(),
        syncConnectedGoogleCalendars(1),
        runWebPushJobs(),
      ]);
    const practice =
      practiceResult.status === "fulfilled"
        ? practiceResult.value
        : { offered: 0, purged: 0, failed: 1 };
    const reminders =
      remindersResult.status === "fulfilled"
        ? remindersResult.value
        : { failed: 1 };
    const calendar =
      calendarResult.status === "fulfilled"
        ? calendarResult.value
        : { processed: 0, updated: 0, skipped: 0, failed: 1 };
    const push =
      pushResult.status === "fulfilled"
        ? pushResult.value
        : { failed: 1, complete: false };
    const ok =
      practice.failed === 0 &&
      calendar.failed === 0 &&
      remindersResult.status === "fulfilled" &&
      remindersResult.value.dead === 0 &&
      push.failed === 0 &&
      push.complete;
    return Response.json(
      { ok, ...practice, reminders, calendar, push },
      { status: ok ? 200 : 500 },
    );
  } catch {
    return Response.json(
      { ok: false, error: "No pudimos completar los trabajos de la consulta." },
      { status: 500 },
    );
  }
}
