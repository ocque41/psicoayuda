import "server-only";
import { calendarKeyConfigured } from "./crypto";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";
export function googleCalendarConfig() {
  const clientId = process.env.NIDO_GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.NIDO_GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const rawRedirect = process.env.NIDO_GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  let redirectUri: string | null = null;
  try {
    const url = new URL(rawRedirect || "");
    if (
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname))) &&
      url.pathname === "/api/calendar/google/callback" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      redirectUri = url.toString();
  } catch {}
  if (
    process.env.NIDO_GOOGLE_CALENDAR_ENABLED !== "true" ||
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !calendarKeyConfigured()
  )
    return null;
  return { clientId, clientSecret, redirectUri };
}
