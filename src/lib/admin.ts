import "server-only";

import { getServerSession } from "@/lib/auth-server";

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  return Boolean(email && getAdminEmails().includes(email.toLowerCase()));
}

/**
 * Destinatarios del aviso de errores. `ERROR_ALERT_EMAILS` (lista separada por
 * comas) manda; si está vacío cae a los admins de `ADMIN_EMAILS`.
 */
export function getErrorAlertEmails() {
  const list = (process.env.ERROR_ALERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : getAdminEmails();
}

/**
 * Destinatarios del aviso de alianzas (formulario /alianzas).
 * `ALLIANCES_CONTACT_EMAIL` (lista separada por comas) manda; si está vacío cae a
 * los admins de `ADMIN_EMAILS`. Así el aviso llega a los admins sin tocar env de
 * prod (ADMIN_EMAILS ya está configurado).
 */
export function getAllianceRecipients() {
  const list = (process.env.ALLIANCES_CONTACT_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : getAdminEmails();
}

export async function requireAdmin() {
  const session = await getServerSession();
  const email = session?.user?.email;
  if (!isAdminEmail(email)) {
    return null;
  }
  return { session, email: email as string };
}
