"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { conversations, professionals } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { mintProfessionalToken, PRO_COOKIE } from "@/lib/seeker-token";

const TTL_MS = 72 * 60 * 60 * 1000; // 72h, igual que el token del seeker.

/**
 * El profesional ya entró con Google. Al abrir /c/<id> verificamos que la
 * conversación es suya y le minteamos un PRO_COOKIE (HMAC) para que el
 * onBeforeConnect del Worker autorice su WebSocket sin volver a llamar a
 * better-auth dentro del Worker. Idempotente.
 */
export async function ensureProChatToken(
  conversationId: string,
): Promise<{ ok: boolean }> {
  const session = await getServerSession();
  if (!session?.user?.id) return { ok: false };

  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });
  if (!pro) return { ok: false };

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation || conversation.professionalId !== pro.id) {
    return { ok: false };
  }

  const now = Date.now();
  const token = mintProfessionalToken(
    {
      professionalId: pro.id,
      conversationId,
      role: "professional",
      iat: now,
      exp: now + TTL_MS,
    },
    getAuthSecret(),
  );

  const cookieStore = await cookies();
  cookieStore.set(PRO_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Path "/" para que viaje también al upgrade WebSocket en /parties/*.
    path: "/",
    maxAge: TTL_MS / 1000,
  });
  return { ok: true };
}
