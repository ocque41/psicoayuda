"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, user } from "@/db/schema";
import { purgeAccount, reclamarUsuarioHuerfano } from "@/lib/account";
import { isAdminEmail, requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";

export type DeleteMyAccountState = { error: string | null };

function revalidateAccountViews() {
  for (const path of ["/", "/ayuda", "/profesionales", "/admin", "/pro"]) {
    try {
      revalidatePath(path);
    } catch (error) {
      // La cuenta ya se borró. Un fallo de caché no debe convertir una baja
      // real en un mensaje falso de error.
      console.error("account view revalidation failed", { path, error });
    }
  }
}

/**
 * Borra la cuenta y sus datos operativos. Está disponible aunque no haya
 * terminado el onboarding. Solo confirma el éxito después de completar la baja;
 * si D1 falla, mantiene la sesión y muestra un mensaje para reintentar.
 */
export async function deleteMyAccount(
  _previousState: DeleteMyAccountState,
  _formData: FormData,
): Promise<DeleteMyAccountState> {
  const authSession = await getServerSession();
  if (!authSession?.user?.id) redirect("/pro");
  const userId = authSession.user.id;

  // Primero completamos el borrado. Si la base de datos falla, la persona
  // conserva su sesión y puede reintentar; no la dejamos fuera de una cuenta
  // que todavía existe.
  try {
    await purgeAccount(userId);
  } catch (error) {
    console.error("self account deletion failed", { userId, error });
    return {
      error:
        "No pudimos borrar tu cuenta. Sigue activa; inténtalo de nuevo en un momento.",
    };
  }

  revalidateAccountViews();

  // Las filas de sesión ya no existen. Intentamos además limpiar la cookie; si
  // falla, queda inservible y getSession devolverá null igualmente.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // best-effort
  }

  redirect("/pro?cuenta=borrada");
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

  // purgeAccount también devuelve cualquier caso activo a la cola.
  await purgeAccount(target.id);

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: "account_deletion",
    entityType: "user",
    entityId: target.id,
    createdAt: nowIso(),
  });

  revalidateAccountViews();
  redirect("/admin?cuenta=borrada");
}
