import { calendarDigest } from "./crypto";

type IcsEvent = {
  id: string;
  startsAt: string;
  endsAt: string;
  updatedAt: string;
  calendarRevision: number;
};
function icsDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("calendar_invalid_date");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
export async function nidoCalendarIcs(
  events: IcsEvent[],
  userId: string,
  audience: string,
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nido//Agenda privada//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Nido",
  ];
  for (const event of events) {
    if (
      !Number.isInteger(event.calendarRevision) ||
      event.calendarRevision < 0 ||
      event.calendarRevision > 2147483647
    )
      throw new Error("calendar_invalid_revision");
    if (new Date(event.endsAt) <= new Date(event.startsAt)) continue;
    const uid = await calendarDigest(
      JSON.stringify(["nido-ics-v1", userId, audience, event.id]),
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid.slice(0, 48)}@nido.invalid`,
      `SEQUENCE:${event.calendarRevision}`,
      `DTSTAMP:${icsDate(now.toISOString())}`,
      `LAST-MODIFIED:${icsDate(event.updatedAt)}`,
      `DTSTART:${icsDate(event.startsAt)}`,
      `DTEND:${icsDate(event.endsAt)}`,
      "SUMMARY:Sesión Nido",
      "CLASS:PRIVATE",
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
