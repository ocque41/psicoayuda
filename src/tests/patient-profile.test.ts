import { eq, like } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import {
  auditLogs,
  practicePatientProfiles,
  practicePatients,
  professionals,
  session,
  user,
} from "@/db/schema";
import { decryptNote, encryptNote } from "@/lib/practice/note-crypto";
import { readPatientProfile } from "@/lib/practice/patient-profile";
import {
  decryptPatientProfile,
  encryptPatientProfile,
} from "@/lib/practice/patient-profile-crypto";
import {
  emptyPatientProfile,
  patientProfileSchema,
} from "@/lib/practice/patient-profile-domain";
import { practiceDeleteStatements } from "@/lib/practice/purge";

const hooks = vi.hoisted(() => ({
  afterEncrypt: null as null | (() => Promise<void>),
  afterDecrypt: null as null | (() => Promise<void>),
  authId: "test-profile-auth",
  userId: "test-profile-user",
}));
vi.mock("@/lib/practice/patient-profile-crypto", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/practice/patient-profile-crypto")
  >("@/lib/practice/patient-profile-crypto");
  return {
    ...actual,
    encryptPatientProfile: async (
      ...args: Parameters<typeof actual.encryptPatientProfile>
    ) => {
      const result = await actual.encryptPatientProfile(...args);
      await hooks.afterEncrypt?.();
      return result;
    },
    decryptPatientProfile: async (
      ...args: Parameters<typeof actual.decryptPatientProfile>
    ) => {
      const result = await actual.decryptPatientProfile(...args);
      await hooks.afterDecrypt?.();
      return result;
    },
  };
});
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({
    user: { id: hooks.userId, email: "test-profile@example.test" },
    session: { id: hooks.authId },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { createPatient } from "@/app/pro/consulta/actions";
import { savePatientProfile } from "@/app/pro/pacientes/[patientId]/profile-actions";

const P = "test-profile";
const patientId = `${P}-patient`;
const proId = `${P}-pro`;
const content = {
  sex: "female" as const,
  birthDate: "1992-02-29",
  consultationReason: "Motivo completamente ficticio.",
  generalNote: "Apunte general ficticio, separado de las sesiones.",
};
const input = (revision = 0) => ({
  ...content,
  patientId,
  revision,
  consent: true,
});
const iso = () => new Date().toISOString();
async function cleanup() {
  if (
    !process.env.DATABASE_URL?.startsWith("file:") ||
    !process.env.DATABASE_URL.includes("/nido-tests-")
  )
    throw new Error("Esta suite requiere la BD efímera de test:isolated.");
  await db
    .delete(practicePatientProfiles)
    .where(like(practicePatientProfiles.professionalId, `${P}%`));
  await db
    .delete(practicePatients)
    .where(like(practicePatients.professionalId, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.actorEmail, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function seed() {
  hooks.afterEncrypt = null;
  hooks.afterDecrypt = null;
  hooks.authId = `${P}-auth`;
  hooks.userId = `${P}-user`;
  await cleanup();
  vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "34".repeat(32));
  for (const suffix of ["", "-other"]) {
    await db.insert(user).values({
      id: `${P}-user${suffix}`,
      name: "Cuenta ficticia",
      email: `${P}${suffix}@example.test`,
    });
    await db.insert(session).values({
      id: `${P}-auth${suffix}`,
      userId: `${P}-user${suffix}`,
      token: `${P}-token${suffix}`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await db.insert(professionals).values({
      id: `${P}-pro${suffix}`,
      userId: `${P}-user${suffix}`,
      email: `${P}${suffix}@example.test`,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: "[]",
      supportAreas: "[]",
      createdAt: iso(),
      updatedAt: iso(),
    });
    await db.insert(practicePatients).values({
      id: `${P}-patient${suffix}`,
      professionalId: `${P}-pro${suffix}`,
      name: "Persona ficticia",
      country: "Venezuela",
      timeZone: "America/Caracas",
      consentAt: iso(),
      createdAt: iso(),
      updatedAt: iso(),
    });
  }
}
const profileRow = () =>
  db.query.practicePatientProfiles.findFirst({
    where: eq(practicePatientProfiles.patientId, patientId),
  });
function patientForm(extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Persona nueva ficticia",
    email: "",
    country: "Venezuela",
    timeZone: "America/Caracas",
    program: "general",
    consent: "on",
    ...extra,
  }))
    form.set(key, value);
  return form;
}

describe("ficha opcional con fechas locales", () => {
  it("permite omitir todos los campos", () =>
    expect(patientProfileSchema("UTC").parse({})).toEqual(emptyPatientProfile));
  it.each([
    "2025-02-29",
    "2026-04-31",
    "0000-01-01",
    "2026-1-01",
    "no-fecha",
  ])("rechaza fecha inexistente %s", (birthDate) =>
    expect(patientProfileSchema("UTC").safeParse({ birthDate }).success).toBe(
      false,
    ));
  it("acepta bisiesto real y recorta textos", () =>
    expect(
      patientProfileSchema("UTC").parse({
        ...content,
        generalNote: "  Nota ficticia  ",
      }),
    ).toMatchObject({ birthDate: "1992-02-29", generalNote: "Nota ficticia" }));
  it("decide futuro en el día local del paciente", () => {
    const now = new Date("2026-10-06T02:00:00Z");
    expect(
      patientProfileSchema("America/Caracas", now).safeParse({
        birthDate: "2026-10-06",
      }).success,
    ).toBe(false);
    expect(
      patientProfileSchema("Pacific/Kiritimati", now).safeParse({
        birthDate: "2026-10-06",
      }).success,
    ).toBe(true);
  });
  it("rechaza vocabulario y zona inválidos", () => {
    expect(
      patientProfileSchema("UTC").safeParse({ sex: "inventado" }).success,
    ).toBe(false);
    expect(patientProfileSchema("Invalid/Zone").safeParse({}).success).toBe(
      false,
    );
  });
});

describe("ficha privada cifrada con actor vivo y revisión CAS", () => {
  beforeEach(seed);
  afterEach(() => {
    hooks.afterEncrypt = null;
    hooks.afterDecrypt = null;
    vi.unstubAllEnvs();
  });
  afterAll(cleanup);
  it("cifra con nonce y AAD de ficha propio, conservando notas v1", async () => {
    const a = await encryptPatientProfile(content, proId, patientId);
    const b = await encryptPatientProfile(content, proId, patientId);
    expect(a).not.toBe(b);
    expect(a).not.toContain(content.generalNote);
    expect(await decryptPatientProfile(a, proId, patientId)).toEqual(content);
    await expect(
      decryptPatientProfile(a, `${proId}-other`, patientId),
    ).rejects.toThrow();
    await expect(
      decryptPatientProfile(a, proId, `${patientId}-other`),
    ).rejects.toThrow();
    await expect(
      decryptNote(a, proId, patientId, "patient-profile-v1"),
    ).rejects.toThrow();
    const note = await encryptNote(
      "Nota de sesión ficticia",
      proId,
      patientId,
      "patient-profile-v1",
    );
    expect(
      await decryptNote(note, proId, patientId, "patient-profile-v1"),
    ).toBe("Nota de sesión ficticia");
    await expect(
      decryptPatientProfile(note, proId, patientId),
    ).rejects.toThrow();
  });
  it("lee ficha vacía propia, nunca otro dueño o actor", async () => {
    expect(await readPatientProfile(patientId, proId)).toMatchObject({
      status: "ready",
      revision: 0,
      content: emptyPatientProfile,
    });
    expect(
      await readPatientProfile(`${patientId}-other`, `${proId}-other`),
    ).toMatchObject({ status: "unavailable" });
    expect(
      (
        await savePatientProfile({
          ...input(),
          patientId: `${patientId}-other`,
        })
      ).ok,
    ).toBe(false);
  });
  it("inserta cifrado, audita sin datos clínicos y vuelve a leer", async () => {
    expect(await savePatientProfile(input())).toMatchObject({
      ok: true,
      revision: 1,
    });
    expect(await readPatientProfile(patientId, proId)).toMatchObject({
      status: "ready",
      revision: 1,
      content,
    });
    const row = await profileRow();
    expect(row?.contentCiphertext).not.toContain(content.consultationReason);
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, patientId));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "patient_profile_saved",
      metadata: null,
    });
    expect(JSON.stringify(logs)).not.toContain(content.generalNote);
  });
  it("necesita consentimiento y revisión enviada válida", async () => {
    expect((await savePatientProfile({ ...input(), consent: false })).ok).toBe(
      false,
    );
    expect((await savePatientProfile({ ...input(), revision: -1 })).ok).toBe(
      false,
    );
    expect(await profileRow()).toBeUndefined();
  });
  it("detecta edición simultánea y conserva la primera", async () => {
    const results = await Promise.all([
      savePatientProfile(input()),
      savePatientProfile({ ...input(), generalNote: "Otro apunte ficticio" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect((await profileRow())?.revision).toBe(1);
  });
  it("actualiza por CAS y permite borrar sólo datos adicionales", async () => {
    expect((await savePatientProfile(input())).ok).toBe(true);
    expect(
      (
        await savePatientProfile({
          ...input(),
          generalNote: "Texto obsoleto ficticio",
        })
      ).ok,
    ).toBe(false);
    expect(
      await savePatientProfile({ ...input(1), ...emptyPatientProfile }),
    ).toMatchObject({ ok: true, revision: 2 });
    expect((await readPatientProfile(patientId, proId)).content).toEqual(
      emptyPatientProfile,
    );
    expect(
      await db.query.practicePatients.findFirst({
        where: eq(practicePatients.id, patientId),
      }),
    ).toBeTruthy();
  });
  it("no inserta una ficha vacía", async () => {
    expect(
      await savePatientProfile({ ...input(), ...emptyPatientProfile }),
    ).toMatchObject({ ok: true, revision: 0 });
    expect(await profileRow()).toBeUndefined();
  });
  it.each([
    "suspension",
    "session",
    "expiry",
  ])("rechaza revocación durante cifrado: %s", async (mode) => {
    hooks.afterEncrypt = async () => {
      if (mode === "suspension")
        await db
          .update(professionals)
          .set({ status: "pending" })
          .where(eq(professionals.id, proId));
      else if (mode === "session")
        await db.delete(session).where(eq(session.id, `${P}-auth`));
      else
        await db
          .update(session)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(session.id, `${P}-auth`));
    };
    expect((await savePatientProfile(input())).ok).toBe(false);
    expect(await profileRow()).toBeUndefined();
    expect(
      await db.query.auditLogs.findFirst({
        where: eq(auditLogs.entityId, patientId),
      }),
    ).toBeUndefined();
  });
  it("rechaza cambio de zona durante cifrado", async () => {
    hooks.afterEncrypt = async () => {
      await db
        .update(practicePatients)
        .set({ timeZone: "Pacific/Kiritimati" })
        .where(eq(practicePatients.id, patientId));
    };
    expect((await savePatientProfile(input())).ok).toBe(false);
    expect(await profileRow()).toBeUndefined();
  });
  it("no devuelve contenido si revocan mientras descifra", async () => {
    expect((await savePatientProfile(input())).ok).toBe(true);
    hooks.afterDecrypt = async () => {
      await db.delete(session).where(eq(session.id, `${P}-auth`));
    };
    expect(await readPatientProfile(patientId, proId)).toMatchObject({
      status: "unavailable",
      content: emptyPatientProfile,
    });
  });
  it("una sesión vencida o perteneciente a otra cuenta no lee ni guarda", async () => {
    await savePatientProfile(input());
    hooks.authId = `${P}-auth-other`;
    expect((await readPatientProfile(patientId, proId)).status).toBe(
      "unavailable",
    );
    expect((await savePatientProfile(input(1))).ok).toBe(false);
    hooks.authId = `${P}-auth`;
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.id, hooks.authId));
    expect((await readPatientProfile(patientId, proId)).status).toBe(
      "unavailable",
    );
    expect((await savePatientProfile(input(1))).ok).toBe(false);
    expect((await profileRow())?.revision).toBe(1);
  });
  it("suspensión antes del clic devuelve error y conserva ficha", async () => {
    await savePatientProfile(input());
    await db
      .update(professionals)
      .set({ status: "pending" })
      .where(eq(professionals.id, proId));
    expect(await savePatientProfile(input(1))).toMatchObject({ ok: false });
    expect((await profileRow())?.revision).toBe(1);
  });
  it("no lee ni sobrescribe ciphertext corrupto", async () => {
    await db.insert(practicePatientProfiles).values({
      patientId,
      professionalId: proId,
      contentCiphertext: "v1.corrupto.no-valido",
      revision: 1,
      updatedAt: iso(),
    });
    expect((await readPatientProfile(patientId, proId)).status).toBe(
      "unavailable",
    );
    expect((await savePatientProfile(input(1))).ok).toBe(false);
    expect((await profileRow())?.contentCiphertext).toBe(
      "v1.corrupto.no-valido",
    );
  });
  it("triggers impiden insertar y reasignar entre dueños", async () => {
    await expect(
      db.insert(practicePatientProfiles).values({
        patientId,
        professionalId: `${proId}-other`,
        contentCiphertext: "opaque",
        updatedAt: iso(),
      }),
    ).rejects.toThrow();
    expect((await savePatientProfile(input())).ok).toBe(true);
    await expect(
      db
        .update(practicePatientProfiles)
        .set({ professionalId: `${proId}-other` })
        .where(eq(practicePatientProfiles.patientId, patientId)),
    ).rejects.toThrow();
    await expect(
      db
        .update(practicePatients)
        .set({ professionalId: `${proId}-other` })
        .where(eq(practicePatients.id, patientId)),
    ).rejects.toThrow();
    expect((await profileRow())?.professionalId).toBe(proId);
  });
  it("alta crea contacto y documento cifrado en el mismo batch", async () => {
    expect((await createPatient(null, patientForm(content)))?.ok).toBe(true);
    const created = await db.query.practicePatients.findFirst({
      where: eq(practicePatients.name, "Persona nueva ficticia"),
    });
    const profile = await db.query.practicePatientProfiles.findFirst({
      where: eq(practicePatientProfiles.patientId, created?.id || "missing"),
    });
    expect(profile?.revision).toBe(1);
    expect(
      await decryptPatientProfile(
        profile?.contentCiphertext || "",
        proId,
        created?.id || "",
      ),
    ).toEqual(content);
  });
  it("alta sin datos opcionales crea sólo contacto", async () => {
    expect((await createPatient(null, patientForm()))?.ok).toBe(true);
    const created = await db.query.practicePatients.findFirst({
      where: eq(practicePatients.name, "Persona nueva ficticia"),
    });
    expect(created).toBeTruthy();
    expect(
      await db.query.practicePatientProfiles.findFirst({
        where: eq(practicePatientProfiles.patientId, created?.id || "missing"),
      }),
    ).toBeUndefined();
  });
  it("fallo de cifrado y revocación evitan alta parcial y auditoría", async () => {
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "");
    expect((await createPatient(null, patientForm(content)))?.ok).toBe(false);
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "34".repeat(32));
    hooks.afterEncrypt = async () => {
      await db.delete(session).where(eq(session.id, `${P}-auth`));
    };
    expect((await createPatient(null, patientForm(content)))?.ok).toBe(false);
    expect(
      await db.query.practicePatients.findFirst({
        where: eq(practicePatients.name, "Persona nueva ficticia"),
      }),
    ).toBeUndefined();
    expect(
      await db.query.auditLogs.findFirst({
        where: eq(auditLogs.action, "patient_created"),
      }),
    ).toBeUndefined();
  });
  it("purga ampliación antes del contacto y conserva otro profesional", async () => {
    await savePatientProfile(input());
    const before = await db.query.practicePatients.findFirst({
      where: eq(practicePatients.id, `${patientId}-other`),
    });
    const statements = practiceDeleteStatements(proId);
    const sqls = statements.map((statement) => statement.toSQL().sql);
    expect(
      sqls.findIndex((sql) => sql.includes('"practice_patient_profiles"')),
    ).toBeLessThan(
      sqls.findIndex((sql) => sql.includes('"practice_patients"')),
    );
    await db.batch([statements[0], ...statements.slice(1)]);
    expect(await profileRow()).toBeUndefined();
    expect(
      await db.query.practicePatients.findFirst({
        where: eq(practicePatients.id, `${patientId}-other`),
      }),
    ).toEqual(before);
  });
});
