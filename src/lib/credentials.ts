import "server-only";

import { and, count, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { account, auditLogs, professionals } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

/**
 * Acciones de auditoría que cuentan para el límite de cambios de credenciales.
 * Es un tope por CUENTA respaldado en D1 (sobrevive a los isolates del Worker,
 * a diferencia del rate limit en memoria de Better Auth, que es por isolate).
 * `email_change` no entra: lo escribe el hook de Better Auth al completarse la
 * verificación, no es un intento del usuario.
 */
export const CREDENTIAL_AUDIT_ACTIONS = [
  "credential_email_request",
  "credential_password_change",
  "credential_phone_change",
] as const;

const CREDENTIAL_WINDOW_MS = 60 * 60 * 1000;
const CREDENTIAL_MAX_PER_WINDOW = 8;

/** Normaliza un correo para comparar (trim + minúsculas), o null si no hay. */
export function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

/**
 * Decide qué columnas del espejo `professionals` hay que sincronizar cuando
 * cambia el correo de la cuenta (changeEmail de Better Auth).
 *
 * - `email` del perfil es la MISMA dirección de la cuenta: siempre se sincroniza.
 * - `contactEmail` (correo de coordinación) solo se mueve si seguía al de la
 *   cuenta; si la persona puso uno distinto a propósito, se respeta.
 *
 * PURA para poder testearla sin base de datos.
 */
export function planProfessionalEmailSync(
  input: {
    professionalEmail: string | null;
    contactEmail: string | null;
  },
  newEmail: string,
): { email: string; contactEmail?: string } | null {
  const destination = normalizeEmail(newEmail);
  const current = normalizeEmail(input.professionalEmail);
  if (!destination || current === destination) return null;

  const contact = normalizeEmail(input.contactEmail);
  const contactFollows = contact !== null && contact === current;
  return {
    email: destination,
    ...(contactFollows ? { contactEmail: destination } : {}),
  };
}

/**
 * Hook `databaseHooks.user.update.after` de Better Auth: cuando se completa un
 * cambio de correo, actualiza el espejo en `professionals` y deja rastro en
 * `audit_logs`. Nunca lanza: un fallo del espejo no debe romper la verificación
 * del correo (Better Auth ya actualizó `user`; reintentar el enlace no es
 * posible porque el token es de un solo uso).
 */
export async function syncProfessionalEmailOnUserUpdate(user: {
  id?: string | null;
  email?: string | null;
}) {
  const userId = user?.id;
  const destination = normalizeEmail(user?.email);
  if (!userId || !destination) return;

  try {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.userId, userId),
      columns: { id: true, email: true, contactEmail: true },
    });
    if (!professional) return;

    const plan = planProfessionalEmailSync(
      {
        professionalEmail: professional.email,
        contactEmail: professional.contactEmail,
      },
      destination,
    );
    if (!plan) return;

    await db
      .update(professionals)
      .set({
        email: plan.email,
        ...(plan.contactEmail ? { contactEmail: plan.contactEmail } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, professional.id));

    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: destination,
      action: "email_change",
      entityType: "professional",
      entityId: professional.id,
      metadata: JSON.stringify({ from: professional.email }),
      createdAt: nowIso(),
    });
  } catch (error) {
    console.error("professional email sync failed", { userId, error });
  }
}

/**
 * ¿La cuenta tiene contraseña propia (provider `credential`)? Las cuentas que
 * solo entran con Google no la tienen: se omiten los pasos que la exigen.
 */
export async function hasCredentialPassword(userId: string) {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Tope de cambios de credenciales por cuenta y hora. Se apoya en `audit_logs`
 * (D1), así que no se reinicia con cada isolate del Worker.
 */
export async function isCredentialChangeRateLimited(actorEmail: string) {
  const since = new Date(Date.now() - CREDENTIAL_WINDOW_MS).toISOString();
  const [row] = await db
    .select({ total: count() })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorEmail, actorEmail),
        inArray(auditLogs.action, [...CREDENTIAL_AUDIT_ACTIONS]),
        gte(auditLogs.createdAt, since),
      ),
    );
  return (row?.total ?? 0) >= CREDENTIAL_MAX_PER_WINDOW;
}

/** Rastro de auditoría de un cambio de credenciales (sin datos sensibles). */
export async function logCredentialAudit(input: {
  actorEmail: string;
  action: (typeof CREDENTIAL_AUDIT_ACTIONS)[number] | "email_change";
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: input.actorEmail,
    action: input.action,
    entityType: "user",
    entityId: input.entityId,
    ...(input.metadata ? { metadata: JSON.stringify(input.metadata) } : {}),
    createdAt: nowIso(),
  });
}

/**
 * Código de error de Better Auth (`APIError`), venga en `body.code` o en la
 * raíz. Puro: sirve para traducir a mensajes humanos en español.
 */
export function credentialErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object") {
    const code = (body as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

/** Mensaje humano para un cambio de contraseña fallido. */
export function translateChangePasswordError(error: unknown): string {
  const code = credentialErrorCode(error);
  if (code === "INVALID_PASSWORD") {
    return "Tu contraseña actual no es correcta.";
  }
  if (code === "PASSWORD_TOO_SHORT") {
    return "La contraseña nueva debe tener al menos 8 caracteres.";
  }
  if (code === "PASSWORD_TOO_LONG") {
    return "La contraseña es demasiado larga (máximo 128 caracteres).";
  }
  if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
    return "Tu cuenta entra con Google, así que no tiene contraseña propia. No necesitas cambiarla aquí.";
  }
  return "No pudimos cambiar tu contraseña. Inténtalo de nuevo en un momento.";
}

/** Mensaje humano para una solicitud de cambio de correo fallida. */
export function translateChangeEmailError(error: unknown): string {
  const code = credentialErrorCode(error);
  if (code === "INVALID_PASSWORD") {
    return "Tu contraseña actual no es correcta.";
  }
  if (code === "CHANGE_EMAIL_DISABLED") {
    return "El cambio de correo no está disponible por ahora. Escríbenos si necesitas actualizarlo.";
  }
  return "No pudimos iniciar el cambio de correo. Inténtalo de nuevo en un momento.";
}
