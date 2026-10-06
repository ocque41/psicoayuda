"use server";

import { revalidatePath } from "next/cache";
import { requireWaitlistAdmin } from "@/lib/admin-waitlist/access";
import { saveGeneralWaitlistStatus } from "@/lib/admin-waitlist/mutations";
import type { WaitlistFormState } from "@/lib/admin-waitlist/types";

export async function updateGeneralWaitlistStatus(
  _previous: WaitlistFormState,
  form: FormData,
): Promise<WaitlistFormState> {
  try {
    const actor = await requireWaitlistAdmin();
    if (!actor)
      return {
        ok: false,
        code: "unauthorized",
        message: "Esta lista requiere una cuenta verificada de administración.",
      };
    const result = await saveGeneralWaitlistStatus(actor, form);
    if (result.ok) {
      try {
        revalidatePath("/admin/lista-de-espera");
      } catch {
        return {
          ...result,
          message: `${result.message} Vuelve a abrir la lista para ver el cambio.`,
        };
      }
    }
    return result;
  } catch {
    return {
      ok: false,
      code: "unavailable",
      message:
        "No pudimos acceder a la lista. Conserva la ficha abierta y vuelve a intentarlo.",
    };
  }
}
