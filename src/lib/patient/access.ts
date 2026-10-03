import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import { conversations, seekerSessions, user } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { nowIso } from "@/lib/ids";
import { verifySeekerToken } from "@/lib/seeker-token";
import { ensurePatientAccount } from "./accounts";

export async function requirePatientAccount() {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/entrar");
  const account = await ensurePatientAccount(session.user);
  if (account.deletionState !== "active")
    throw new Error(
      "Tu cuenta está completando una solicitud de baja. Espera un momento y vuelve a intentarlo.",
    );
  if (!account.onboardingCompletedAt) redirect("/empezar/paciente");
  return { account, user: session.user };
}
export async function hasPatientConversationAccess(
  userId: string,
  conversationId: string,
) {
  const [link] = await db
    .select({ conversationId: patientConversationLinks.conversationId })
    .from(patientConversationLinks)
    .innerJoin(
      patientAccounts,
      eq(patientAccounts.userId, patientConversationLinks.userId),
    )
    .innerJoin(
      conversations,
      eq(conversations.id, patientConversationLinks.conversationId),
    )
    .where(
      and(
        eq(patientConversationLinks.userId, userId),
        eq(patientAccounts.deletionState, "active"),
        eq(conversations.id, conversationId),
        isNull(conversations.anonymizedAt),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(link);
}

/** El usuario se lee de BD: no aceptar un emailVerified enviado por el cliente. */
export async function linkPatientConversation(
  userId: string,
  conversationId: string,
  signedSeekerToken?: string,
): Promise<boolean> {
  const [accountUser, chat] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { id: true, name: true, email: true, emailVerified: true },
    }),
    db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        isNull(conversations.anonymizedAt),
        isNull(conversations.deletedAt),
      ),
      columns: { id: true, seekerEmail: true },
    }),
  ]);
  if (!accountUser || !chat) return false;
  let verifiedBy: "verified_email" | "seeker_session" | null = null;
  let proofSid: string | null = null;
  if (
    accountUser.emailVerified &&
    chat.seekerEmail &&
    accountUser.email === chat.seekerEmail
  )
    verifiedBy = "verified_email";
  if (!verifiedBy && signedSeekerToken) {
    const token = verifySeekerToken(
      signedSeekerToken,
      getAuthSecret(),
      Date.now(),
    );
    if (token?.conversationId === conversationId) {
      const registration = await db.query.seekerSessions.findFirst({
        where: and(
          eq(seekerSessions.sid, token.sid),
          eq(seekerSessions.conversationId, conversationId),
        ),
        columns: { expiresAt: true, revokedAt: true, role: true },
      });
      if (
        registration &&
        registration.role === "seeker" &&
        !registration.revokedAt &&
        registration.expiresAt.getTime() > Date.now()
      ) {
        verifiedBy = "seeker_session";
        proofSid = token.sid;
      }
    }
  }
  if (!verifiedBy) return false;
  const account = await ensurePatientAccount(accountUser);
  if (account.deletionState !== "active") return false;
  await db.values<
    [string]
  >(sql`INSERT INTO patient_conversation_links (conversation_id,user_id,verified_by,verified_at)
    SELECT c.id,u.id,${verifiedBy},${nowIso()} FROM conversations c JOIN user u ON u.id=${userId} JOIN patient_accounts a ON a.user_id=u.id
    WHERE c.id=${conversationId} AND c.anonymized_at IS NULL AND c.deleted_at IS NULL AND a.deletion_state='active'
      AND ((${verifiedBy}='verified_email' AND u.email_verified=1 AND u.email=c.seeker_email)
        OR (${verifiedBy}='seeker_session' AND EXISTS(SELECT 1 FROM seeker_sessions s WHERE s.sid=${proofSid} AND s.conversation_id=c.id AND s.role='seeker' AND s.revoked_at IS NULL AND s.expires_at > ${Date.now()})))
    ON CONFLICT DO NOTHING RETURNING conversation_id`);
  // Nunca reasignar un chat ya vinculado a otra cuenta, incluso con un token antiguo.
  return hasPatientConversationAccess(userId, conversationId);
}
