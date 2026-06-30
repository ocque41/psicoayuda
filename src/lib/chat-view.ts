import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { conversations, professionals, seekerSessions } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { SEEKER_COOKIE, verifySeekerToken } from "@/lib/seeker-token";

export type ChatRole = "seeker" | "professional";

export type ChatView = {
  role: ChatRole;
  conversationId: string;
  open: boolean;
  /** Cómo nombrar a la otra parte (al seeker le mostramos el nombre del pro;
   *  al profesional NUNCA le revelamos identidad: la persona es anónima). */
  otherName: string;
};

/**
 * Autoriza quién puede VER la conversación y devuelve lo mínimo para pintar la
 * cabecera. Devuelve null si el visitante no es ni el seeker (cookie HMAC de
 * esta sala, con sesión efímera vigente) ni el profesional dueño (better-auth +
 * propiedad). La autorización del WebSocket la repite el Worker en onBeforeConnect.
 */
export async function loadChatView(
  conversationId: string,
): Promise<ChatView | null> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) return null;

  const open = conversation.status === "open";

  // 1) Seeker anónimo: cookie firmada para ESTA sala + sesión no revocada/vigente.
  const cookieStore = await cookies();
  const seekerRaw = cookieStore.get(SEEKER_COOKIE)?.value;
  if (seekerRaw) {
    const payload = verifySeekerToken(seekerRaw, getAuthSecret(), Date.now());
    if (
      payload &&
      payload.conversationId === conversationId &&
      payload.sid === conversation.seekerSid
    ) {
      const session = await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, payload.sid),
      });
      const valid =
        !!session &&
        !session.revokedAt &&
        session.expiresAt.getTime() > Date.now();
      if (valid) {
        const pro = await db.query.professionals.findFirst({
          where: eq(professionals.id, conversation.professionalId),
        });
        const otherName =
          pro?.displayName || pro?.fullName?.split(" ")[0] || "tu acompañante";
        return { role: "seeker", conversationId, open, otherName };
      }
    }
  }

  // 2) Profesional dueño de la conversación.
  const session = await getServerSession();
  if (session?.user?.id) {
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.userId, session.user.id),
    });
    if (pro && pro.id === conversation.professionalId) {
      return {
        role: "professional",
        conversationId,
        open,
        otherName: "Alguien que pidió apoyo",
      };
    }
  }

  return null;
}
