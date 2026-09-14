import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { conversations, professionals, seekerSessions } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { chooseChatIdentity } from "@/lib/chat-identity";
import {
  PRO_COOKIE,
  SEEKER_COOKIE,
  verifyProfessionalToken,
  verifySeekerToken,
} from "@/lib/seeker-token";

export type ChatRole = "seeker" | "professional";

export type ChatView = {
  role: ChatRole;
  conversationId: string;
  open: boolean;
  /** Cómo nombrar a la otra parte (al seeker le mostramos el nombre del pro;
   *  al profesional NUNCA le revelamos identidad: la persona es anónima). */
  otherName: string;
  /** Solo en la rama del profesional: para cargar sus paquetes de pago y
   *  ofrecer "insertar link de pago" en el chat. */
  professionalId?: string;
  /** El visitante tiene AMBAS credenciales para esta sala: puede alternar entre
   *  su vista de profesional y la vista de la persona (`?como=persona`). */
  canSwitchView: boolean;
  /** Papelera: el hilo está borrado y se puede deshacer hasta `purgeAfter`. */
  deleted: boolean;
  purgeAfter: number | null;
  /** Quién lo borró ("professional" | "seeker" | null). */
  deletedByRole: string | null;
  /** Clave pública E2EE del profesional: la persona la necesita para cifrar.
   *  Null = el profesional aún no configuró el cifrado (no se puede escribir). */
  proPublicKey: string | null;
};

/**
 * Autoriza quién puede VER la conversación y devuelve lo mínimo para pintar la
 * cabecera. Devuelve null si el visitante no es ni la persona (cookie HMAC de
 * esta sala, con sesión efímera vigente) ni el profesional dueño (sesión
 * better-auth O cookie HMAC de la sala, para que la vista y el WebSocket no se
 * contradigan cuando la sesión caducó).
 *
 * La prelación es la MISMA que la del `onBeforeConnect` del Worker y la de las
 * server actions (`chooseChatIdentity`, src/lib/chat-identity.ts): profesional
 * por defecto; la persona solo si el profesional pide su vista con
 * `preferPersona` o si no hay credencial profesional.
 */
export async function loadChatView(
  conversationId: string,
  preferPersona = false,
): Promise<ChatView | null> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) return null;

  const open = conversation.status === "open";
  const cookieStore = await cookies();

  // Profesional dueño: sesión better-auth o cookie HMAC de la sala (72 h).
  let isProfessional = false;
  let professionalRow: typeof professionals.$inferSelect | null = null;
  const session = await getServerSession();
  if (session?.user?.id) {
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.userId, session.user.id),
    });
    if (
      pro &&
      pro.id === conversation.professionalId &&
      pro.status !== "suspended"
    ) {
      isProfessional = true;
      professionalRow = pro;
    }
  }
  if (!isProfessional) {
    const proRaw = cookieStore.get(PRO_COOKIE)?.value;
    if (proRaw) {
      const pro = verifyProfessionalToken(proRaw, getAuthSecret(), Date.now());
      if (
        pro &&
        pro.conversationId === conversationId &&
        pro.professionalId === conversation.professionalId
      ) {
        const row = await db.query.professionals.findFirst({
          where: eq(professionals.id, conversation.professionalId),
        });
        if (row && row.status !== "suspended") {
          isProfessional = true;
          professionalRow = row;
        }
      }
    }
  }

  // Persona (seeker anónimo): cookie firmada para ESTA sala + sesión vigente.
  let isSeeker = false;
  const seekerRaw = cookieStore.get(SEEKER_COOKIE)?.value;
  if (seekerRaw) {
    const payload = verifySeekerToken(seekerRaw, getAuthSecret(), Date.now());
    if (
      payload &&
      payload.conversationId === conversationId &&
      payload.sid === conversation.seekerSid
    ) {
      const sessionRow = await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, payload.sid),
      });
      isSeeker =
        !!sessionRow &&
        !sessionRow.revokedAt &&
        sessionRow.expiresAt.getTime() > Date.now();
    }
  }

  const identity = chooseChatIdentity(
    { professional: isProfessional, seeker: isSeeker },
    preferPersona,
  );
  if (!identity) return null;

  const canSwitchView = isProfessional && isSeeker;
  const deleted = conversation.deletedAt != null;
  const purgeAfter = conversation.purgeAfter?.getTime() ?? null;

  if (identity === "professional") {
    return {
      role: "professional",
      conversationId,
      open,
      otherName: "Alguien que pidió apoyo",
      professionalId: conversation.professionalId,
      canSwitchView,
      deleted,
      purgeAfter,
      deletedByRole: conversation.deletedByRole,
      proPublicKey: professionalRow?.cryptoPublicKey ?? null,
    };
  }

  if (!professionalRow) {
    professionalRow =
      (await db.query.professionals.findFirst({
        where: eq(professionals.id, conversation.professionalId),
      })) ?? null;
  }
  const otherName =
    professionalRow?.displayName ||
    professionalRow?.fullName?.split(" ")[0] ||
    "tu acompañante";
  return {
    role: "seeker",
    conversationId,
    open,
    otherName,
    canSwitchView,
    deleted,
    purgeAfter,
    deletedByRole: conversation.deletedByRole,
    proPublicKey: professionalRow?.cryptoPublicKey ?? null,
  };
}
