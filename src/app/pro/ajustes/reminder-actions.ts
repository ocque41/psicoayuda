"use server";
import { revalidatePath } from "next/cache";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { saveReminderPreferences } from "@/lib/practice/reminder-preferences";

export async function saveProfessionalReminders(
  _: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const result = await saveReminderPreferences(
    pro.userId,
    "professional",
    form,
  );
  if (result.ok) revalidatePath("/pro/ajustes");
  return result;
}
