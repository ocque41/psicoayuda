import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth-secret";
import { SEEKER_COOKIE, verifySeekerToken } from "@/lib/seeker-token";

const TOKEN_TTL_S = 72 * 60 * 60; // 72h

/**
 * Enlace de acceso del solicitante (llega por correo cuando un profesional
 * acepta). Verifica el token, deja la cookie httpOnly de la sala y redirige al
 * chat. Sin cuenta, sin contraseña: el token acota la sesión a esa conversación.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifySeekerToken(token, getAuthSecret(), Date.now());

  if (!payload) {
    return NextResponse.redirect(
      new URL("/ayuda?acceso=invalido", request.url),
    );
  }

  const response = NextResponse.redirect(
    new URL(`/c/${payload.conversationId}`, request.url),
  );
  response.cookies.set(SEEKER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_S,
  });
  return response;
}
