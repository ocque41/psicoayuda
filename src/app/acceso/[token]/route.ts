import { NextRequest, NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth-secret";
import { exchangeSeekerAccess } from "@/lib/seeker-access-session";
import {
  mintSeekerToken,
  SEEKER_COOKIE,
  verifySeekerAccessToken,
  verifySeekerToken,
} from "@/lib/seeker-token";

/** El enlace autoriza un SID propio del navegador; nunca se copia como cookie. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const secret = getAuthSecret();
  const now = Date.now();
  const payload = verifySeekerAccessToken(token, secret, now);
  const invalid = () => {
    const response = NextResponse.redirect(
      new URL("/ayuda?acceso=invalido", request.url),
    );
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  };
  if (!payload) return invalid();
  const raw = new NextRequest(request).cookies.get(SEEKER_COOKIE)?.value;
  const current = raw ? verifySeekerToken(raw, secret, now) : null;
  const browser = await exchangeSeekerAccess(payload, current);
  if (!browser) return invalid();
  const response = NextResponse.redirect(
    new URL(`/c/${encodeURIComponent(payload.conversationId)}`, request.url),
  );
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-robots-tag", "noindex");
  response.cookies.set(SEEKER_COOKIE, mintSeekerToken(browser, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, Math.floor((browser.exp - Date.now()) / 1000)),
  });
  return response;
}
