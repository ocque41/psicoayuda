"use server";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { session as authSessions, seekerSessions } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import {
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
  verifySeekerToken,
} from "@/lib/seeker-token";
/** Revoca las capacidades de este navegador al salir; no borra claves ni datos. */
export async function clearChatSessionCookies() {
  const store = await cookies();
  const current = await getServerSession();
  if (current?.user?.id && current.session?.id) {
    // Revocación comprobada de ESTA sesión: BetterAuth puede ocultar un fallo
    // de su adapter en signOut. Su respuesta no rehabilita esta fila eliminada.
    // Ninguna clave, conversación, borrador o sesión de otro dispositivo depende
    // de esta fila efímera para su conservación.
    await db
      .delete(authSessions)
      .where(
        and(
          eq(authSessions.id, current.session.id),
          eq(authSessions.userId, current.user.id),
        ),
      );
  }
  const raw = store.get(SEEKER_COOKIE)?.value;
  const seeker = raw
    ? verifySeekerToken(raw, getAuthSecret(), Date.now())
    : null;
  if (seeker) {
    // Sólo el sid de este navegador; enlaces y otros dispositivos permanecen.
    await db
      .update(seekerSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(seekerSessions.sid, seeker.sid),
          eq(seekerSessions.conversationId, seeker.conversationId),
          eq(seekerSessions.role, "seeker"),
          isNull(seekerSessions.revokedAt),
        ),
      );
  }
  for (const name of [PRO_COOKIE, PRO_INBOX_COOKIE, SEEKER_COOKIE])
    store.delete(name);
}
