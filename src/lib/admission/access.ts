import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getVerifiedServerSession } from "@/lib/privileged-session";
import type { AdmissionReviewer } from "./types";

export function isAdmissionReviewerEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return (
    isAdminEmail(normalized) ||
    (process.env.ADMISSION_REVIEWER_EMAILS || "")
      .split(",")
      .some(
        (item) =>
          item.trim().toLowerCase() === normalized && Boolean(normalized),
      )
  );
}

export async function requireAdmissionReviewer(): Promise<AdmissionReviewer | null> {
  const session = await getVerifiedServerSession();
  const email = session?.user.email?.trim().toLowerCase();
  if (!session?.session?.id || !email || !isAdmissionReviewerEmail(email))
    return null;
  const actor = {
    userId: session.user.id,
    email,
    isAdmin: isAdminEmail(email),
    sessionId: session.session.id,
  };
  const [live] = await db
    .select({ id: user.id })
    .from(user)
    .where(currentAdmissionReviewer(actor))
    .limit(1);
  return live ? actor : null;
}

/** Repeat the current identity inside the write; a cached session is never the write authorization. */
export function currentAdmissionReviewer(actor: AdmissionReviewer) {
  if (!isAdmissionReviewerEmail(actor.email)) return sql`0`;
  if (!actor.sessionId) return sql`0`;
  return sql`EXISTS (SELECT 1 FROM user account JOIN session auth_session ON auth_session.user_id=account.id
    WHERE account.id=${actor.userId} AND lower(account.email)=${actor.email.trim().toLowerCase()} AND account.email_verified=1
      AND auth_session.id=${actor.sessionId}
      AND auth_session.expires_at > cast(unixepoch('subsecond') * 1000 as integer))`;
}

export function pendingAdmissionCandidate(professionalId: string) {
  return sql`EXISTS (SELECT 1 FROM professionals WHERE id=${professionalId} AND status='pending_verification' AND non_clinical_helper=0)`;
}
