"use server";

import { revalidatePath } from "next/cache";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { requireAdmin } from "@/lib/admin";
import {
  migrateToSubscription,
  PlanMigrationError,
  resendPaymentEmail,
  revertToLegacy,
} from "@/lib/practice/plan-migration";

const denied = {
  ok: false,
  message: "Solo la administración general puede cambiar planes.",
};
function failure(error: unknown): PracticeFormState {
  return {
    ok: false,
    message:
      error instanceof PlanMigrationError
        ? error.message
        : "No pudimos completar el cambio. Reintenta en un momento.",
  };
}

export async function migrateOne(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  if (!(await requireAdmin())) return denied;
  const id = String(form.get("professionalId") || "");
  try {
    const result = await migrateToSubscription([id]);
    revalidatePath("/admin/planes");
    return result.moved
      ? {
          ok: true,
          message:
            "Perfil pasado a suscripción. Verá la prueba y el botón de pago en su panel.",
        }
      : {
          ok: false,
          message:
            "Este perfil ya no estaba en el plan anterior o es del equipo (gratuito).",
        };
  } catch (error) {
    return failure(error);
  }
}

export async function migrateAll(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  if (!(await requireAdmin())) return denied;
  if (form.get("confirm") !== "on")
    return {
      ok: false,
      message: "Confirma que quieres pasar a todos los perfiles anteriores.",
    };
  try {
    const result = await migrateToSubscription("all");
    revalidatePath("/admin/planes");
    return {
      ok: true,
      message: `${result.moved} perfiles pasados a suscripción. Verán la prueba y el botón de pago en su panel; el equipo sigue gratis.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function resendOne(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  if (!(await requireAdmin())) return denied;
  try {
    const sent = await resendPaymentEmail(
      String(form.get("professionalId") || ""),
    );
    return sent
      ? { ok: true, message: "Correo reenviado." }
      : {
          ok: false,
          message:
            "No se envió: el perfil ya tiene plan vigente o el proveedor de correo no respondió.",
        };
  } catch (error) {
    return failure(error);
  }
}

export async function revertOne(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  if (!(await requireAdmin())) return denied;
  const done = await revertToLegacy(String(form.get("professionalId") || ""));
  revalidatePath("/admin/planes");
  return done
    ? {
        ok: true,
        message: "Perfil devuelto al acceso anterior, sin suscripción.",
      }
    : { ok: false, message: "No encontramos ese perfil aprobado." };
}
