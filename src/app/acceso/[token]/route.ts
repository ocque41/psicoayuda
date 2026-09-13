import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, seekerSessions } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { SEEKER_COOKIE, verifySeekerToken } from "@/lib/seeker-token";

/**
 * Enlace de acceso del solicitante (llega por correo cuando un profesional
 * acepta o responde). Verifica el token, comprueba que la conversación sigue
 * viva (no anonimizada), deja la cookie httpOnly de la sala y redirige al chat.
 * Sin cuenta, sin contraseña: el token acota la sesión a esa conversación.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const now = Date.now();
  const payload = verifySeekerToken(token, getAuthSecret(), now);

  if (!payload) {
    return NextResponse.redirect(
      new URL("/ayuda?acceso=invalido", request.url),
    );
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, payload.conversationId),
  });
  if (!conversation || conversation.anonymizedAt) {
    return NextResponse.redirect(
      new URL("/ayuda?acceso=invalido", request.url),
    );
  }

  // Marca de actividad de la sesión (útil para diagnóstico y limpieza futura).
  await db
    .update(seekerSessions)
    .set({ lastSeenAt: new Date(now) })
    .where(eq(seekerSessions.sid, payload.sid));

  const response = NextResponse.redirect(
    new URL(`/c/${payload.conversationId}`, request.url),
  );
  response.cookies.set(SEEKER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // La cookie dura lo que le quede al token; la sesión se renueva de forma
    // deslizante al entrar a la sala (renewSeekerChatToken).
    maxAge: Math.max(60, Math.floor((payload.exp - now) / 1000)),
  });
  return response;
}
