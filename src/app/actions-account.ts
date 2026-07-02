"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, professionals, user } from "@/db/schema";
import { purgeAccount, reclamarUsuarioHuerfano } from "@/lib/account";
import { isAdminEmail, requireAdmin } from "@/lib/admin";
import { releaseProfessionalAssignments } from "@/lib/assignment";
import { auth } from "@/lib/auth";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";

/**
 * Borra la cuenta del profesional autenticado y todo su rastro. Está disponible
 * aunque no haya terminado el onboarding: `purgeAccount` maneja el caso sin
 * perfil profesional. Cierra la sesión (limpia la cookie) antes de borrar y
 * redirige a la home.
 */
export async function deleteMyAccount() {
  const authSession = await getServerSession();
  if (!authSession?.user?.id) redirect("/pro");
  const userId = authSession.user.id;

  // Cerramos la sesión primero (mientras aún existe) para limpiar la cookie. Si
  // fallara, no pasa nada: al borrar las filas `session` la cookie queda muerta
  // y `getSession` devolverá null.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // best-effort
  }

  await purgeAccount(userId);

  redirect("/");
}

/**
 * Acción pública (sin sesión: quien la necesita no puede iniciarla) que repara
 * un registro huérfano antes de reintentar el alta. Todas las comprobaciones
 * viven en reclamarUsuarioHuerfano; para cualquier cuenta real con credencial,
 * sesión o perfil es un no-op.
 */
export async function repararRegistroHuerfano(emailCrudo: string) {
  const email = String(emailCrudo ?? "").slice(0, 254);
  const reparado = await reclamarUsuarioHuerfano(email);
  return { reparado };
}

/**
 * Permite que una cuenta incluida en ADMIN_EMAILS borre otra cuenta. Las
 * cuentas administradoras están protegidas para evitar perder el acceso al
 * panel por un clic accidental o por un formulario manipulado.
 */
export async function adminDeleteAccount(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect("/admin?cuenta=no-encontrada");

  const target = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { id: true, email: true },
  });

  if (!target) redirect("/admin?cuenta=no-encontrada");
  if (isAdminEmail(target.email)) redirect("/admin?cuenta=protegida");

  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, target.id),
    columns: { id: true },
  });

  // Una baja con casos activos no puede dejar solicitudes huérfanas: primero
  // las devuelve a la cola y revoca las conversaciones/sesiones abiertas.
  if (professional) {
    await releaseProfessionalAssignments(professional.id);
  }

  await purgeAccount(target.id);

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: "account_deletion",
    entityType: "user",
    entityId: target.id,
    createdAt: nowIso(),
  });

  revalidatePath("/admin");
  redirect("/admin?cuenta=borrada");
}
