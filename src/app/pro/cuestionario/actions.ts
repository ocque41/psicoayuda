"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  currentScreeningCandidate,
  saveScreeningDraft,
  submitScreening,
} from "@/lib/screening/store";

export type ScreeningFormState = {
  ok: boolean;
  message: string;
  questionId?: string;
} | null;

function parseAnswers(form: FormData) {
  try {
    return JSON.parse(String(form.get("answers") || "{}"));
  } catch {
    return {};
  }
}

export async function saveScreeningProgress(
  answers: unknown,
  exclusions?: unknown,
) {
  const pro = await currentScreeningCandidate();
  if (pro?.status !== "pending_verification" || pro.nonClinicalHelper)
    return { ok: false };
  return { ok: await saveScreeningDraft(pro.id, answers, exclusions) };
}

export async function sendScreening(
  _previous: ScreeningFormState,
  form: FormData,
): Promise<ScreeningFormState> {
  const pro = await currentScreeningCandidate();
  if (!pro) redirect("/pro");
  if (pro.status !== "pending_verification" || pro.nonClinicalHelper)
    redirect("/pro/dashboard");
  const result = await submitScreening(
    pro.id,
    parseAnswers(form),
    form.get("exclusions"),
  );
  if (!result.ok) return result;
  revalidatePath("/pro/dashboard");
  redirect("/pro/dashboard?solicitud=enviada");
}
