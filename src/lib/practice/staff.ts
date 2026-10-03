import "server-only";
import { isAdminEmail } from "@/lib/admin";
import { getVerifiedServerSession } from "@/lib/privileged-session";
export async function requirePracticeStaff(
  permission: "support" | "credentials",
) {
  const session = await getVerifiedServerSession();
  const email = session?.user.email?.toLowerCase();
  const allowed = (
    process.env[
      permission === "support" ? "SUPPORT_EMAILS" : "CREDENTIAL_REVIEWER_EMAILS"
    ] || ""
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return email && (isAdminEmail(email) || allowed.includes(email))
    ? { email }
    : null;
}
