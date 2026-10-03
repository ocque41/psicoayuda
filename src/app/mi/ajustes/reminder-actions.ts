"use server";
import { revalidatePath } from "next/cache";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { requirePatientAccount } from "@/lib/patient/access";
import { saveReminderPreferences } from "@/lib/practice/reminder-preferences";

export async function savePatientReminders(
  _: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const { account } = await requirePatientAccount();
  const result = await saveReminderPreferences(account.userId, "patient", form);
  if (result.ok) revalidatePath("/mi/ajustes");
  return result;
}
