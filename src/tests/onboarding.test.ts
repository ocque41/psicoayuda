import { and, eq, inArray } from "drizzle-orm";
import {
  afterAll,
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
  accountRolePreferences,
  auditLogs,
  patientAccounts,
  practiceCredentials,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";

const fixture = vi.hoisted(() => ({
  session: {
    user: { id: "test-onboarding-user", email: "test-onboarding@example.test" },
  } as { user: { id: string; email: string } } | null,
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => fixture.session,
}));
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
vi.mock("@/lib/fpv", () => ({ verifyFpvByCedula: vi.fn() }));

import { saveProfessionalOnboarding } from "@/app/actions";
import {
  chooseAccountRole,
  finishPatientOnboarding,
  saveOnboardingDraft,
} from "@/app/empezar/actions";
import {
  persistOnboardingDraft,
  readOnboardingDraft,
  safeOnboardingDraft,
} from "@/lib/onboarding/drafts";
import { completePatientOnboarding } from "@/lib/patient/accounts";

const ID = "test-onboarding-user";
const OTHER = "test-onboarding-other";
const timestamp = () => new Date().toISOString();
function form(values: Record<string, string>) {
  const data = new FormData();
  data.set("expectedOwnerId", ID);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const baseProfessional = {
  fullName: "Profesional ficticio",
  country: "Canadá",
  licenseNumber: "LIC-FICTICIA",
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

async function cleanProfiles() {
  const rows = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(inArray(professionals.userId, [ID, OTHER]));
  if (rows.length) {
    const ids = rows.map((row) => row.id);
    await db
      .delete(practiceCredentials)
      .where(inArray(practiceCredentials.professionalId, ids));
    await db
      .delete(practiceSettings)
      .where(inArray(practiceSettings.professionalId, ids));
    await db.delete(professionals).where(inArray(professionals.id, ids));
  }
  await db
    .delete(accountOnboardingDrafts)
    .where(inArray(accountOnboardingDrafts.userId, [ID, OTHER]));
  await db
    .delete(accountRolePreferences)
    .where(inArray(accountRolePreferences.userId, [ID, OTHER]));
  await db
    .delete(patientAccounts)
    .where(inArray(patientAccounts.userId, [ID, OTHER]));
  await db
    .delete(auditLogs)
    .where(eq(auditLogs.actorEmail, "test-onboarding@example.test"));
}
async function seedApproved(
  overrides: Partial<typeof professionals.$inferInsert> = {},
) {
  await db.insert(professionals).values({
    id: "test-onboarding-pro",
    userId: ID,
    email: "test-onboarding@example.test",
    fullName: baseProfessional.fullName,
    country: baseProfessional.country,
    university: baseProfessional.university,
    licenseNumber: baseProfessional.licenseNumber,
    licenseCountry: baseProfessional.licenseCountry,
    emailPublic: true,
    languages: '["es"]',
    supportAreas: '["orientacion_general"]',
    status: "approved",
    createdAt: timestamp(),
    updatedAt: timestamp(),
    ...overrides,
  });
  await db.insert(practiceCredentials).values({
    id: "test-onboarding-scope",
    professionalId: "test-onboarding-pro",
    patientCountry: "Canadá",
    registryReference: "Revisión ficticia",
    reviewedBy: "Revisor ficticio",
    reviewedAt: timestamp(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
}

describe("Onboarding privado, persistente y con revisión humana", () => {
  beforeAll(async () => {
    await cleanProfiles();
    await db.delete(user).where(inArray(user.id, [ID, OTHER]));
    await db.insert(user).values([
      {
        id: ID,
        name: "Cuenta ficticia",
        email: "test-onboarding@example.test",
      },
      {
        id: OTHER,
        name: "Otra cuenta ficticia",
        email: "test-onboarding-other@example.test",
      },
    ]);
  });
  beforeEach(async () => {
    await cleanProfiles();
    fixture.session = {
      user: { id: ID, email: "test-onboarding@example.test" },
    };
  });
  afterAll(async () => {
    await cleanProfiles();
    await db.delete(user).where(inArray(user.id, [ID, OTHER]));
  });

  it("no persiste borradores ni rol sin una sesión autenticada", async () => {
    fixture.session = null;
    expect(
      (await saveOnboardingDraft("patient", { displayName: "Nombre" }, ID))?.ok,
    ).toBe(false);
    expect((await chooseAccountRole(null, form({ role: "pro" })))?.ok).toBe(
      false,
    );
    expect(
      await db
        .select()
        .from(accountOnboardingDrafts)
        .where(eq(accountOnboardingDrafts.userId, ID)),
    ).toHaveLength(0);
  });
  it("ignora IDs ajenos y elimina datos sensibles del borrador", async () => {
    await saveOnboardingDraft(
      "pro",
      {
        userId: OTHER,
        fullName: "Nombre ficticio",
        country: "España",
        timezone: "Europe/Madrid",
        licenseNumber: "SECRETO",
        cedula: "12345678",
        email: "privado@example.test",
        phone: "+34123456789",
        shortBio: "Relato privado",
        registrationProofDoc: "data:application/pdf;base64,AAAA",
        photo: "data:image/jpeg;base64,AAAA",
      },
      ID,
    );
    expect(await readOnboardingDraft(ID, "pro")).toEqual({
      fullName: "Nombre ficticio",
      country: "España",
      timezone: "Europe/Madrid",
    });
    expect(await readOnboardingDraft(OTHER, "pro")).toEqual({});
  });
  it("no restaura borradores vencidos ni zonas horarias imposibles", async () => {
    await persistOnboardingDraft(ID, "patient", {
      displayName: "Cuenta",
      timezone: "Zona/Inexistente",
      country: "XX",
    });
    expect(await readOnboardingDraft(ID, "patient")).toEqual({
      displayName: "Cuenta",
    });
    await db
      .update(accountOnboardingDrafts)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(accountOnboardingDrafts.userId, ID));
    expect(await readOnboardingDraft(ID, "patient")).toEqual({});
  });
  it("elegir rol profesional no crea credenciales ni concede acceso clínico", async () => {
    await expect(
      chooseAccountRole(null, form({ role: "pro", userId: OTHER })),
    ).rejects.toThrow("REDIRECT:/pro/onboarding");
    expect(
      (
        await db
          .select()
          .from(accountRolePreferences)
          .where(eq(accountRolePreferences.userId, ID))
      )[0]?.role,
    ).toBe("pro");
    expect(
      await db.select().from(professionals).where(eq(professionals.userId, ID)),
    ).toHaveLength(0);
  });
  it("exige privacidad y un recorrido válido antes de completar la cuenta paciente", async () => {
    const values = {
      displayName: "Cuenta ficticia",
      country: "JP",
      timezone: "Asia/Tokyo",
      preferredLanguage: "es",
      ageBand: "adult",
    };
    expect((await finishPatientOnboarding(null, form(values)))?.ok).toBe(false);
    expect(
      (
        await finishPatientOnboarding(
          null,
          form({ ...values, ageBand: "minor", privacyAccepted: "on" }),
        )
      )?.ok,
    ).toBe(false);
    expect(
      await db
        .select()
        .from(patientAccounts)
        .where(eq(patientAccounts.userId, ID)),
    ).toHaveLength(0);
  });
  describe.each([
    "patient",
    "pro",
  ] as const)("finalización %s ligada al dueño", (role) => {
    it.each([
      "missing",
      "foreign",
    ])("rechaza dueño %s sin completar perfiles ni borrar borradores", async (kind) => {
      await persistOnboardingDraft(ID, role, {
        displayName: "Borrador ficticio A",
        fullName: "Borrador ficticio A",
      });
      const data = form(
        role === "patient"
          ? {
              displayName: "Cuenta ficticia A",
              country: "JP",
              timezone: "Asia/Tokyo",
              preferredLanguage: "es",
              ageBand: "adult",
              privacyAccepted: "on",
            }
          : baseProfessional,
      );
      if (kind === "missing") data.delete("expectedOwnerId");
      else data.set("expectedOwnerId", OTHER);
      const result =
        role === "patient"
          ? await finishPatientOnboarding(null, data)
          : await saveProfessionalOnboarding(null, data);
      expect(result).toMatchObject({
        ok: false,
        message: expect.stringContaining("sesión cambió"),
      });
      expect(
        await db
          .select()
          .from(patientAccounts)
          .where(inArray(patientAccounts.userId, [ID, OTHER])),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(professionals)
          .where(inArray(professionals.userId, [ID, OTHER])),
      ).toHaveLength(0);
      expect(await readOnboardingDraft(ID, role)).not.toEqual({});
      expect(
        await db
          .select()
          .from(accountRolePreferences)
          .where(inArray(accountRolePreferences.userId, [ID, OTHER])),
      ).toHaveLength(0);
    });

    it("un guardado confirmado de A no autoriza su FormData final bajo B", async () => {
      await completePatientOnboarding(OTHER, {
        displayName: "Paciente existente B",
        country: "ES",
        timezone: "Europe/Madrid",
        ageBand: "adult",
      });
      await seedApproved({
        userId: OTHER,
        email: "test-onboarding-other@example.test",
        fullName: "Profesional existente B",
        licenseNumber: "LICENCIA-B",
      });
      await persistOnboardingDraft(OTHER, role, {
        displayName: "Borrador B",
        fullName: "Borrador B",
      });
      const patientBefore = await db
        .select()
        .from(patientAccounts)
        .where(eq(patientAccounts.userId, OTHER));
      const professionalBefore = await db
        .select()
        .from(professionals)
        .where(eq(professionals.userId, OTHER));
      const draftBefore = await readOnboardingDraft(OTHER, role);
      // Simula el límite después de flush ok:true y antes del segundo POST.
      expect(
        (
          await saveOnboardingDraft(
            role,
            { displayName: "Guardado A", fullName: "Guardado A" },
            ID,
          )
        )?.ok,
      ).toBe(true);
      const oldForm = form(
        role === "patient"
          ? {
              displayName: "Paciente A",
              country: "JP",
              timezone: "Asia/Tokyo",
              preferredLanguage: "es",
              ageBand: "adult",
              privacyAccepted: "on",
            }
          : baseProfessional,
      );
      fixture.session = {
        user: { id: OTHER, email: "test-onboarding-other@example.test" },
      };
      const result =
        role === "patient"
          ? await finishPatientOnboarding(null, oldForm)
          : await saveProfessionalOnboarding(null, oldForm);
      expect(result).toMatchObject({
        ok: false,
        message: expect.stringContaining("sesión cambió"),
      });
      expect(
        await db
          .select()
          .from(patientAccounts)
          .where(eq(patientAccounts.userId, OTHER)),
      ).toEqual(patientBefore);
      expect(
        await db
          .select()
          .from(professionals)
          .where(eq(professionals.userId, OTHER)),
      ).toEqual(professionalBefore);
      expect(await readOnboardingDraft(OTHER, role)).toEqual(draftBefore);
      expect(await readOnboardingDraft(ID, role)).not.toEqual({});
      expect(
        await db
          .select()
          .from(accountRolePreferences)
          .where(inArray(accountRolePreferences.userId, [ID, OTHER])),
      ).toHaveLength(0);
    });
  });

  it("completa países fuera de Venezuela sin tocar el borrador del otro recorrido", async () => {
    await persistOnboardingDraft(ID, "patient", {
      displayName: "Cuenta ficticia",
      country: "JP",
    });
    await persistOnboardingDraft(ID, "pro", { fullName: "Perfil ficticio" });
    await expect(
      finishPatientOnboarding(
        null,
        form({
          displayName: "Cuenta ficticia",
          country: "JP",
          timezone: "Asia/Tokyo",
          preferredLanguage: "es",
          ageBand: "guardian",
          privacyAccepted: "on",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/mi");
    const account = (
      await db
        .select()
        .from(patientAccounts)
        .where(eq(patientAccounts.userId, ID))
    )[0];
    expect(account.country).toBe("JP");
    expect(account.timezone).toBe("Asia/Tokyo");
    expect(account.onboardingCompletedAt).toBeTruthy();
    expect(await readOnboardingDraft(ID, "patient")).toEqual({});
    expect(await readOnboardingDraft(ID, "pro")).toEqual({
      fullName: "Perfil ficticio",
    });
  });
  it("una licencia internacional nueva queda pendiente y no recibe ámbitos automáticos", async () => {
    await expect(
      saveProfessionalOnboarding(null, form(baseProfessional)),
    ).rejects.toThrow("REDIRECT:/pro/dashboard");
    const profile = await db.query.professionals.findFirst({
      where: eq(professionals.userId, ID),
    });
    expect(profile?.status).toBe("pending_verification");
    expect(profile?.licenseCountry).toBe("Canadá");
    expect(
      (
        await db
          .select()
          .from(practiceSettings)
          .where(eq(practiceSettings.professionalId, profile?.id ?? ""))
      )[0]?.timeZone,
    ).toBe("America/Toronto");
    expect(
      await db
        .select()
        .from(practiceCredentials)
        .where(eq(practiceCredentials.professionalId, profile?.id ?? "")),
    ).toHaveLength(0);
  });
  it("actualizar presentación preserva la aprobación y el comprobante ya recibido", async () => {
    await seedApproved({
      registrationType: "colegio_psicologos",
      registrationDetail: "Registro ficticio",
      registrationProofDoc: "data:application/pdf;base64,AAAA",
    });
    await expect(
      saveProfessionalOnboarding(
        null,
        form({
          ...baseProfessional,
          registrationType: "colegio_psicologos",
          registrationDetail: "Registro ficticio",
          shortBio: "Nueva presentación pública",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/pro/dashboard");
    const profile = await db.query.professionals.findFirst({
      where: eq(professionals.userId, ID),
    });
    expect(profile?.status).toBe("approved");
    expect(profile?.registrationProofDoc).toBe(
      "data:application/pdf;base64,AAAA",
    );
    expect(
      (
        await db
          .select()
          .from(practiceCredentials)
          .where(eq(practiceCredentials.professionalId, "test-onboarding-pro"))
      )[0].expiresAt > timestamp(),
    ).toBe(true);
  });
  it("cambiar una licencia solicita nueva revisión y vence ámbitos conservando su historial", async () => {
    await seedApproved();
    await expect(
      saveProfessionalOnboarding(
        null,
        form({ ...baseProfessional, licenseNumber: "LIC-NUEVA-FICTICIA" }),
      ),
    ).rejects.toThrow("REDIRECT:/pro/dashboard");
    const profile = await db.query.professionals.findFirst({
      where: eq(professionals.userId, ID),
    });
    expect(profile?.status).toBe("pending_verification");
    const scopes = await db
      .select()
      .from(practiceCredentials)
      .where(eq(practiceCredentials.professionalId, "test-onboarding-pro"));
    expect(scopes).toHaveLength(1);
    expect(scopes[0].expiresAt <= timestamp()).toBe(true);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorEmail, "test-onboarding@example.test"),
            eq(auditLogs.action, "professional_credential_review_requested"),
          ),
        ),
    ).toHaveLength(1);
  });
  it("la lista permitida no acepta borradores arbitrarios ni pasos fuera de rango", () => {
    expect(
      safeOnboardingDraft("patient", {
        displayName: "A",
        timezone: "UTC",
        step: -1,
        reason: "Relato clínico",
        password: "privado",
        ageBand: "adult",
      }),
    ).toEqual({ displayName: "A", timezone: "UTC", ageBand: "adult" });
  });
});
