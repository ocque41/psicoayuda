import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import {
  calendarSettingsPath,
  completeCalendarOAuth,
} from "@/lib/calendar/oauth";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url),
    session = await getServerSession();
  const respond = (path: string) => {
    const response = NextResponse.redirect(new URL(path, url.origin), 303);
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-robots-tag", "noindex, nofollow");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  };
  if (!session?.user.id) return respond("/entrar");
  try {
    const result = await completeCalendarOAuth(
      session.user.id,
      url.searchParams.get("state") || "",
      url.searchParams.get("code"),
      url.searchParams.has("error"),
    );
    return respond(
      `${result.audience ? calendarSettingsPath(result.audience) : "/empezar"}?calendario=${result.status}`,
    );
  } catch {
    return respond("/empezar?calendario=error");
  }
}
