import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import {
  conversations,
  practicePatients,
  practiceReceiptCorrections,
  practiceReceipts,
  professionals,
  user,
} from "@/db/schema";
import { patientExportChunks } from "@/lib/patient/export";

const P = "test-patient-receipt-export";
const iso = "2026-01-15T14:00:00.000Z";
type ExportData = {
  version: number;
  receipts: Record<string, unknown>[];
  receiptCorrections: Record<string, unknown>[];
  effectiveExternalReceipts: Record<string, unknown>[];
};
async function exportData(userId = `${P}-patient-user`) {
  let json = "";
  for await (const part of patientExportChunks(userId)) json += part;
  return { json, data: JSON.parse(json) as ExportData };
}
function change(
  revision: number,
  suffix = "",
  kind: "corrected" | "voided" = "corrected",
) {
  return db.insert(practiceReceiptCorrections).values({
    id: `${P}-event${suffix}-${revision}`,
    receiptId: `${P}-receipt${suffix}`,
    professionalId: `${P}-pro${suffix}`,
    patientId: `${P}-record${suffix}`,
    revision,
    expectedRevision: revision - 1,
    kind,
    amountCents: kind === "voided" ? 0 : 3000 + revision,
    currency: "eur",
    method: "transfer",
    reference: `${P}-pro${suffix}:REF-${revision}`,
    receivedAt: "2026-01-16T14:00:00.000Z",
    reason: `Justificante revisado ${revision}`,
    authorUserId: `${P}-author${suffix}`,
    submissionId: crypto.randomUUID(),
    submissionPayload: JSON.stringify({ internal: "payload-privado-ficticio" }),
    createdAt: iso,
  });
}
async function cleanup() {
  await db
    .delete(practiceReceiptCorrections)
    .where(like(practiceReceiptCorrections.id, `${P}%`));
  await db.delete(practiceReceipts).where(like(practiceReceipts.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
beforeEach(async () => {
  await cleanup();
  for (const suffix of ["", "-other"]) {
    for (const role of ["author", "patient-user"]) {
      await db.insert(user).values({
        id: `${P}-${role}${suffix}`,
        name: "Cuenta ficticia",
        email: `${P}-${role}${suffix}@example.test`,
      });
    }
    await db.insert(professionals).values({
      id: `${P}-pro${suffix}`,
      userId: `${P}-author${suffix}`,
      email: `${P}-author${suffix}@example.test`,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: "[]",
      supportAreas: "[]",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(patientAccounts).values({
      userId: `${P}-patient-user${suffix}`,
      displayName: "Persona ficticia",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values({
      id: `${P}-chat${suffix}`,
      professionalId: `${P}-pro${suffix}`,
      seekerSid: `${P}-session${suffix}`,
      seekerEmail: `${P}-patient-user${suffix}@example.test`,
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(practicePatients).values({
      id: `${P}-record${suffix}`,
      professionalId: `${P}-pro${suffix}`,
      conversationId: `${P}-chat${suffix}`,
      name: "Persona ficticia",
      email: `${P}-patient-user${suffix}@example.test`,
      country: "Venezuela",
      consentAt: iso,
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(patientConversationLinks).values({
      userId: `${P}-patient-user${suffix}`,
      conversationId: `${P}-chat${suffix}`,
      verifiedBy: "verified_email",
      verifiedAt: iso,
    });
    await db.insert(practiceReceipts).values({
      id: `${P}-receipt${suffix}`,
      professionalId: `${P}-pro${suffix}`,
      patientId: `${P}-record${suffix}`,
      amountCents: 2000,
      currency: "usd",
      method: "cash",
      reference: `${P}-pro${suffix}:ORIGINAL`,
      receivedAt: iso,
    });
    await change(1, suffix);
  }
});
afterAll(cleanup);

function expectNoFinance(data: ExportData) {
  expect(data.receipts).toEqual([]);
  expect(data.receiptCorrections).toEqual([]);
  expect(data.effectiveExternalReceipts).toEqual([]);
}
describe("exportación financiera propia de la cuenta paciente", () => {
  it("conserva claves originales y exporta snapshots propios sin identificadores internos", async () => {
    await change(2, "", "voided");
    const { data, json } = await exportData();
    expect(data.version).toBe(1);
    expect(data.receipts).toEqual([
      {
        id: `${P}-receipt`,
        amountCents: 2000,
        currency: "usd",
        method: "cash",
        receivedAt: iso,
      },
    ]);
    expect(data.receiptCorrections).toHaveLength(2);
    expect(data.receiptCorrections[1]).toEqual({
      id: `${P}-event-2`,
      receiptId: `${P}-receipt`,
      revision: 2,
      kind: "voided",
      amountCents: 0,
      currency: "eur",
      method: "transfer",
      reference: "REF-2",
      receivedAt: "2026-01-16T14:00:00.000Z",
      reason: "Justificante revisado 2",
      createdAt: iso,
    });
    expect(data.effectiveExternalReceipts).toEqual([
      {
        id: `${P}-receipt`,
        amountCents: 0,
        currency: "eur",
        method: "transfer",
        reference: "REF-2",
        receivedAt: "2026-01-16T14:00:00.000Z",
        revision: 2,
        status: "voided",
        recordedAt: null,
      },
    ]);
    for (const value of [
      "-other",
      "authorUserId",
      "submissionId",
      "submissionPayload",
      "expectedRevision",
      "payload-privado-ficticio",
      "@example.test",
      `${P}-pro:`,
    ]) {
      expect(json).not.toContain(value);
    }
  });
  it("incluye el estado vigente original y restaurado después de una anulación", async () => {
    await change(2, "", "voided");
    await change(3);
    await db.insert(practiceReceipts).values({
      id: `${P}-new-original`,
      professionalId: `${P}-pro`,
      patientId: `${P}-record`,
      amountCents: 5500,
      currency: "ves",
      method: "cash",
      reference: `${P}-pro:NEW`,
      receivedAt: iso,
    });
    const { data } = await exportData();
    expect(data.effectiveExternalReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${P}-receipt`,
          amountCents: 3003,
          revision: 3,
          status: "corrected",
        }),
        expect.objectContaining({
          id: `${P}-new-original`,
          amountCents: 5500,
          currency: "ves",
          reference: "NEW",
          revision: 0,
          status: "recorded",
        }),
      ]),
    );
  });
  it("acepta un vínculo verificado por sesión firmada", async () => {
    await db
      .update(patientConversationLinks)
      .set({ verifiedBy: "seeker_session" })
      .where(eq(patientConversationLinks.conversationId, `${P}-chat`));
    expect((await exportData()).data.receiptCorrections).toHaveLength(1);
  });
  it.each([
    "deleting",
    "deleted",
  ])("excluye cobros de una cuenta %s", async (deletionState) => {
    await db
      .update(patientAccounts)
      .set({ deletionState })
      .where(eq(patientAccounts.userId, `${P}-patient-user`));
    expectNoFinance((await exportData()).data);
  });
  it("excluye cobros sin cuenta activa", async () => {
    await db
      .delete(patientAccounts)
      .where(eq(patientAccounts.userId, `${P}-patient-user`));
    expectNoFinance((await exportData()).data);
  });
  it.each([
    { verifiedBy: "manual", verifiedAt: iso },
    { verifiedBy: "verified_email", verifiedAt: "" },
  ])("excluye un vínculo sin verificación válida ($verifiedBy/$verifiedAt)", async (values) => {
    await db
      .update(patientConversationLinks)
      .set(values)
      .where(eq(patientConversationLinks.conversationId, `${P}-chat`));
    expectNoFinance((await exportData()).data);
  });
  it("excluye un vínculo revocado", async () => {
    await db
      .delete(patientConversationLinks)
      .where(eq(patientConversationLinks.conversationId, `${P}-chat`));
    expectNoFinance((await exportData()).data);
  });
  it("excluye fichas de Ayuda Terremoto", async () => {
    await db
      .update(practicePatients)
      .set({ program: "earthquake" })
      .where(eq(practicePatients.id, `${P}-record`));
    expectNoFinance((await exportData()).data);
  });
  it.each([
    "deleted",
    "anonymized",
  ])("excluye conversaciones %s", async (state) => {
    await db
      .update(conversations)
      .set(
        state === "deleted" ? { deletedAt: new Date() } : { anonymizedAt: iso },
      )
      .where(eq(conversations.id, `${P}-chat`));
    expectNoFinance((await exportData()).data);
  });
  it("excluye una ficha cuyo profesional ya no coincide con el recibo", async () => {
    await db
      .update(practicePatients)
      .set({ professionalId: `${P}-pro-other` })
      .where(eq(practicePatients.id, `${P}-record`));
    expectNoFinance((await exportData()).data);
  });
  it("excluye una conversación cuyo profesional no coincide con la ficha", async () => {
    await db
      .update(conversations)
      .set({ professionalId: `${P}-pro-other` })
      .where(eq(conversations.id, `${P}-chat`));
    expectNoFinance((await exportData()).data);
  });
  it("exporta más de 250 revisiones en lotes sin perder orden ni duplicar", async () => {
    const statements = Array.from({ length: 259 }, (_, i) => change(i + 2));
    await db.batch(
      statements as [(typeof statements)[number], ...typeof statements],
    );
    const { data } = await exportData();
    expect(data.receiptCorrections.map((row) => row.revision)).toEqual(
      Array.from({ length: 260 }, (_, i) => i + 1),
    );
    expect(new Set(data.receiptCorrections.map((row) => row.id)).size).toBe(
      260,
    );
    expect(data.effectiveExternalReceipts[0]).toMatchObject({
      revision: 260,
      amountCents: 3260,
      reference: "REF-260",
    });
  });
  it("revalida la cuenta antes del segundo lote y del conjunto vigente", async () => {
    const statements = Array.from({ length: 259 }, (_, i) => change(i + 2));
    await db.batch(
      statements as [(typeof statements)[number], ...typeof statements],
    );
    let json = "";
    let changes = 0;
    let correctionSet = false;
    for await (const part of patientExportChunks(`${P}-patient-user`)) {
      json += part;
      if (part === ',"receiptCorrections":[') correctionSet = true;
      else if (correctionSet && part.includes('"receiptId"')) {
        changes += 1;
        if (changes === 250) {
          await db
            .update(patientAccounts)
            .set({ deletionState: "deleting" })
            .where(eq(patientAccounts.userId, `${P}-patient-user`));
        }
      }
    }
    const data = JSON.parse(json) as ExportData;
    expect(data.receiptCorrections).toHaveLength(250);
    expect(data.effectiveExternalReceipts).toEqual([]);
  });
});
