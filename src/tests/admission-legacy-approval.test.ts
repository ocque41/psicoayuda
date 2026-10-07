import { eq, like, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import {
  auditLogs,
  session as authSessions,
  practiceCredentials,
  professionals,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  approval: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/assignment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assignment")>()),
  assignRequestToProfessional: vi.fn(),
  releaseAssignmentsForRequest: vi.fn(),
  releaseProfessionalAssignments: mocks.release,
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdminHelpRequest: vi.fn(),
  notifyAllianceApproved: vi.fn(),
  notifyFoundationContact: vi.fn(),
  notifyProfessionalApproved: mocks.approval,
  notifyProfessionalAssignment: vi.fn(),
}));
vi.mock("@/lib/fpv", () => ({ verifyFpvByCedula: vi.fn() }));

import {
  adminApproveIncompleteRegistration,
  adminSetProfessionalKind,
  adminUpdateProfessionalStatus,
} from "@/app/actions";
import { reviewProfessional } from "@/app/admin/operaciones/actions";

const P = "test-admission-legacy-";
const clinicalId = `${P}clinical`;
const auxiliaryId = `${P}auxiliary`;
const timestamp = "2026-10-01T12:00:00.000Z";
const emails = {
  admin: "legacy-admin@example.test",
  reviewer: "legacy-reviewer@example.test",
  admission: "legacy-admission@example.test",
  owner: "legacy-owner@example.test",
  incomplete: "legacy-incomplete@example.test",
  auxiliary: "legacy-auxiliary@example.test",
};
function session(role: keyof typeof emails) {
  mocks.session.mockResolvedValue({
    user: { id: `${P}${role}`, email: emails[role], emailVerified: true },
    session: { id: `${P}${role}-session`, expiresAt: new Date("2099-01-01") },
  });
}
function decision(status = "approved", professionalId = clinicalId) {
  const form = new FormData();
  form.set("professionalId", professionalId);
  form.set("status", status);
  form.set("reference", "Cotejo profesional ficticio");
  form.set("checked", "on");
  return form;
}
function incomplete(kind = "certified") {
  const form = new FormData();
  form.set("userId", `${P}incomplete`);
  form.set("kind", kind);
  return form;
}
async function profile(id = clinicalId) {
  return db.query.professionals.findFirst({ where: eq(professionals.id, id) });
}
async function audits() {
  return db
    .select()
    .from(auditLogs)
    .where(like(auditLogs.entityId, `${P}%`));
}
async function cleanup() {
  await db.delete(authSessions).where(like(authSessions.id, `${P}%`));
  await db.run(sql`DROP TRIGGER IF EXISTS admission_legacy_test_audit_failure`);
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await db
    .delete(practiceCredentials)
    .where(like(practiceCredentials.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.userId, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
beforeAll(async () => {
  await cleanup();
  await db.insert(user).values(
    Object.entries(emails).map(([role, email]) => ({
      id: `${P}${role}`,
      name: "Cuenta ficticia de pruebas",
      email,
      emailVerified: true,
    })),
  );
  await db.insert(authSessions).values({
    id: `${P}admin-session`,
    userId: `${P}admin`,
    token: `${P}fake-admin-token`,
    expiresAt: new Date("2099-01-01"),
  });
  await db.insert(professionals).values([
    {
      id: clinicalId,
      userId: `${P}owner`,
      fullName: "Profesional clínico ficticio",
      email: emails.owner,
      status: "pending_verification",
      languages: '["es"]',
      supportAreas: "[]",
      acceptingRequests: false,
      remoteAvailable: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: auxiliaryId,
      userId: `${P}auxiliary`,
      fullName: "Auxiliar ficticio",
      email: emails.auxiliary,
      status: "pending_verification",
      nonClinicalHelper: true,
      languages: '["es"]',
      supportAreas: "[]",
      acceptingRequests: false,
      remoteAvailable: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await db.insert(practiceCredentials).values({
    id: `${P}scope`,
    professionalId: auxiliaryId,
    patientCountry: "España",
    registryReference: "Cotejo de ámbito ficticio",
    reviewedBy: emails.reviewer,
    reviewedAt: timestamp,
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_EMAILS", emails.admin);
  vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", emails.reviewer);
  vi.stubEnv("ADMISSION_REVIEWER_EMAILS", emails.admission);
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await db
    .delete(professionals)
    .where(eq(professionals.userId, `${P}incomplete`));
  await db
    .update(professionals)
    .set({
      status: "pending_verification",
      credentialConfirmed: false,
      acceptingRequests: false,
      remoteAvailable: false,
    })
    .where(like(professionals.id, `${P}%`));
  await db
    .update(professionals)
    .set({ nonClinicalHelper: false })
    .where(eq(professionals.id, clinicalId));
  await db
    .update(professionals)
    .set({ nonClinicalHelper: true })
    .where(eq(professionals.id, auxiliaryId));
  await db
    .update(practiceCredentials)
    .set({ expiresAt: "2099-01-01T00:00:00.000Z" })
    .where(eq(practiceCredentials.professionalId, auxiliaryId));
  session("admin");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await db.run(sql`DROP TRIGGER IF EXISTS admission_legacy_test_audit_failure`);
});
afterAll(cleanup);

describe("las aprobaciones antiguas respetan Admisión", () => {
  it("el admin envía al clínico pendiente a Admisión sin escritura ni aviso", async () => {
    const batch = vi.spyOn(db, "batch");
    await expect(adminUpdateProfessionalStatus(decision())).rejects.toThrow(
      `REDIRECT:/admin/admision?candidato=${clinicalId}`,
    );
    expect(batch).not.toHaveBeenCalled();
    expect((await profile())?.status).toBe("pending_verification");
    expect(await audits()).toHaveLength(0);
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("el revisor devuelve los cuatro requisitos del clínico pendiente sin publicarlo", async () => {
    session("reviewer");
    const batch = vi.spyOn(db, "batch");
    expect(await reviewProfessional(null, decision())).toMatchObject({
      ok: false,
      message: expect.stringContaining("Completa Admisión"),
    });
    expect(batch).not.toHaveBeenCalled();
    expect((await profile())?.status).toBe("pending_verification");
    expect(await audits()).toHaveLength(0);
  });
  it.each([
    "admin",
    "reviewer",
  ] as const)("%s no aprueba si el perfil pasa a pendiente antes del batch", async (role) => {
    session(role);
    await db
      .update(professionals)
      .set({ status: "approved" })
      .where(eq(professionals.id, clinicalId));
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce((async (queries) => {
      await db
        .update(professionals)
        .set({ status: "pending_verification" })
        .where(eq(professionals.id, clinicalId));
      return original(queries);
    }) as typeof db.batch);
    if (role === "admin")
      await expect(adminUpdateProfessionalStatus(decision())).rejects.toThrow(
        "REDIRECT:/admin",
      );
    else
      expect(await reviewProfessional(null, decision())).toMatchObject({
        ok: false,
      });
    expect((await profile())?.status).toBe("pending_verification");
    expect(await audits()).toHaveLength(0);
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it.each([
    "approved",
    "suspended",
  ])("mantiene la gestión de un perfil %s ya publicado", async (status) => {
    await db
      .update(professionals)
      .set({ status })
      .where(eq(professionals.id, clinicalId));
    await adminUpdateProfessionalStatus(decision());
    expect(await profile()).toMatchObject({
      status: "approved",
      acceptingRequests: true,
      remoteAvailable: true,
    });
    expect(await audits()).toHaveLength(1);
    expect(mocks.approval).toHaveBeenCalledTimes(1);
  });
  it("mantiene la revisión clínica de un perfil suspendido", async () => {
    session("reviewer");
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, clinicalId));
    expect(await reviewProfessional(null, decision())).toMatchObject({
      ok: true,
    });
    expect(await profile()).toMatchObject({
      status: "approved",
      credentialConfirmed: true,
    });
    expect(await audits()).toHaveLength(1);
  });
  it("mantiene la aprobación de auxiliares desde administración", async () => {
    await adminUpdateProfessionalStatus(decision("approved", auxiliaryId));
    expect(await profile(auxiliaryId)).toMatchObject({
      status: "approved",
      nonClinicalHelper: true,
      acceptingRequests: true,
    });
    expect(await audits()).toHaveLength(1);
    expect(mocks.approval).toHaveBeenCalledTimes(1);
  });
  it("rechazar un pendiente conserva liberación y auditoría", async () => {
    await adminUpdateProfessionalStatus(decision("rejected"));
    expect((await profile())?.status).toBe("rejected");
    expect(mocks.release).not.toHaveBeenCalled();
    expect((await profile())?.currentActiveRequests).toBe(0);
    expect(await audits()).toHaveLength(1);
  });
  it("el alta clínica incompleta crea candidatura y no inventa aceptación ni aprobación", async () => {
    await expect(
      adminApproveIncompleteRegistration(incomplete()),
    ).rejects.toThrow("REDIRECT:/admin/admision?candidato=");
    const candidate = await db.query.professionals.findFirst({
      where: eq(professionals.userId, `${P}incomplete`),
    });
    expect(candidate).toMatchObject({
      status: "pending_verification",
      nonClinicalHelper: false,
      acceptingRequests: false,
      conductAcceptedAt: null,
      credentialConfirmed: false,
    });
    expect(candidate?.licenseNumber).toBeNull();
    expect(mocks.approval).not.toHaveBeenCalled();
    expect(await audits()).toMatchObject([
      { action: "professional_manual_draft_for_admission" },
    ]);
    await adminApproveIncompleteRegistration(incomplete());
    expect(await audits()).toHaveLength(1);
  });
  it("el alta auxiliar incompleta conserva su estado y aviso anteriores", async () => {
    await adminApproveIncompleteRegistration(incomplete("non_clinical"));
    const candidate = await db.query.professionals.findFirst({
      where: eq(professionals.userId, `${P}incomplete`),
    });
    expect(candidate).toMatchObject({
      status: "approved",
      nonClinicalHelper: true,
      acceptingRequests: true,
      conductAcceptedAt: expect.any(String),
    });
    expect(mocks.approval).toHaveBeenCalledTimes(1);
    expect(await audits()).toMatchObject([
      { action: "professional_manual_approval_non_clinical" },
    ]);
  });
  it("un conflicto de alta no duplica perfil, auditoría ni avisos", async () => {
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce((async (queries) => {
      await db.insert(professionals).values({
        id: `${P}other-created`,
        userId: `${P}incomplete`,
        fullName: "Candidatura ficticia paralela",
        email: emails.incomplete,
        languages: '["es"]',
        supportAreas: "[]",
        status: "pending_verification",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return original(queries);
    }) as typeof db.batch);
    await adminApproveIncompleteRegistration(incomplete());
    expect(
      await db
        .select()
        .from(professionals)
        .where(eq(professionals.userId, `${P}incomplete`)),
    ).toHaveLength(1);
    expect(await audits()).toHaveLength(0);
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("un fallo de auditoría revierte también el alta del perfil", async () => {
    await db.run(
      sql.raw(
        "CREATE TRIGGER admission_legacy_test_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.entity_id='test-admission-legacy-incomplete' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END",
      ),
    );
    await expect(
      adminApproveIncompleteRegistration(incomplete()),
    ).rejects.toThrow();
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.userId, `${P}incomplete`),
      }),
    ).toBeUndefined();
    expect(await audits()).toHaveLength(0);
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("el rol de admisión no obtiene permisos de las acciones antiguas", async () => {
    session("admission");
    await expect(adminUpdateProfessionalStatus(decision())).rejects.toThrow(
      "REDIRECT:/pro",
    );
    await expect(
      adminApproveIncompleteRegistration(incomplete()),
    ).rejects.toThrow("REDIRECT:/pro");
    await expect(adminSetProfessionalKind(decision())).rejects.toThrow(
      "REDIRECT:/pro",
    );
    expect(await reviewProfessional(null, decision())).toMatchObject({
      ok: false,
    });
    expect(await audits()).toHaveLength(0);
  });

  it("auxiliar aprobado pasa a clínico pendiente, expira ámbitos y libera una vez", async () => {
    await db
      .update(professionals)
      .set({
        status: "approved",
        credentialConfirmed: true,
        acceptingRequests: true,
      })
      .where(eq(professionals.id, auxiliaryId));
    const form = decision("approved", auxiliaryId);
    form.set("kind", "certified");
    await expect(adminSetProfessionalKind(form)).rejects.toThrow(
      `REDIRECT:/admin/admision?candidato=${auxiliaryId}`,
    );
    const changed = await profile(auxiliaryId);
    expect(changed).toMatchObject({
      nonClinicalHelper: false,
      status: "pending_verification",
      credentialConfirmed: false,
      acceptingRequests: false,
    });
    const scope = await db.query.practiceCredentials.findFirst({
      where: eq(practiceCredentials.professionalId, auxiliaryId),
    });
    expect(Date.parse(scope?.expiresAt || "")).toBeLessThanOrEqual(Date.now());
    expect(await audits()).toMatchObject([
      { action: "professional_kind_certified" },
    ]);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(changed?.currentActiveRequests).toBe(0);
    await adminSetProfessionalKind(form);
    expect((await profile(auxiliaryId))?.updatedAt).toBe(changed?.updatedAt);
    expect(await audits()).toHaveLength(1);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("mantener el tipo clínico no invalida la versión ni crea auditoría", async () => {
    const previous = (await profile())?.updatedAt;
    const batch = vi.spyOn(db, "batch");
    await adminSetProfessionalKind(decision());
    expect((await profile())?.updatedAt).toBe(previous);
    expect(batch).not.toHaveBeenCalled();
    expect(await audits()).toHaveLength(0);
  });
  it("cambiar clínico aprobado a auxiliar conserva su estado de atención", async () => {
    await db
      .update(professionals)
      .set({ status: "approved", acceptingRequests: true })
      .where(eq(professionals.id, clinicalId));
    const form = decision();
    form.set("kind", "non_clinical");
    await adminSetProfessionalKind(form);
    expect(await profile()).toMatchObject({
      nonClinicalHelper: true,
      status: "approved",
      acceptingRequests: true,
    });
    expect(await audits()).toMatchObject([
      { action: "professional_kind_non_clinical" },
    ]);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("no cambia el tipo durante una baja, ni al ganar la baja antes del batch", async () => {
    const form = decision("approved", auxiliaryId);
    form.set("kind", "certified");
    await db
      .update(professionals)
      .set({ status: "deleting" })
      .where(eq(professionals.id, auxiliaryId));
    await expect(adminSetProfessionalKind(form)).rejects.toThrow(
      "REDIRECT:/admin",
    );
    await db
      .update(professionals)
      .set({ status: "approved" })
      .where(eq(professionals.id, auxiliaryId));
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce((async (queries) => {
      await db
        .update(professionals)
        .set({ status: "deleting" })
        .where(eq(professionals.id, auxiliaryId));
      return original(queries);
    }) as typeof db.batch);
    await expect(adminSetProfessionalKind(form)).rejects.toThrow(
      "Vuelve a intentarlo",
    );
    expect(await profile(auxiliaryId)).toMatchObject({
      status: "deleting",
      nonClinicalHelper: true,
    });
    expect(await audits()).toHaveLength(0);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(
      (
        await db.query.practiceCredentials.findFirst({
          where: eq(practiceCredentials.professionalId, auxiliaryId),
        })
      )?.expiresAt,
    ).toBe("2099-01-01T00:00:00.000Z");
  });
  it("un fallo de auditoría revierte reclasificación y ámbitos sin liberar", async () => {
    await db
      .update(professionals)
      .set({ status: "approved", acceptingRequests: true })
      .where(eq(professionals.id, auxiliaryId));
    await db.run(
      sql.raw(
        "CREATE TRIGGER admission_legacy_test_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.entity_id='test-admission-legacy-auxiliary' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END",
      ),
    );
    const form = decision("approved", auxiliaryId);
    form.set("kind", "certified");
    await expect(adminSetProfessionalKind(form)).rejects.toThrow();
    expect(await profile(auxiliaryId)).toMatchObject({
      nonClinicalHelper: true,
      status: "approved",
      acceptingRequests: true,
    });
    expect(
      (
        await db.query.practiceCredentials.findFirst({
          where: eq(practiceCredentials.professionalId, auxiliaryId),
        })
      )?.expiresAt,
    ).toBe("2099-01-01T00:00:00.000Z");
    expect(await audits()).toHaveLength(0);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
