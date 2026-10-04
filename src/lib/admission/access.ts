import "server-only";
import { sql } from "drizzle-orm";
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
  if (!session || !email || !isAdmissionReviewerEmail(email)) return null;
  return { userId: session.user.id, email, isAdmin: isAdminEmail(email) };
}

/** Repeat the current identity inside the write; a cached session is never the write authorization. */
export function currentAdmissionReviewer(actor: AdmissionReviewer) {
  if (!isAdmissionReviewerEmail(actor.email)) return sql`0`;
  return sql`EXISTS (SELECT 1 FROM user WHERE id=${actor.userId} AND lower(email)=${actor.email.trim().toLowerCase()} AND email_verified=1)`;
}

export function pendingAdmissionCandidate(professionalId: string) {
  return sql`EXISTS (SELECT 1 FROM professionals WHERE id=${professionalId} AND status='pending_verification' AND non_clinical_helper=0)`;
}
