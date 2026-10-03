import {
  calendarAudience,
  currentCalendarActor,
  ownedCalendarAppointments,
} from "@/lib/calendar/access";
import { nidoCalendarIcs } from "@/lib/calendar/ics";
export const dynamic = "force-dynamic";
const privateHeaders = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};
export async function GET(request: Request) {
  const audience = calendarAudience(
    new URL(request.url).searchParams.get("espacio"),
  );
  if (!audience)
    return new Response("Elige tu espacio.", {
      status: 400,
      headers: privateHeaders,
    });
  const actor = await currentCalendarActor(audience);
  if (!actor)
    return new Response(
      "Verifica tu cuenta y entra en tu espacio para descargar la agenda.",
      { status: 401, headers: privateHeaders },
    );
  const rows = await ownedCalendarAppointments(actor, { limit: 501 });
  if (rows.length > 500)
    return new Response(
      "Tu agenda supera el límite de esta descarga. Contacta con soporte para exportarla completa.",
      { status: 422, headers: privateHeaders },
    );
  return new Response(
    await nidoCalendarIcs(rows, actor.userId, actor.audience),
    {
      headers: {
        ...privateHeaders,
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": "attachment; filename=nido-agenda.ics",
      },
    },
  );
}
