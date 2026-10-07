"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accountOnboardingDrafts, accountRolePreferences } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import {
  type OnboardingRole,
  persistOnboardingDraft,
} from "@/lib/onboarding/drafts";
import { completePatientOnboarding } from "@/lib/patient/accounts";

export type OnboardingResult = { ok: boolean; message: string } | null;

export async function chooseAccountRole(
  _previous: OnboardingResult,
  form: FormData,
): Promise<OnboardingResult> {
  const session = await getServerSession();
  if (!session?.user.id)
    return { ok: false, message: "Entra en tu cuenta para continuar." };
  const role = form.get("role");
  if (role !== "patient" && role !== "pro")
    return { ok: false, message: "Elige el espacio que quieres crear." };
  await db
    .insert(accountRolePreferences)
    .values({
      userId: session.user.id,
      role,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: accountRolePreferences.userId,
      set: { role, updatedAt: new Date().toISOString() },
    });
  redirect(role === "patient" ? "/empezar/paciente" : "/pro/onboarding");
}

export async function saveOnboardingDraft(
  role: OnboardingRole,
  input: unknown,
  expectedOwnerId: string,
): Promise<OnboardingResult> {
  const session = await getServerSession();
  if (!session?.user.id)
    return {
      ok: false,
      message: "Tu sesión terminó. Entra de nuevo para guardar.",
    };
  // El dueño del formulario no autoriza: debe coincidir con la sesión fresca
  // de esta acción. Una cola antigua nunca adopta al nuevo usuario de la cookie.
  if (
    typeof expectedOwnerId !== "string" ||
    expectedOwnerId !== session.user.id
  )
    return {
      ok: false,
      message:
        "Tu sesión cambió. Vuelve a abrir este recorrido para continuar.",
    };
  if (role !== "patient" && role !== "pro")
    return { ok: false, message: "No pudimos identificar el recorrido." };
  try {
    await persistOnboardingDraft(session.user.id, role, input);
    return { ok: true, message: "Progreso guardado en tu cuenta." };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos guardar el progreso. Conserva esta ventana abierta e intenta de nuevo.",
    };
  }
}

export async function finishPatientOnboarding(
  _previous: OnboardingResult,
  form: FormData,
): Promise<OnboardingResult> {
  const session = await getServerSession();
  if (!session?.user.id)
    return {
      ok: false,
      message: "Tu sesión terminó. Entra de nuevo para continuar.",
    };
  if (form.get("privacyAccepted") !== "on")
    return {
      ok: false,
      message:
        "Confirma que leíste cómo se utilizan tus datos antes de continuar.",
    };
  if (form.get("ageBand") !== "adult" && form.get("ageBand") !== "guardian")
    return {
      ok: false,
      message:
        "Indica si el espacio es para ti o si acompañas como representante.",
    };
  try {
    await completePatientOnboarding(session.user.id, {
      displayName: String(form.get("displayName") ?? ""),
      country: String(form.get("country") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
      preferredLanguage: String(form.get("preferredLanguage") ?? "es"),
      ageBand: String(form.get("ageBand")) as "adult" | "guardian",
    });
    // Solo después de confirmar el perfil persistido eliminamos el borrador.
    await db
      .delete(accountOnboardingDrafts)
      .where(
        and(
          eq(accountOnboardingDrafts.userId, session.user.id),
          eq(accountOnboardingDrafts.role, "patient"),
        ),
      );
  } catch {
    return {
      ok: false,
      message:
        "No pudimos confirmar el guardado. Revisa nombre, país y zona horaria e intenta de nuevo.",
    };
  }
  revalidatePath("/mi");
  redirect("/mi");
}
