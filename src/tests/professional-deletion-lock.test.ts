import { eq, like } from "drizzle-orm";
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
  accountOnboardingDrafts,
  auditLogs,
  session as authSessions,
  practiceCredentials,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  release: vi.fn(async () => undefined),
  approval: vi.fn(async () => undefined),
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
  adminUpdateProfessionalStatus,
  saveProfessionalOnboarding,
} from "@/app/actions";
import { reviewProfessional } from "@/app/admin/operaciones/actions";

const P = "test-professional-deletion-lock";
const PRO = `${P}-pro`;
const emails = {
  admin: `${P}-admin@example.test`,
  reviewer: `${P}-reviewer@example.test`,
  support: `${P}-support@example.test`,
  owner: `${P}-owner@example.test`,
  other: `${P}-other@example.test`,
};
const timestamp = "2026-01-01T00:00:00.000Z";
const expiry = "2099-01-01T00:00:00.000Z";
const decisions = [
  "approved",
  "pending_verification",
  "suspended",
  "rejected",
] as const;
function session(role: keyof typeof emails, declaredEmail = emails[role]) {
  mocks.session.mockResolvedValue({
    user: { id: `${P}-${role}`, email: declaredEmail, emailVerified: true },
    session: { id: `${P}-${role}-session`, expiresAt: new Date("2099-01-01") },
  });
}
function form(status = "approved", professionalId = PRO) {
  const data = new FormData();
  data.set("professionalId", professionalId);
  data.set("status", status);
  data.set("reference", "Cotejo ficticio");
  data.set("checked", "on");
  return data;
}
function onboardingForm() {
  const data = new FormData();
  data.set("expectedOwnerId", `${P}-owner`);
  const values = {
    fullName: "Profesional ficticio",
    country: "Canadá",
    licenseNumber: "LIC-NUEVA-FICTICIA",
    licenseCountry: "Canadá",
    university: "Universidad ficticia",
    supportAreas: "orientacion_general",
    emailPublic: "on",
    maxActiveRequests: "3",
    timezone: "America/Toronto",
    conductFreeService: "on",
    conductNoClientCapture: "on",
    conductConfidentiality: "on",
    conductNoEmergencyGuarantee: "on",
    conductCompetence: "on",
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
async function cleanupProfile() {
  await db
    .delete(practiceCredentials)
    .where(eq(practiceCredentials.professionalId, PRO));
  await db
    .delete(practiceSettings)
    .where(eq(practiceSettings.professionalId, PRO));
  await db
    .delete(accountOnboardingDrafts)
    .where(like(accountOnboardingDrafts.userId, `${P}%`));
  await db.delete(auditLogs).where(eq(auditLogs.entityId, PRO));
  await db.delete(professionals).where(eq(professionals.id, PRO));
}
async function claimDeletion() {
  await db
    .update(professionals)
    .set({ status: "deleting", acceptingRequests: false })
    .where(eq(professionals.id, PRO));
}
// Intercalación real de escrituras: el precheck ve un perfil vigente, la baja
// se confirma en BD y después se ejecuta el batch original, sin simular SQL.
function deletionBeforeBatch() {
  const original = db.batch.bind(db);
  vi.spyOn(db, "batch").mockImplementationOnce((async (queries) => {
    await claimDeletion();
    return original(queries);
  }) as typeof db.batch);
}
async function profile() {
  return db.query.professionals.findFirst({
    where: eq(professionals.id, PRO),
    columns: {
      status: true,
      licenseNumber: true,
      credentialConfirmed: true,
      acceptingRequests: true,
      remoteAvailable: true,
      updatedAt: true,
    },
  });
}
async function audits() {
  return db.select().from(auditLogs).where(eq(auditLogs.entityId, PRO));
}
async function expectDeletionPreserved() {
  expect(await profile()).toEqual({
    status: "deleting",
    licenseNumber: "LIC-FICTICIA",
    credentialConfirmed: false,
    acceptingRequests: false,
    remoteAvailable: false,
    updatedAt: timestamp,
  });
  expect(await audits()).toHaveLength(0);
  expect(mocks.release).not.toHaveBeenCalled();
  expect(mocks.approval).not.toHaveBeenCalled();
}

describe("una baja profesional no se puede reabrir desde decisiones ni onboarding", () => {
  beforeAll(async () => {
    await cleanupProfile();
    await db.delete(authSessions).where(like(authSessions.id, `${P}%`));
    await db.delete(user).where(like(user.id, `${P}%`));
    await db.insert(user).values(
      Object.entries(emails).map(([role, email]) => ({
        id: `${P}-${role}`,
        email,
        emailVerified: true,
        name: "Cuenta ficticia",
      })),
    );
    await db.insert(authSessions).values({
      id: `${P}-admin-session`,
      userId: `${P}-admin`,
      token: `${P}-fake-admin-token`,
      expiresAt: new Date("2099-01-01"),
    });
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_EMAILS", emails.admin);
    vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", emails.reviewer);
    vi.stubEnv("SUPPORT_EMAILS", emails.support);
    await cleanupProfile();
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(like(user.id, `${P}%`));
    await db.insert(professionals).values({
      id: PRO,
      userId: `${P}-owner`,
      email: emails.owner,
      fullName: "Profesional ficticio",
      country: "Canadá",
      licenseNumber: "LIC-FICTICIA",
      licenseCountry: "Canadá",
      university: "Universidad ficticia",
      status: "pending_verification",
      acceptingRequests: false,
      remoteAvailable: false,
      languages: '["es"]',
      supportAreas: '["orientacion_general"]',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    session("admin");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await cleanupProfile();
    await db.delete(authSessions).where(like(authSessions.id, `${P}%`));
    await db.delete(user).where(like(user.id, `${P}%`));
  });

  it.each(
    decisions,
  )("bloquea la decisión clínica %s y su reintento después de una baja parcial", async (decision) => {
    await claimDeletion();
    session("reviewer");
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await reviewProfessional(null, form(decision))).toMatchObject({
        ok: false,
        message: expect.stringContaining("eliminación"),
      });
    }
    await expectDeletionPreserved();
  });
  it.each(
    decisions,
  )("el panel anterior bloquea %s y su reintento después de una baja parcial", async (decision) => {
    await claimDeletion();
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        adminUpdateProfessionalStatus(form(decision)),
      ).rejects.toThrow("REDIRECT:/admin");
    }
    await expectDeletionPreserved();
  });
  it.each(
    decisions,
  )("una baja que gana antes de guardar la decisión clínica %s no produce éxito ni auditoría", async (decision) => {
    if (decision === "approved")
      await db
        .update(professionals)
        .set({ status: "approved" })
        .where(eq(professionals.id, PRO));
    deletionBeforeBatch();
    expect(await reviewProfessional(null, form(decision))).toMatchObject({
      ok: false,
    });
    await expectDeletionPreserved();
  });
  it.each(
    decisions,
  )("una baja que gana antes de guardar %s en el panel anterior no avisa ni libera dos veces", async (decision) => {
    if (decision === "approved")
      await db
        .update(professionals)
        .set({ status: "approved" })
        .where(eq(professionals.id, PRO));
    deletionBeforeBatch();
    await expect(adminUpdateProfessionalStatus(form(decision))).rejects.toThrow(
      decision === "suspended" || decision === "rejected"
        ? "Vuelve a intentarlo"
        : "REDIRECT:/admin",
    );
    await expectDeletionPreserved();
  });
  it.each([
    "support",
    "owner",
    "other",
  ] as const)("%s no decide sobre el perfil desde ninguno de los paneles", async (role) => {
    session(role);
    expect(await reviewProfessional(null, form())).toMatchObject({ ok: false });
    await expect(adminUpdateProfessionalStatus(form())).rejects.toThrow(
      "REDIRECT:/pro",
    );
    expect((await profile())?.status).toBe("pending_verification");
    expect(await audits()).toHaveLength(0);
  });
  it("un correo de admin declarado en la sesión no autoriza a otro usuario", async () => {
    session("other", emails.admin);
    expect(await reviewProfessional(null, form())).toMatchObject({ ok: false });
    await expect(adminUpdateProfessionalStatus(form())).rejects.toThrow(
      "REDIRECT:/pro",
    );
    expect((await profile())?.status).toBe("pending_verification");
    expect(await audits()).toHaveLength(0);
  });
  it("un administrador no verificado tampoco decide", async () => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, `${P}-admin`));
    expect(await reviewProfessional(null, form())).toMatchObject({ ok: false });
    await expect(adminUpdateProfessionalStatus(form())).rejects.toThrow(
      "REDIRECT:/pro",
    );
    expect(await audits()).toHaveLength(0);
  });
  it("el revisor conserva la reactivación de un perfil publicado con referencia y sin notificación duplicada", async () => {
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, PRO));
    session("reviewer");
    expect(await reviewProfessional(null, form())).toMatchObject({ ok: true });
    expect((await profile())?.status).toBe("approved");
    expect((await profile())?.credentialConfirmed).toBe(true);
    expect(await audits()).toMatchObject([
      {
        action: "practice_credential_decision",
        actorEmail: emails.reviewer,
        metadata: JSON.stringify({
          status: "approved",
          reference: "Cotejo ficticio",
        }),
      },
    ]);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("la suspensión clínica válida conserva la liberación de solicitudes y una auditoría", async () => {
    expect(await reviewProfessional(null, form("suspended"))).toMatchObject({
      ok: true,
    });
    expect((await profile())?.status).toBe("suspended");
    expect(await audits()).toHaveLength(1);
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith(PRO);
  });
  it("reactivar desde el panel anterior conserva visibilidad, correo y una auditoría", async () => {
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, PRO));
    await adminUpdateProfessionalStatus(form());
    expect(await profile()).toMatchObject({
      status: "approved",
      acceptingRequests: true,
      remoteAvailable: true,
    });
    expect(await audits()).toMatchObject([
      { action: "professional_approval", actorEmail: emails.admin },
    ]);
    expect(mocks.approval).toHaveBeenCalledExactlyOnceWith({
      professionalEmail: emails.owner,
      professionalName: "Profesional ficticio",
      nonClinicalHelper: false,
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("rechazar desde el panel anterior conserva liberación y una auditoría", async () => {
    await adminUpdateProfessionalStatus(form("rejected"));
    expect((await profile())?.status).toBe("rejected");
    expect(await audits()).toMatchObject([
      { action: "professional_rejection" },
    ]);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, PRO),
        })
      )?.currentActiveRequests,
    ).toBe(0);
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("ningún panel audita ni notifica un perfil inexistente", async () => {
    expect(
      await reviewProfessional(null, form("approved", `${P}-missing`)),
    ).toMatchObject({ ok: false });
    await expect(
      adminUpdateProfessionalStatus(form("approved", `${P}-missing`)),
    ).rejects.toThrow("REDIRECT:/admin");
    expect(await audits()).toHaveLength(0);
    expect(mocks.approval).not.toHaveBeenCalled();
  });
  it("el onboarding no cambia perfil, ámbitos, horario ni borrador si una baja gana antes del batch", async () => {
    session("owner");
    await db
      .update(professionals)
      .set({ status: "approved" })
      .where(eq(professionals.id, PRO));
    await db.insert(practiceSettings).values({
      professionalId: PRO,
      timeZone: "America/Caracas",
      workStart: 8,
      workEnd: 17,
      updatedAt: timestamp,
    });
    await db.insert(practiceCredentials).values({
      id: `${P}-scope`,
      professionalId: PRO,
      patientCountry: "Canadá",
      registryReference: "Cotejo ficticio",
      reviewedBy: emails.reviewer,
      reviewedAt: timestamp,
      expiresAt: expiry,
    });
    await db.insert(accountOnboardingDrafts).values({
      userId: `${P}-owner`,
      role: "pro",
      answersJson: '{"fullName":"Borrador ficticio"}',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: expiry,
    });
    deletionBeforeBatch();
    expect(
      await saveProfessionalOnboarding(null, onboardingForm()),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("Conservamos tu borrador"),
    });
    await expectDeletionPreserved();
    expect(
      await db.query.practiceSettings.findFirst({
        where: eq(practiceSettings.professionalId, PRO),
      }),
    ).toMatchObject({
      timeZone: "America/Caracas",
      workStart: 8,
      workEnd: 17,
      updatedAt: timestamp,
    });
    expect(
      await db.query.practiceCredentials.findFirst({
        where: eq(practiceCredentials.professionalId, PRO),
      }),
    ).toMatchObject({ expiresAt: expiry });
    expect(
      await db.query.accountOnboardingDrafts.findFirst({
        where: eq(accountOnboardingDrafts.userId, `${P}-owner`),
      }),
    ).toMatchObject({ answersJson: '{"fullName":"Borrador ficticio"}' });
    expect(
      await saveProfessionalOnboarding(null, onboardingForm()),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("eliminación"),
    });
    await expectDeletionPreserved();
  });
});
