import "server-only";

import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { practiceReceiptCorrections, practiceReceipts } from "@/db/schema";
import { receiptRecordedAt } from "./receipt-history";

// Las columnas cualificadas son necesarias en selecciones de una sola tabla:
// Drizzle puede eliminar el prefijo de una columna interpolada.
function effective<T>(column: string) {
  return sql<T>`coalesce((SELECT ${sql.raw(column)} FROM practice_receipt_corrections WHERE receipt_id = practice_receipts.id ORDER BY revision DESC LIMIT 1), ${sql.raw(`practice_receipts.${column}`)})`;
}
export const effectiveReceiptFields = {
  amountCents: effective<number>("amount_cents"),
  currency: effective<string>("currency"),
  method: effective<string>("method"),
  reference: effective<string>("reference"),
  receivedAt: effective<string>("received_at"),
  revision: sql<number>`coalesce((SELECT max(revision) FROM practice_receipt_corrections WHERE receipt_id = practice_receipts.id), 0)`,
  status: sql<
    "recorded" | "corrected" | "voided"
  >`coalesce((SELECT kind FROM practice_receipt_corrections WHERE receipt_id = practice_receipts.id ORDER BY revision DESC LIMIT 1), 'recorded')`,
  recordedAt: receiptRecordedAt,
};
export type EffectiveReceipt = typeof practiceReceipts.$inferSelect & {
  revision: number;
  status: "recorded" | "corrected" | "voided";
  recordedAt: string | null;
};
const receiptSelection = {
  id: practiceReceipts.id,
  professionalId: practiceReceipts.professionalId,
  patientId: practiceReceipts.patientId,
  ...effectiveReceiptFields,
};
export type ReceiptQueryFilters = {
  startsAt?: string;
  endsAt?: string;
  currency?: "usd" | "eur" | "ves";
};
function pagination(page: number, total: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page: Math.min(Math.max(1, Math.trunc(page) || 1), pages),
    pages,
  };
}
export async function readPracticeReceiptPage(
  professionalId: string,
  patientId?: string,
  requestedPage = 1,
  requestedPageSize = 25,
  filters: ReceiptQueryFilters = {},
) {
  const pageSize = Math.min(
    Math.max(1, Math.trunc(requestedPageSize) || 25),
    25,
  );
  const scope = and(
    eq(practiceReceipts.professionalId, professionalId),
    patientId ? eq(practiceReceipts.patientId, patientId) : undefined,
    filters.startsAt
      ? sql`${effectiveReceiptFields.receivedAt} >= ${filters.startsAt}`
      : undefined,
    filters.endsAt
      ? sql`${effectiveReceiptFields.receivedAt} < ${filters.endsAt}`
      : undefined,
    filters.currency
      ? sql`${effectiveReceiptFields.currency} = ${filters.currency}`
      : undefined,
  );
  const [aggregate] = await db
    .select({ total: count() })
    .from(practiceReceipts)
    .where(scope);
  const total = aggregate?.total || 0;
  const { page, pages } = pagination(requestedPage, total, pageSize);
  const rows = await db
    .select(receiptSelection)
    .from(practiceReceipts)
    .where(scope)
    .orderBy(desc(effectiveReceiptFields.receivedAt), desc(practiceReceipts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total, page, pages };
}
/** Historial paginado, sin correos ni identificadores de cuentas en el DTO. */
async function readHistory(
  professionalId: string,
  patientId: string,
  receiptId: string,
  requestedPage = 1,
  receiptGuard?: SQL,
  eventGuard?: SQL,
) {
  const [original] = await db
    .select({
      id: practiceReceipts.id,
      amountCents: practiceReceipts.amountCents,
      currency: practiceReceipts.currency,
      method: practiceReceipts.method,
      reference: practiceReceipts.reference,
      receivedAt: practiceReceipts.receivedAt,
      recordedAt: receiptRecordedAt,
    })
    .from(practiceReceipts)
    .where(
      and(
        eq(practiceReceipts.id, receiptId),
        eq(practiceReceipts.professionalId, professionalId),
        eq(practiceReceipts.patientId, patientId),
        receiptGuard,
      ),
    )
    .limit(1);
  if (!original) return null;
  const [current] = await db
    .select(receiptSelection)
    .from(practiceReceipts)
    .where(
      and(
        eq(practiceReceipts.id, receiptId),
        eq(practiceReceipts.professionalId, professionalId),
        eq(practiceReceipts.patientId, patientId),
        receiptGuard,
      ),
    )
    .limit(1);
  if (!current) return null;
  const scope = and(
    eq(practiceReceiptCorrections.receiptId, receiptId),
    eq(practiceReceiptCorrections.professionalId, professionalId),
    eq(practiceReceiptCorrections.patientId, patientId),
    eventGuard,
  );
  const [aggregate] = await db
    .select({ total: count() })
    .from(practiceReceiptCorrections)
    .where(scope);
  const total = aggregate?.total || 0;
  const { page, pages } = pagination(requestedPage, total, 25);
  const events = await db
    .select({
      id: practiceReceiptCorrections.id,
      revision: practiceReceiptCorrections.revision,
      kind: practiceReceiptCorrections.kind,
      amountCents: practiceReceiptCorrections.amountCents,
      currency: practiceReceiptCorrections.currency,
      method: practiceReceiptCorrections.method,
      reference: practiceReceiptCorrections.reference,
      receivedAt: practiceReceiptCorrections.receivedAt,
      reason: practiceReceiptCorrections.reason,
      createdAt: practiceReceiptCorrections.createdAt,
      authorAvailable:
        sql<boolean>`${practiceReceiptCorrections.authorUserId} IS NOT NULL`.mapWith(
          Boolean,
        ),
    })
    .from(practiceReceiptCorrections)
    .where(scope)
    .orderBy(desc(practiceReceiptCorrections.revision))
    .limit(25)
    .offset((page - 1) * 25);
  return { original, current, events, total, page, pages };
}
export async function readReceiptHistory(
  professionalId: string,
  patientId: string,
  receiptId: string,
  page = 1,
) {
  return readHistory(professionalId, patientId, receiptId, page);
}
function patientReceiptScope(userId: string) {
  return sql`EXISTS (
    SELECT 1 FROM practice_patients AS patient
    JOIN conversations AS conversation ON conversation.id = patient.conversation_id AND conversation.professional_id = patient.professional_id
    JOIN patient_conversation_links AS link ON link.conversation_id = conversation.id
    JOIN patient_accounts AS account ON account.user_id = link.user_id AND account.deletion_state = 'active'
    WHERE patient.id = practice_receipts.patient_id AND patient.professional_id = practice_receipts.professional_id
      AND patient.program = 'general' AND link.user_id = ${userId}
      AND link.verified_by IN ('verified_email', 'seeker_session') AND length(link.verified_at) > 0
      AND conversation.deleted_at IS NULL AND conversation.anonymized_at IS NULL
  )`;
}
/** La sesión paciente aporta userId; su ficha/cuenta/vínculo se verifican en SQL. */
export async function readPatientReceiptHistory(
  userId: string,
  receiptId: string,
  page = 1,
) {
  const guard = patientReceiptScope(userId);
  const [receipt] = await db
    .select({
      professionalId: practiceReceipts.professionalId,
      patientId: practiceReceipts.patientId,
    })
    .from(practiceReceipts)
    .where(and(eq(practiceReceipts.id, receiptId), guard))
    .limit(1);
  if (!receipt) return null;
  return readHistory(
    receipt.professionalId,
    receipt.patientId,
    receiptId,
    page,
    guard,
    sql`EXISTS (SELECT 1 FROM practice_receipts WHERE practice_receipts.id = practice_receipt_corrections.receipt_id AND ${guard})`,
  );
}
/** Suma exclusivamente la última revisión, agrupada por moneda y fecha efectiva. */
export async function receiptTotals(
  professionalId: string,
  scope: ReceiptQueryFilters & { patientId?: string } = {},
) {
  return db
    .select({
      currency: effectiveReceiptFields.currency,
      amountCents:
        sql<number>`sum(${effectiveReceiptFields.amountCents})`.mapWith(Number),
    })
    .from(practiceReceipts)
    .where(
      and(
        eq(practiceReceipts.professionalId, professionalId),
        scope.patientId
          ? eq(practiceReceipts.patientId, scope.patientId)
          : undefined,
        sql`${effectiveReceiptFields.status} <> 'voided'`,
        scope.currency
          ? sql`${effectiveReceiptFields.currency} = ${scope.currency}`
          : undefined,
        scope.startsAt
          ? sql`${effectiveReceiptFields.receivedAt} >= ${scope.startsAt}`
          : undefined,
        scope.endsAt
          ? sql`${effectiveReceiptFields.receivedAt} < ${scope.endsAt}`
          : undefined,
      ),
    )
    .groupBy(effectiveReceiptFields.currency)
    .orderBy(effectiveReceiptFields.currency);
}
