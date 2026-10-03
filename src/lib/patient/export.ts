import "server-only";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  patientConversationLinks,
  patientSessionRequests,
} from "@/db/patient-schema";
import {
  carePlans,
  conversations,
  payments,
  practiceAppointments,
  practicePatients,
  practiceReceiptCorrections,
  practiceReceipts,
} from "@/db/schema";
import { effectiveReceiptFields } from "@/lib/practice/receipt-queries";
import { patientAccountForUser } from "./accounts";

/** El vínculo y la cuenta se vuelven a comprobar en cada lote financiero. */
function financialReceiptScope(userId: string) {
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
function publicReceiptReference(reference: SQL<string>) {
  return sql<string>`CASE
    WHEN substr(${reference}, 1, length(${practiceReceipts.professionalId}) + 1) = ${practiceReceipts.professionalId} || ':'
    THEN substr(${reference}, length(${practiceReceipts.professionalId}) + 2)
    ELSE ${reference} END`;
}
/** JSON por lotes: sin cargar todos los historiales en memoria del Worker. */
export async function* patientExportChunks(
  userId: string,
): AsyncGenerator<string> {
  const account = await patientAccountForUser(userId);
  yield `{"version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"account":${JSON.stringify(account || null)}`;
  const scoped = and(
    eq(patientConversationLinks.userId, userId),
    isNull(conversations.anonymizedAt),
    isNull(conversations.deletedAt),
  );
  const receiptScope = financialReceiptScope(userId);
  const sets = [
    {
      key: "conversations",
      query: (offset: number) =>
        db
          .select({
            id: conversations.id,
            professionalId: conversations.professionalId,
            status: conversations.status,
            createdAt: conversations.createdAt,
            lastMessageAt: conversations.lastMessageAt,
          })
          .from(patientConversationLinks)
          .innerJoin(
            conversations,
            eq(conversations.id, patientConversationLinks.conversationId),
          )
          .where(scoped)
          .orderBy(conversations.id)
          .limit(250)
          .offset(offset),
    },
    {
      key: "appointments",
      query: (offset: number) =>
        db
          .select({
            id: practiceAppointments.id,
            startsAt: practiceAppointments.startsAt,
            endsAt: practiceAppointments.endsAt,
            timeZone: practiceAppointments.timeZone,
            status: practiceAppointments.status,
            modality: practiceAppointments.modality,
            priceCents: practiceAppointments.priceCents,
            currency: practiceAppointments.currency,
            cancellationHours: practiceAppointments.cancellationHours,
          })
          .from(practiceAppointments)
          .innerJoin(
            practicePatients,
            eq(practicePatients.id, practiceAppointments.patientId),
          )
          .innerJoin(
            conversations,
            eq(conversations.id, practicePatients.conversationId),
          )
          .innerJoin(
            patientConversationLinks,
            eq(patientConversationLinks.conversationId, conversations.id),
          )
          .where(scoped)
          .orderBy(practiceAppointments.id)
          .limit(250)
          .offset(offset),
    },
    {
      key: "receipts",
      query: (offset: number) =>
        db
          .select({
            id: practiceReceipts.id,
            amountCents: practiceReceipts.amountCents,
            currency: practiceReceipts.currency,
            method: practiceReceipts.method,
            receivedAt: practiceReceipts.receivedAt,
          })
          .from(practiceReceipts)
          .where(receiptScope)
          .orderBy(practiceReceipts.id)
          .limit(250)
          .offset(offset),
    },
    {
      key: "receiptCorrections",
      query: (offset: number) =>
        db
          .select({
            id: practiceReceiptCorrections.id,
            receiptId: practiceReceiptCorrections.receiptId,
            revision: practiceReceiptCorrections.revision,
            kind: practiceReceiptCorrections.kind,
            amountCents: practiceReceiptCorrections.amountCents,
            currency: practiceReceiptCorrections.currency,
            method: practiceReceiptCorrections.method,
            reference: publicReceiptReference(
              sql<string>`${practiceReceiptCorrections.reference}`,
            ),
            receivedAt: practiceReceiptCorrections.receivedAt,
            reason: practiceReceiptCorrections.reason,
            createdAt: practiceReceiptCorrections.createdAt,
          })
          .from(practiceReceiptCorrections)
          .innerJoin(
            practiceReceipts,
            and(
              eq(practiceReceipts.id, practiceReceiptCorrections.receiptId),
              eq(
                practiceReceipts.professionalId,
                practiceReceiptCorrections.professionalId,
              ),
              eq(
                practiceReceipts.patientId,
                practiceReceiptCorrections.patientId,
              ),
            ),
          )
          .where(receiptScope)
          .orderBy(
            practiceReceiptCorrections.receiptId,
            practiceReceiptCorrections.revision,
          )
          .limit(250)
          .offset(offset),
    },
    {
      key: "effectiveExternalReceipts",
      query: (offset: number) =>
        db
          .select({
            id: practiceReceipts.id,
            amountCents: effectiveReceiptFields.amountCents,
            currency: effectiveReceiptFields.currency,
            method: effectiveReceiptFields.method,
            reference: publicReceiptReference(effectiveReceiptFields.reference),
            receivedAt: effectiveReceiptFields.receivedAt,
            revision: effectiveReceiptFields.revision,
            status: effectiveReceiptFields.status,
            recordedAt: effectiveReceiptFields.recordedAt,
          })
          .from(practiceReceipts)
          .where(receiptScope)
          .orderBy(practiceReceipts.id)
          .limit(250)
          .offset(offset),
    },
    {
      key: "agreements",
      query: (offset: number) =>
        db
          .select({
            id: carePlans.id,
            title: carePlans.title,
            sessionsCount: carePlans.sessionsCount,
            durationMinutes: carePlans.durationMinutes,
            priceCents: carePlans.priceCents,
            currency: carePlans.currency,
            interval: carePlans.interval,
            validityDays: carePlans.validityDays,
            status: carePlans.status,
          })
          .from(carePlans)
          .innerJoin(
            practicePatients,
            eq(practicePatients.id, carePlans.patientId),
          )
          .innerJoin(
            conversations,
            eq(conversations.id, practicePatients.conversationId),
          )
          .innerJoin(
            patientConversationLinks,
            eq(patientConversationLinks.conversationId, conversations.id),
          )
          .where(scoped)
          .orderBy(carePlans.id)
          .limit(250)
          .offset(offset),
    },
    {
      key: "cardPayments",
      query: (offset: number) =>
        db
          .select({
            id: payments.id,
            title: payments.packageTitle,
            professionalName: payments.professionalName,
            amountCents: payments.amountCents,
            currency: payments.currency,
            status: payments.status,
            paidAt: payments.paidAt,
          })
          .from(payments)
          .innerJoin(
            conversations,
            eq(conversations.id, payments.conversationId),
          )
          .innerJoin(
            patientConversationLinks,
            eq(patientConversationLinks.conversationId, conversations.id),
          )
          .where(scoped)
          .orderBy(payments.id)
          .limit(250)
          .offset(offset),
    },
    {
      key: "requests",
      query: (offset: number) =>
        db
          .select({
            id: patientSessionRequests.id,
            conversationId: patientSessionRequests.conversationId,
            appointmentId: patientSessionRequests.appointmentId,
            kind: patientSessionRequests.kind,
            status: patientSessionRequests.status,
            preferredStartsAt: patientSessionRequests.preferredStartsAt,
            timezone: patientSessionRequests.timezone,
            createdAt: patientSessionRequests.createdAt,
          })
          .from(patientSessionRequests)
          .where(eq(patientSessionRequests.userId, userId))
          .orderBy(patientSessionRequests.id)
          .limit(250)
          .offset(offset),
    },
  ];
  for (const set of sets) {
    yield `,${JSON.stringify(set.key)}:[`;
    let first = true;
    for (let offset = 0; ; offset += 250) {
      const rows = await set.query(offset);
      for (const row of rows) {
        yield `${first ? "" : ","}${JSON.stringify(row)}`;
        first = false;
      }
      if (rows.length < 250) break;
    }
    yield "]";
  }
  yield ',"messages":"El contenido cifrado de los chats se conserva en las conversaciones. Esta exportación no incluye notas privadas del profesional ni claves de recuperación."}';
}
