import "server-only";

import { and, DrizzleQueryError, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  practiceReceiptCorrections,
  practiceReceipts,
  professionals,
  user,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import { moneyCents, paymentMethods } from "./domain";
import { effectiveReceiptFields } from "./receipt-queries";
import { receiptReceivedAt } from "./receipts";

export type ReceiptActor = { professionalId: string; userId: string };
export type ReceiptFormState = {
  ok: boolean;
  message: string;
  code?:
    | "validation"
    | "unauthorized"
    | "not_found"
    | "conflict"
    | "reference_conflict"
    | "unavailable";
  receiptId?: string;
  revision?: number;
} | null;

export async function requireReceiptProfessional(): Promise<ReceiptActor | null> {
  const session = await getServerSession();
  if (!session?.user.id) return null;
  const [actor] = await db
    .select({ professionalId: professionals.id, userId: user.id })
    .from(professionals)
    .innerJoin(user, eq(user.id, professionals.userId))
    .where(
      and(
        eq(user.id, session.user.id),
        eq(professionals.status, "approved"),
        eq(professionals.nonClinicalHelper, false),
      ),
    )
    .limit(1);
  return actor || null;
}
const commonInput = z.object({
  patientId: z.string().trim().min(1).max(200),
  receiptId: z.string().trim().min(1).max(200),
  revision: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER - 1),
  submissionId: z.uuid(),
  reason: z.string().trim().min(3).max(160),
});
const correctionInput = commonInput.extend({
  amount: z.string().regex(/^\d{1,6}([.,]\d{1,2})?$/),
  currency: z.enum(["usd", "eur", "ves"]),
  method: z.enum(paymentMethods),
  reference: z
    .string()
    .trim()
    .max(80)
    .optional()
    .default("")
    .refine((value) => value.length === 0 || value.length >= 3),
  receivedAt: z.string().min(1).max(32),
  receivedTimeZone: z.string().min(1).max(100),
});
function conflict(): ReceiptFormState {
  return {
    ok: false,
    code: "conflict",
    message:
      "Este cobro cambió en otra ventana. Conserva los datos y actualiza su historial antes de volver a enviarlos.",
  };
}
function retryResult(
  existing: typeof practiceReceiptCorrections.$inferSelect,
  actor: ReceiptActor,
  payload: string,
): ReceiptFormState {
  return existing.professionalId === actor.professionalId &&
    existing.authorUserId === actor.userId &&
    existing.submissionPayload === payload
    ? {
        ok: true,
        message: "El cambio ya estaba guardado.",
        receiptId: existing.receiptId,
        revision: existing.revision,
      }
    : conflict();
}
function existingSubmission(submissionId: string) {
  return db.query.practiceReceiptCorrections.findFirst({
    where: eq(practiceReceiptCorrections.submissionId, submissionId),
  });
}
function databaseErrorMessage(error: unknown): string {
  let cause = error;
  // El error de Drizzle contiene SQL y parámetros; solo clasificamos la causa.
  for (let depth = 0; depth < 8; depth++) {
    if (!(cause instanceof Error)) return "";
    if (cause.cause instanceof Error) {
      cause = cause.cause;
      continue;
    }
    return cause instanceof DrizzleQueryError ? "" : cause.message;
  }
  return "";
}
function actorScope(actor: ReceiptActor) {
  return sql`EXISTS (SELECT 1 FROM professionals AS professional JOIN user AS actor ON actor.id = professional.user_id
    WHERE professional.id = practice_receipts.professional_id AND professional.id = ${actor.professionalId}
      AND actor.id = ${actor.userId} AND professional.status = 'approved' AND professional.non_clinical_helper = 0)`;
}
async function currentReceipt(
  actor: ReceiptActor,
  patientId: string,
  receiptId: string,
) {
  const [receipt] = await db
    .select({
      id: practiceReceipts.id,
      patientId: practiceReceipts.patientId,
      ...effectiveReceiptFields,
      program: sql<string>`(SELECT program FROM practice_patients WHERE id = practice_receipts.patient_id AND professional_id = practice_receipts.professional_id)`,
      timeZone: sql<string>`coalesce((SELECT time_zone FROM practice_settings WHERE professional_id = practice_receipts.professional_id), 'America/Caracas')`,
    })
    .from(practiceReceipts)
    .where(
      and(
        eq(practiceReceipts.id, receiptId),
        eq(practiceReceipts.patientId, patientId),
        eq(practiceReceipts.professionalId, actor.professionalId),
        actorScope(actor),
      ),
    )
    .limit(1);
  return receipt;
}
/** Snapshot y auditoría comparten un batch; CAS y triggers protegen también carreras. */
export async function writeReceiptChange(
  actor: ReceiptActor,
  kind: "corrected" | "voided",
  form: FormData,
): Promise<ReceiptFormState> {
  // No aceptar revision vacía como cero mediante la coerción de Zod.
  if (
    typeof form.get("revision") !== "string" ||
    !/^\d+$/.test(String(form.get("revision")))
  )
    return {
      ok: false,
      code: "validation",
      message: "Actualiza el cobro antes de cambiarlo.",
    };
  const parsed = (
    kind === "corrected" ? correctionInput : commonInput
  ).safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      code: "validation",
      message:
        "Revisa los datos del cobro y escribe un motivo operativo de 3 a 160 caracteres, sin información clínica.",
    };
  const input = parsed.data;
  const correction = kind === "corrected" ? correctionInput.parse(input) : null;
  if (correction && moneyCents(correction.amount) <= 0)
    return {
      ok: false,
      code: "validation",
      message:
        "El importe debe ser mayor que cero. Para retirar un registro usa Anular.",
    };
  const payload = JSON.stringify({
    kind,
    ...input,
    ...(correction ? { amount: moneyCents(correction.amount) } : {}),
  });
  try {
    const receipt = await currentReceipt(
      actor,
      input.patientId,
      input.receiptId,
    );
    if (!receipt)
      return {
        ok: false,
        code: "not_found",
        message: "Este cobro no está disponible para tu cuenta.",
      };
    if (receipt.program !== "general")
      return {
        ok: false,
        code: "validation",
        message: "La ayuda por el terremoto no permite cobros.",
      };
    const existing = await existingSubmission(input.submissionId);
    if (existing) return retryResult(existing, actor, payload);
    if (receipt.revision !== input.revision) return conflict();
    if (kind === "voided" && receipt.status === "voided")
      return {
        ok: false,
        code: "validation",
        message: "Este registro ya está anulado. Actualiza su historial.",
      };
    if (correction && correction.receivedTimeZone !== receipt.timeZone)
      return {
        ok: false,
        code: "validation",
        message:
          "La zona horaria de tu consulta cambió. Actualiza la página y revisa la fecha del pago.",
      };
    const date = correction
      ? receiptReceivedAt(correction.receivedAt, receipt.timeZone, Date.now())
      : { ok: true as const, iso: receipt.receivedAt };
    if (!date.ok)
      return { ok: false, code: "validation", message: date.message };
    const snapshot = {
      amountCents: correction ? moneyCents(correction.amount) : 0,
      currency: correction?.currency || receipt.currency,
      method: correction?.method || receipt.method,
      reference: correction?.reference
        ? `${actor.professionalId}:${correction.reference}`
        : receipt.reference,
      receivedAt: date.iso,
    };
    const eventId = newId("receipt_change");
    const timestamp = nowIso();
    const [saved] = await db.batch([
      db.all(sql`INSERT INTO practice_receipt_corrections
        (id, receipt_id, professional_id, patient_id, revision, expected_revision, kind, amount_cents, currency, method, reference, received_at, reason, author_user_id, submission_id, submission_payload, created_at)
        SELECT ${eventId}, practice_receipts.id, practice_receipts.professional_id, practice_receipts.patient_id,
          ${input.revision + 1}, ${input.revision}, ${kind}, ${snapshot.amountCents}, ${snapshot.currency}, ${snapshot.method}, ${snapshot.reference}, ${snapshot.receivedAt}, ${input.reason}, ${actor.userId}, ${input.submissionId}, ${payload}, ${timestamp}
        FROM practice_receipts
        WHERE practice_receipts.id = ${input.receiptId} AND practice_receipts.patient_id = ${input.patientId}
          AND practice_receipts.professional_id = ${actor.professionalId} AND ${actorScope(actor)}
          AND EXISTS (SELECT 1 FROM practice_patients WHERE id = practice_receipts.patient_id AND professional_id = practice_receipts.professional_id AND program = 'general')
          AND ${effectiveReceiptFields.revision} = ${input.revision}
          AND ${correction ? sql`coalesce((SELECT time_zone FROM practice_settings WHERE professional_id = practice_receipts.professional_id), 'America/Caracas') = ${correction.receivedTimeZone}` : sql`1 = 1`}
          AND NOT EXISTS (SELECT 1 FROM practice_receipt_corrections WHERE submission_id = ${input.submissionId})
        RETURNING id`),
      db.run(sql`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, metadata, created_at)
        SELECT ${newId("log")}, actor.email, ${kind === "corrected" ? "external_receipt_corrected" : "external_receipt_voided"}, 'practice', ${input.receiptId},
          ${JSON.stringify({ eventId, revision: input.revision + 1, kind })}, ${timestamp}
        FROM user AS actor WHERE actor.id = ${actor.userId} AND EXISTS (SELECT 1 FROM practice_receipt_corrections WHERE id = ${eventId})`),
    ]);
    if (!saved.length) {
      const retried = await existingSubmission(input.submissionId);
      if (retried) return retryResult(retried, actor, payload);
      return conflict();
    }
    return {
      ok: true,
      message:
        kind === "voided"
          ? "Registro anulado. Su historial permanece disponible."
          : "Corrección guardada. El registro original permanece en el historial.",
      receiptId: receipt.id,
      revision: input.revision + 1,
    };
  } catch (error) {
    const message = databaseErrorMessage(error);
    if (
      message.includes("receipt_reference_conflict") ||
      message.includes("UNIQUE constraint failed: practice_receipts.reference")
    )
      return {
        ok: false,
        code: "reference_conflict",
        message:
          "Esa referencia ya pertenece a otro cobro de tu consulta. Revisa el justificante o conserva la referencia actual.",
      };
    if (message.includes("receipt_correction_conflict")) return conflict();
    // Un índice único puede resolver la carrera antes de nuestro NOT EXISTS.
    if (
      message.includes(
        "UNIQUE constraint failed: practice_receipt_corrections.submission_id",
      )
    ) {
      try {
        const retried = await existingSubmission(input.submissionId);
        if (retried) return retryResult(retried, actor, payload);
      } catch {
        // La reconciliación puede fallar también; conservar el mismo UUID permite reintentar.
      }
    }
    return {
      ok: false,
      code: "unavailable",
      message:
        "No pudimos confirmar el cambio. Conserva los datos y vuelve a intentar el mismo envío.",
    };
  }
}
