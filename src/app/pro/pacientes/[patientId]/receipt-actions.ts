"use server";

import { revalidatePath } from "next/cache";
import {
  type ReceiptFormState,
  requireReceiptProfessional,
  writeReceiptChange,
} from "@/lib/practice/receipt-write";

export type { ReceiptFormState } from "@/lib/practice/receipt-write";

async function changeReceipt(
  kind: "corrected" | "voided",
  form: FormData,
): Promise<ReceiptFormState> {
  const actor = await requireReceiptProfessional();
  if (!actor)
    return {
      ok: false,
      code: "unauthorized",
      message:
        "Entra con la cuenta profesional dueña de este cobro para cambiarlo.",
    };
  const result = await writeReceiptChange(actor, kind, form);
  if (result?.ok && result.receiptId) {
    revalidatePath(`/pro/pacientes/${String(form.get("patientId"))}`);
    revalidatePath("/pro/consulta");
    revalidatePath("/pro/cobros");
    revalidatePath(
      `/pro/pacientes/${String(form.get("patientId"))}/cobros/${result.receiptId}`,
    );
    revalidatePath("/mi");
    revalidatePath("/mi/pagos");
    revalidatePath(`/mi/pagos/${result.receiptId}`);
  }
  return result;
}
export async function correctReceipt(
  _previous: ReceiptFormState,
  form: FormData,
): Promise<ReceiptFormState> {
  return changeReceipt("corrected", form);
}
export async function voidReceipt(
  _previous: ReceiptFormState,
  form: FormData,
): Promise<ReceiptFormState> {
  return changeReceipt("voided", form);
}
