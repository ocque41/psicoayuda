"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { purgeAccount } from "@/lib/account";
import { auth } from "@/lib/auth";
import { getFreshServerSession } from "@/lib/auth-server";

/**
 * Borra la cuenta del profesional autenticado y todo su rastro. Está disponible
 * aunque no haya terminado el onboarding: `purgeAccount` maneja el caso sin
 * perfil profesional. Cierra la sesión (limpia la cookie) antes de borrar y
 * redirige a la home.
 */
export async function deleteMyAccount() {
  const authSession = await getFreshServerSession();
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
