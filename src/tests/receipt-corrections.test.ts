import { DrizzleQueryError, eq, like, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import {
  auditLogs,
  conversations,
  practicePatients,
  practiceReceiptCorrections,
  practiceReceipts,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import {
  readPatientReceiptHistory,
  readPracticeReceiptPage,
  readReceiptHistory,
  receiptTotals,
} from "@/lib/practice/receipt-queries";
import { writeReceiptChange } from "@/lib/practice/receipt-write";

const mocks = vi.hoisted(() => ({ session: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));

import {
  correctReceipt,
  voidReceipt,
} from "@/app/pro/pacientes/[patientId]/receipt-actions";

const P = "test-receipt-corrections";
const iso = "2026-01-15T14:00:00.000Z";
const actor = { professionalId: `${P}-pro`, userId: `${P}-user` };
function input(receiptId: string, changes: Record<string, string> = {}) {
  const form = new FormData();
  const fields = {
    patientId: `${P}-patient`,
    receiptId,
    revision: "0",
    submissionId: crypto.randomUUID(),
    reason: "Importe del justificante corregido",
    amount: "35.50",
    currency: "eur",
    method: "transfer",
    reference: "",
    receivedAt: "2026-01-15T15:00",
    receivedTimeZone: "UTC",
    ...changes,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}
async function receipt(suffix = "receipt", owner = "", currency = "usd") {
  const id = `${P}-${suffix}`;
  await db.insert(practiceReceipts).values({
    id,
    professionalId: `${P}-pro${owner}`,
    patientId: `${P}-patient${owner}`,
    amountCents: 2000,
    currency,
    method: "cash",
    reference: `${P}-pro${owner}:${suffix}`,
    receivedAt: iso,
  });
  return id;
}
async function events(id: string) {
  return db.query.practiceReceiptCorrections.findMany({
    where: eq(practiceReceiptCorrections.receiptId, id),
  });
}
async function logs(id: string) {
  return db.query.auditLogs.findMany({ where: eq(auditLogs.entityId, id) });
}
async function cleanup() {
  vi.restoreAllMocks();
  await db
    .delete(practiceReceiptCorrections)
    .where(like(practiceReceiptCorrections.professionalId, `${P}%`));
  await db.delete(practiceReceipts).where(like(practiceReceipts.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db
    .delete(practiceSettings)
    .where(like(practiceSettings.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
}
beforeEach(async () => {
  await cleanup();
  mocks.refresh.mockClear();
  mocks.session.mockResolvedValue({
    user: { id: actor.userId, email: "correo-obsoleto@example.test" },
  });
  for (const suffix of ["", "-other"]) {
    await db.insert(user).values({
      id: `${P}-user${suffix}`,
      name: "Profesional ficticio",
      email: `${P}${suffix}@example.test`,
    });
    await db.insert(professionals).values({
      id: `${P}-pro${suffix}`,
      userId: `${P}-user${suffix}`,
      email: `${P}${suffix}@example.test`,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: "[]",
      supportAreas: "[]",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(practicePatients).values({
      id: `${P}-patient${suffix}`,
      professionalId: `${P}-pro${suffix}`,
      name: "Persona ficticia",
      country: "Venezuela",
      program: "general",
      consentAt: iso,
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(practiceSettings).values({
      professionalId: `${P}-pro${suffix}`,
      timeZone: "UTC",
      updatedAt: iso,
    });
  }
});
afterAll(cleanup);

describe("correcciones de cobros externos sin alterar originales", () => {
  it("conserva original, guarda snapshot, atribuye al correo actual y actualiza vistas", async () => {
    const id = await receipt();
    expect(await correctReceipt(null, input(id))).toMatchObject({
      ok: true,
      revision: 1,
    });
    expect(
      await db.query.practiceReceipts.findFirst({
        where: eq(practiceReceipts.id, id),
      }),
    ).toMatchObject({
      amountCents: 2000,
      currency: "usd",
      method: "cash",
      receivedAt: iso,
    });
    expect((await events(id))[0]).toMatchObject({
      amountCents: 3550,
      currency: "eur",
      method: "transfer",
      reference: `${P}-pro:receipt`,
      receivedAt: "2026-01-15T15:00:00.000Z",
      revision: 1,
      expectedRevision: 0,
      authorUserId: actor.userId,
      kind: "corrected",
    });
    expect(await logs(id)).toHaveLength(1);
    expect((await logs(id))[0]).toMatchObject({
      actorEmail: `${P}@example.test`,
      action: "external_receipt_corrected",
    });
    expect(
      (await readPracticeReceiptPage(actor.professionalId, `${P}-patient`))
        .rows[0],
    ).toMatchObject({
      amountCents: 3550,
      currency: "eur",
      revision: 1,
      status: "corrected",
    });
    expect(mocks.refresh).toHaveBeenCalledWith(
      `/pro/pacientes/${P}-patient/cobros/${id}`,
    );
  });
  it("admite varias correcciones y anulación usando solamente la última moneda e importe", async () => {
    const id = await receipt();
    await receipt("ves", "", "ves");
    await correctReceipt(null, input(id));
    await correctReceipt(
      null,
      input(id, {
        revision: "1",
        currency: "ves",
        amount: "5500",
        reference: "nueva-referencia",
      }),
    );
    expect(await receiptTotals(actor.professionalId)).toEqual([
      { currency: "ves", amountCents: 552000 },
    ]);
    expect(
      await receiptTotals(actor.professionalId, {
        endsAt: "2026-01-15T14:30:00.000Z",
      }),
    ).toEqual([{ currency: "ves", amountCents: 2000 }]);
    expect(
      await voidReceipt(
        null,
        input(id, {
          revision: "2",
          reason: "Duplicado verificado en el registro",
        }),
      ),
    ).toMatchObject({ ok: true, revision: 3 });
    expect((await events(id))[2]).toMatchObject({
      kind: "voided",
      amountCents: 0,
      currency: "ves",
      reference: `${P}-pro:nueva-referencia`,
      receivedAt: "2026-01-15T15:00:00.000Z",
    });
    expect(await receiptTotals(actor.professionalId)).toEqual([
      { currency: "ves", amountCents: 2000 },
    ]);
    expect(
      (
        await readReceiptHistory(actor.professionalId, `${P}-patient`, id)
      )?.events.map((event) => event.revision),
    ).toEqual([3, 2, 1]);
  });
  it("reintento exacto y simultáneo con el mismo UUID no duplican evento ni auditoría", async () => {
    const id = await receipt();
    const request = input(id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => correctReceipt(null, request)),
    );
    expect(results.every((result) => result?.ok)).toBe(true);
    expect(await events(id)).toHaveLength(1);
    expect(await logs(id)).toHaveLength(1);
    await db
      .update(practiceSettings)
      .set({ timeZone: "America/Caracas" })
      .where(eq(practiceSettings.professionalId, actor.professionalId));
    expect(await correctReceipt(null, request)).toMatchObject({
      ok: true,
      revision: 1,
    });
    request.set("reason", "Un motivo diferente");
    expect(await correctReceipt(null, request)).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
  it("UUID de otro recibo o tipo no se reutiliza", async () => {
    const id = await receipt();
    const second = await receipt("second");
    const submissionId = crypto.randomUUID();
    await correctReceipt(null, input(id, { submissionId }));
    expect(
      await correctReceipt(null, input(second, { submissionId })),
    ).toMatchObject({ ok: false, code: "conflict" });
    expect(await voidReceipt(null, input(id, { submissionId }))).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(await events(second)).toHaveLength(0);
  });
  it("dos ventanas compiten por la misma revisión y solo una escribe", async () => {
    const id = await receipt();
    const results = await Promise.all([
      correctReceipt(null, input(id, { amount: "40" })),
      correctReceipt(null, input(id, { amount: "45" })),
    ]);
    expect(results.filter((result) => result?.ok)).toHaveLength(1);
    expect(
      results.filter((result) => result?.code === "conflict"),
    ).toHaveLength(1);
    expect(await events(id)).toHaveLength(1);
    expect(await logs(id)).toHaveLength(1);
    expect(await voidReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
  it("CAS cubre el cambio entre lectura y batch sin auditoría fantasma", async () => {
    const id = await receipt();
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      expect(
        await writeReceiptChange(
          actor,
          "corrected",
          input(id, { amount: "42" }),
        ),
      ).toMatchObject({ ok: true });
      return realBatch(queries);
    });
    expect(await correctReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(await events(id)).toHaveLength(1);
    expect(await logs(id)).toHaveLength(1);
  });
  it("fallo de auditoría revierte también el snapshot y permite reintentar", async () => {
    const id = await receipt();
    const request = input(id);
    await db.run(
      sql`CREATE TRIGGER receipt_test_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action = 'external_receipt_corrected' BEGIN SELECT RAISE(ABORT, 'fixture_audit_failure'); END`,
    );
    try {
      expect(await correctReceipt(null, request)).toMatchObject({
        ok: false,
        code: "unavailable",
      });
      expect(await events(id)).toHaveLength(0);
      expect(await logs(id)).toHaveLength(0);
    } finally {
      await db.run(sql`DROP TRIGGER receipt_test_audit_failure`);
    }
    expect(await correctReceipt(null, request)).toMatchObject({
      ok: true,
      revision: 1,
    });
  });
  it("un fallo de batch no se clasifica por SQL o parámetros ni fuerza otra lectura", async () => {
    const id = await receipt();
    const request = input(id);
    const lookup = vi.spyOn(db.query.practiceReceiptCorrections, "findFirst");
    vi.spyOn(db, "batch").mockRejectedValueOnce(
      new DrizzleQueryError(
        "INSERT INTO practice_receipt_corrections (submission_id) VALUES (?)",
        ["receipt_reference_conflict", "receipt_correction_conflict"],
        new Error("fixture_database_unavailable"),
      ),
    );
    const result = await correctReceipt(null, request);
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(result?.message).not.toContain("fixture_database_unavailable");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await events(id)).toHaveLength(0);
    expect(await logs(id)).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(await correctReceipt(null, request)).toMatchObject({
      ok: true,
      revision: 1,
    });
    expect(await events(id)).toHaveLength(1);
    expect(await logs(id)).toHaveLength(1);
  });
  it("fallo de batch y de reconciliación conserva un resultado seguro y el UUID reintentable", async () => {
    const id = await receipt();
    const request = input(id);
    const lookup = vi
      .spyOn(db.query.practiceReceiptCorrections, "findFirst")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("fixture_reconciliation_unavailable"));
    vi.spyOn(db, "batch").mockRejectedValueOnce(
      new DrizzleQueryError(
        "INSERT INTO practice_receipt_corrections (submission_id) VALUES (?)",
        [request.get("submissionId")],
        new Error(
          "SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: practice_receipt_corrections.submission_id",
        ),
      ),
    );
    const result = await correctReceipt(null, request);
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(result?.message).not.toContain("fixture_reconciliation_unavailable");
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(await events(id)).toHaveLength(0);
    expect(await logs(id)).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(await correctReceipt(null, request)).toMatchObject({
      ok: true,
      revision: 1,
    });
    expect(await events(id)).toHaveLength(1);
    expect((await events(id))[0].submissionId).toBe(
      request.get("submissionId"),
    );
    expect(await logs(id)).toHaveLength(1);
  });
  it("la causa UNIQUE de Drizzle reconcilia el envío concurrente sin duplicar auditoría", async () => {
    const id = await receipt();
    const request = input(id);
    vi.spyOn(db, "batch").mockImplementationOnce(async () => {
      expect(
        await writeReceiptChange(actor, "corrected", request),
      ).toMatchObject({
        ok: true,
        revision: 1,
      });
      throw new DrizzleQueryError(
        "INSERT INTO practice_receipt_corrections (submission_id) VALUES (?)",
        [request.get("submissionId")],
        new Error(
          "D1_ERROR: UNIQUE constraint failed: practice_receipt_corrections.submission_id: SQLITE_CONSTRAINT",
        ),
      );
    });
    expect(await correctReceipt(null, request)).toMatchObject({
      ok: true,
      revision: 1,
      receiptId: id,
    });
    expect(await events(id)).toHaveLength(1);
    expect(await logs(id)).toHaveLength(1);
  });
  it("referencia original propia puede conservarse y otras originales quedan reservadas tras anular", async () => {
    const id = await receipt();
    const other = await receipt("reserved");
    expect(
      await correctReceipt(null, input(id, { reference: "receipt" })),
    ).toMatchObject({ ok: true });
    await voidReceipt(null, input(other));
    expect(
      await correctReceipt(
        null,
        input(id, { revision: "1", reference: "reserved" }),
      ),
    ).toMatchObject({ ok: false, code: "reference_conflict" });
    expect(await events(id)).toHaveLength(1);
  });
  it("referencia efectiva corregida impide crear o corregir otro recibo incluso en carrera", async () => {
    const a = await receipt("a");
    const b = await receipt("b");
    const result = await Promise.all([
      correctReceipt(null, input(a, { reference: "shared" })),
      correctReceipt(null, input(b, { reference: "shared" })),
    ]);
    expect(result.filter((value) => value?.ok)).toHaveLength(1);
    expect(
      result.filter((value) => value?.code === "reference_conflict"),
    ).toHaveLength(1);
    await expect(
      db.insert(practiceReceipts).values({
        id: `${P}-illegal-ref`,
        professionalId: actor.professionalId,
        patientId: `${P}-patient`,
        amountCents: 100,
        currency: "usd",
        method: "cash",
        reference: `${P}-pro:shared`,
        receivedAt: iso,
      }),
    ).rejects.toThrow();
    const current = result[0]?.ok ? a : b;
    await voidReceipt(null, input(current, { revision: "1" }));
    expect(
      await correctReceipt(
        null,
        input(result[0]?.ok ? b : a, { reference: "shared" }),
      ),
    ).toMatchObject({ ok: true });
  });
  it("aisla profesional y paciente original; rechazado, auxiliar, anónimo y Terremoto no escriben", async () => {
    const id = await receipt();
    const foreign = await receipt("foreign", "-other");
    expect(
      await correctReceipt(
        null,
        input(foreign, { patientId: `${P}-patient-other` }),
      ),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(
      await correctReceipt(
        null,
        input(id, { patientId: `${P}-patient-other` }),
      ),
    ).toMatchObject({ ok: false, code: "not_found" });
    await db
      .update(practicePatients)
      .set({ program: "earthquake" })
      .where(eq(practicePatients.id, `${P}-patient`));
    expect(await correctReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "validation",
    });
    expect(await voidReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "validation",
    });
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, actor.professionalId));
    expect(await correctReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    await db
      .update(professionals)
      .set({ status: "approved", nonClinicalHelper: true })
      .where(eq(professionals.id, actor.professionalId));
    expect(await correctReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    mocks.session.mockResolvedValue(null);
    expect(await voidReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    expect(await events(id)).toHaveLength(0);
    expect(await logs(id)).toHaveLength(0);
  });
  it("verifica dueño vigente de nuevo dentro de la escritura", async () => {
    const id = await receipt();
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(professionals)
        .set({ userId: `${P}-user-other` })
        .where(eq(professionals.id, actor.professionalId));
      return realBatch(queries);
    });
    expect(await correctReceipt(null, input(id))).toMatchObject({ ok: false });
    expect(await events(id)).toHaveLength(0);
    expect(await logs(id)).toHaveLength(0);
  });
  it("valida moneda, importe, motivo, fecha futura, DST y revisión/UUID", async () => {
    const id = await receipt();
    const invalidInputs: Record<string, string>[] = [
      { currency: "btc" },
      { amount: "-3" },
      { amount: "0" },
      { amount: "1.123" },
      { reason: "x" },
      { reason: "x".repeat(161) },
      { receivedAt: "2999-01-01T00:00" },
      { revision: "" },
      { revision: "1.5" },
      { submissionId: "invalid" },
    ];
    for (const changes of invalidInputs) {
      expect(await correctReceipt(null, input(id, changes))).toMatchObject({
        ok: false,
        code: "validation",
      });
    }
    await db
      .update(practiceSettings)
      .set({ timeZone: "Europe/Madrid" })
      .where(eq(practiceSettings.professionalId, actor.professionalId));
    expect(await correctReceipt(null, input(id))).toMatchObject({
      ok: false,
      code: "validation",
    });
    expect(
      await correctReceipt(
        null,
        input(id, {
          receivedTimeZone: "Europe/Madrid",
          receivedAt: "2026-03-29T02:30",
        }),
      ),
    ).toMatchObject({ ok: false, code: "validation" });
    expect(await events(id)).toHaveLength(0);
  });
  it("triggers impiden editar el original/evento/autor y forzar revisión o dueño", async () => {
    const id = await receipt();
    await correctReceipt(null, input(id));
    const event = (await events(id))[0];
    await expect(
      db
        .update(practiceReceipts)
        .set({ amountCents: 3 })
        .where(eq(practiceReceipts.id, id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(practiceReceiptCorrections)
        .set({ amountCents: 3 })
        .where(eq(practiceReceiptCorrections.id, event.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(practiceReceiptCorrections)
        .set({ authorUserId: null })
        .where(eq(practiceReceiptCorrections.id, event.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(practiceReceiptCorrections).values({
        ...event,
        id: `${P}-forced-revision`,
        submissionId: crypto.randomUUID(),
        revision: 4,
        expectedRevision: 3,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(practiceReceiptCorrections).values({
        ...event,
        id: `${P}-forced-owner`,
        submissionId: crypto.randomUUID(),
        revision: 2,
        expectedRevision: 1,
        authorUserId: `${P}-user-other`,
      }),
    ).rejects.toThrow();
    expect(await events(id)).toHaveLength(1);
  });
  it("conserva historial al borrar una cuenta de autor que ya no es dueña", async () => {
    const id = await receipt();
    await correctReceipt(null, input(id));
    await db
      .update(professionals)
      .set({ userId: `${P}-user-other` })
      .where(eq(professionals.id, actor.professionalId));
    await db.delete(user).where(eq(user.id, actor.userId));
    expect((await events(id))[0]).toMatchObject({
      authorUserId: null,
      amountCents: 3550,
      revision: 1,
    });
    expect(
      (await readReceiptHistory(actor.professionalId, `${P}-patient`, id))
        ?.events[0].authorAvailable,
    ).toBe(false);
  });
  it("lista/history paginadas y filtros efectivos acotados sin perder la revisión actual", async () => {
    const id = await receipt();
    for (let revision = 0; revision < 27; revision++)
      expect(
        await correctReceipt(
          null,
          input(id, {
            revision: String(revision),
            amount: String(revision + 1),
          }),
        ),
      ).toMatchObject({ ok: true });
    const history = await readReceiptHistory(
      actor.professionalId,
      `${P}-patient`,
      id,
      2,
    );
    expect(history?.events.map((event) => event.revision)).toEqual([2, 1]);
    expect(history?.current).toMatchObject({ revision: 27, amountCents: 2700 });
    expect(
      await readReceiptHistory(`${P}-pro-other`, `${P}-patient`, id),
    ).toBeNull();
    for (let index = 0; index < 27; index++) await receipt(`page-${index}`);
    await receipt("foreign", "-other");
    const page = await readPracticeReceiptPage(
      actor.professionalId,
      undefined,
      1,
      100,
    );
    expect(page.rows).toHaveLength(25);
    expect(page.total).toBe(28);
    expect(
      (
        await readPracticeReceiptPage(actor.professionalId, undefined, 1, 25, {
          currency: "eur",
        })
      ).rows,
    ).toHaveLength(1);
    expect(
      await receiptTotals(actor.professionalId, { currency: "eur" }),
    ).toEqual([{ currency: "eur", amountCents: 2700 }]);
  });
  it("paciente solo lee su historial con cuenta activa y vínculo verificado vigente", async () => {
    const id = await receipt();
    await correctReceipt(null, input(id));
    const patientUser = `${P}-patient-user`;
    const conversationId = `${P}-conversation`;
    await db.insert(user).values({
      id: patientUser,
      name: "Paciente ficticio",
      email: `${P}-patient@example.test`,
    });
    await db.insert(patientAccounts).values({
      userId: patientUser,
      displayName: "Persona ficticia",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values({
      id: conversationId,
      professionalId: actor.professionalId,
      seekerName: "Persona ficticia",
      seekerEmail: `${P}-patient@example.test`,
      seekerSid: "fixture-opaque-sid",
      createdAt: iso,
      updatedAt: iso,
    });
    await db
      .update(practicePatients)
      .set({ conversationId })
      .where(eq(practicePatients.id, `${P}-patient`));
    expect(await readPatientReceiptHistory(patientUser, id)).toBeNull();
    await db.insert(patientConversationLinks).values({
      userId: patientUser,
      conversationId,
      verifiedBy: "verified_email",
      verifiedAt: iso,
    });
    expect(
      (await readPatientReceiptHistory(patientUser, id))?.current,
    ).toMatchObject({ revision: 1, amountCents: 3550 });
    expect(await readPatientReceiptHistory(`${P}-user-other`, id)).toBeNull();
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, patientUser));
    expect(await readPatientReceiptHistory(patientUser, id)).toBeNull();
    await db
      .update(patientAccounts)
      .set({ deletionState: "active" })
      .where(eq(patientAccounts.userId, patientUser));
    await db
      .update(conversations)
      .set({ anonymizedAt: iso })
      .where(eq(conversations.id, conversationId));
    expect(await readPatientReceiptHistory(patientUser, id)).toBeNull();
    await db
      .update(conversations)
      .set({ anonymizedAt: null, deletedAt: new Date(iso) })
      .where(eq(conversations.id, conversationId));
    expect(await readPatientReceiptHistory(patientUser, id)).toBeNull();
    await db
      .update(conversations)
      .set({ deletedAt: null })
      .where(eq(conversations.id, conversationId));
    await db
      .update(practicePatients)
      .set({ program: "earthquake" })
      .where(eq(practicePatients.id, `${P}-patient`));
    expect(await readPatientReceiptHistory(patientUser, id)).toBeNull();
  });
});
