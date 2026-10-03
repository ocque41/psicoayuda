"use server";

import { revalidatePath } from "next/cache";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import {
  requireSupportProfessional,
  type SupportFormState,
  writeSupportReply,
} from "@/lib/practice/support";

export async function replyProfessionalSupport(
  _previous: PracticeFormState,
  form: FormData,
): Promise<SupportFormState> {
  try {
    const actor = await requireSupportProfessional();
    if (!actor)
      return {
        ok: false,
        code: "unauthorized",
        message:
          "Tu sesión o perfil ya no tiene acceso al soporte profesional.",
      };
    const state = await writeSupportReply(actor, form);
    if (state?.ok) {
      revalidatePath("/pro/soporte");
      revalidatePath("/admin/operaciones");
      const contactId = String(form.get("contactId") ?? "").trim();
      revalidatePath(`/pro/soporte/${contactId}`);
      revalidatePath(`/admin/operaciones/soporte/${contactId}`);
    }
    return state;
  } catch {
    return {
      ok: false,
      code: "unavailable",
      message:
        "No pudimos guardar tu respuesta. Conserva el texto y vuelve a intentarlo.",
    };
  }
}
