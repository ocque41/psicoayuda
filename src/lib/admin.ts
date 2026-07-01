import "server-only";

import { getFreshServerSession } from "@/lib/auth-server";

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  return Boolean(email && getAdminEmails().includes(email.toLowerCase()));
}

export async function requireAdmin() {
  const session = await getFreshServerSession();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) {
    return null;
  }
  return { session, email: email as string };
}
