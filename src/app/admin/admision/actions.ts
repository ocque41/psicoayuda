"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmissionReviewer } from "@/lib/admission/access";
import {
  configureAdmissionStages,
  moveAdmissionStage,
  publishAdmissionCandidate,
  saveAdmissionReview,
  saveAdmissionScope,
} from "@/lib/admission/mutations";
import type {
  AdmissionFormState,
  AdmissionReviewer,
} from "@/lib/admission/types";

async function reviewedMutation(
  form: FormData,
  mutation: (
    actor: AdmissionReviewer,
    form: FormData,
  ) => Promise<AdmissionFormState>,
) {
  const actor = await requireAdmissionReviewer();
  if (!actor)
    return {
      ok: false,
      code: "unauthorized",
      message:
        "Este espacio requiere una cuenta verificada con acceso a admisión.",
    } satisfies AdmissionFormState;
  const state = await mutation(actor, form);
  if (state.ok) {
    try {
      revalidatePath("/admin", "layout");
      revalidatePath("/pro", "layout");
      if (
        mutation === publishAdmissionCandidate ||
        mutation === saveAdmissionScope
      ) {
        revalidatePath("/");
        revalidatePath("/profesionales");
        revalidatePath("/orientacion");
        revalidateTag("professionals", { expire: 0 });
      }
    } catch {
      return {
        ...state,
        message: `${state.message} La actualización de las vistas puede tardar; vuelve a abrirlas para comprobar el estado guardado.`,
      };
    }
  }
  return state;
}

export async function saveReview(
  _previous: AdmissionFormState,
  form: FormData,
) {
  return reviewedMutation(form, saveAdmissionReview);
}
export async function saveScope(_previous: AdmissionFormState, form: FormData) {
  return reviewedMutation(form, saveAdmissionScope);
}
export async function moveStage(_previous: AdmissionFormState, form: FormData) {
  return reviewedMutation(form, moveAdmissionStage);
}
export async function publish(_previous: AdmissionFormState, form: FormData) {
  return reviewedMutation(form, publishAdmissionCandidate);
}
export async function configure(_previous: AdmissionFormState, form: FormData) {
  return reviewedMutation(form, configureAdmissionStages);
}
