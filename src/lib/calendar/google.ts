import "server-only";
import { GOOGLE_CALENDAR_SCOPE, googleCalendarConfig } from "./config";

export class GoogleCalendarError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "reconnect"
      | "provider"
      | "calendar_missing"
      | "event_gone"
      | "offline_access"
      | "scope",
  ) {
    super(`calendar_${code}`);
  }
}
export type CalendarTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
async function googleFetch(url: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new GoogleCalendarError("provider");
  }
}
async function tokenRequest(
  params: URLSearchParams,
  previousRefresh?: string,
): Promise<CalendarTokens> {
  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok)
    throw new GoogleCalendarError(
      response.status === 400 || response.status === 401
        ? "reconnect"
        : "provider",
    );
  let data: Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new GoogleCalendarError("provider");
  }
  if (
    !previousRefresh &&
    (typeof data.scope !== "string" ||
      !data.scope.split(" ").includes(GOOGLE_CALENDAR_SCOPE))
  )
    throw new GoogleCalendarError("scope");
  const refreshToken =
    typeof data.refresh_token === "string"
      ? data.refresh_token
      : previousRefresh;
  if (!refreshToken || refreshToken.length > 8192)
    throw new GoogleCalendarError("offline_access");
  if (
    typeof data.access_token !== "string" ||
    !data.access_token ||
    data.access_token.length > 8192 ||
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in < 1 ||
    data.expires_in > 86400
  )
    throw new GoogleCalendarError("provider");
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
export function exchangeCalendarCode(code: string, verifier: string) {
  const cfg = googleCalendarConfig();
  if (!cfg) throw new GoogleCalendarError("configuration");
  return tokenRequest(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
  );
}
export function refreshCalendarTokens(tokens: CalendarTokens) {
  const cfg = googleCalendarConfig();
  if (!cfg) throw new GoogleCalendarError("configuration");
  return tokenRequest(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
    tokens.refreshToken,
  );
}
export async function revokeCalendarTokens(tokens: CalendarTokens) {
  const response = await googleFetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: tokens.refreshToken }),
  });
  if (response.ok) return;
  if (response.status === 400) {
    let data: { error?: string } = {};
    try {
      data = await response.json();
    } catch {}
    if (data.error === "invalid_token") return;
  }
  throw new GoogleCalendarError("provider");
}
function eventUrl(calendarId: string, eventId?: string) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}?sendUpdates=none`;
}
async function calendarRequest(
  url: string,
  accessToken: string,
  method: string,
  body?: unknown,
  beforeRequest?: () => Promise<void>,
) {
  await beforeRequest?.();
  const response = await googleFetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 || response.status === 403)
    throw new GoogleCalendarError("reconnect");
  return response;
}
export async function createNidoGoogleCalendar(
  accessToken: string,
  beforeRequest?: () => Promise<void>,
) {
  const response = await calendarRequest(
    "https://www.googleapis.com/calendar/v3/calendars",
    accessToken,
    "POST",
    {
      summary: "Nido",
      description:
        "Horarios de sesiones copiados desde Nido. Los cambios se gestionan en Nido.",
      timeZone: "UTC",
    },
    beforeRequest,
  );
  if (!response.ok) throw new GoogleCalendarError("provider");
  const data = (await response.json()) as { id?: unknown };
  if (typeof data.id !== "string" || !data.id || data.id.length > 1024)
    throw new GoogleCalendarError("provider");
  return data.id;
}
export type CalendarEventSource = { startsAt: string; endsAt: string };
export function opaqueGoogleEvent(
  source: CalendarEventSource,
  eventId: string,
  reminders = false,
) {
  const start = new Date(source.startsAt),
    end = new Date(source.endsAt);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  )
    throw new GoogleCalendarError("provider");
  return {
    id: eventId,
    summary: "Sesión Nido",
    start: { dateTime: start.toISOString(), timeZone: "UTC" },
    end: { dateTime: end.toISOString(), timeZone: "UTC" },
    status: "confirmed",
    visibility: "private",
    transparency: "opaque",
    reminders: { useDefault: reminders },
  };
}
export async function upsertGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  source: CalendarEventSource,
  reminders: boolean,
  insertOnly = false,
  beforeRequest?: () => Promise<void>,
) {
  const body = opaqueGoogleEvent(source, eventId, reminders);
  let response = insertOnly
    ? await calendarRequest(
        eventUrl(calendarId),
        accessToken,
        "POST",
        body,
        beforeRequest,
      )
    : await calendarRequest(
        eventUrl(calendarId, eventId),
        accessToken,
        "PUT",
        body,
        beforeRequest,
      );
  if (response.status === 410) throw new GoogleCalendarError("event_gone");
  if (!insertOnly && response.status === 404)
    response = await calendarRequest(
      eventUrl(calendarId),
      accessToken,
      "POST",
      body,
      beforeRequest,
    );
  if (response.status === 409)
    response = await calendarRequest(
      eventUrl(calendarId, eventId),
      accessToken,
      "PUT",
      body,
      beforeRequest,
    );
  // El evento también puede desaparecer durante INSERT o el PUT de un conflicto.
  if (response.status === 410) throw new GoogleCalendarError("event_gone");
  if (response.status === 404)
    throw new GoogleCalendarError("calendar_missing");
  if (!response.ok) throw new GoogleCalendarError("provider");
}
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  beforeRequest?: () => Promise<void>,
) {
  const response = await calendarRequest(
    eventUrl(calendarId, eventId),
    accessToken,
    "DELETE",
    undefined,
    beforeRequest,
  );
  if (!response.ok && response.status !== 404 && response.status !== 410)
    throw new GoogleCalendarError("provider");
}
