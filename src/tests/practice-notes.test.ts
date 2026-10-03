import { and, eq, like } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import {
  practiceNotes,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";
import { decryptNote, encryptNote } from "@/lib/practice/note-crypto";

const P = "test-private-notes";
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({
    user: { id: `${P}-user`, email: `${P}@example.test` },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  deletePatientNote,
  savePatientNote,
} from "@/app/pro/pacientes/[patientId]/note-actions";

async function cleanup() {
  await db.delete(practiceNotes).where(like(practiceNotes.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
describe("notas privadas con cifrado e integridad", () => {
  beforeAll(async () => {
    await cleanup();
    for (const suffix of ["", "-other"]) {
      await db.insert(user).values({
        id: `${P}-user${suffix}`,
        name: "Profesional ficticio",
        email: `${P}${suffix}@example.test`,
      });
      await db.insert(professionals).values({
        id: `${P}-pro${suffix}`,
        userId: `${P}-user${suffix}`,
        fullName: "Profesional ficticio",
        email: `${P}${suffix}@example.test`,
        status: "approved",
        languages: '["es"]',
        supportAreas: "[]",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await db.insert(practicePatients).values({
        id: `${P}-patient${suffix}`,
        professionalId: `${P}-pro${suffix}`,
        name: "Persona de prueba",
        country: "Venezuela",
        timeZone: "UTC",
        consentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });
  afterAll(cleanup);
  afterEach(() => vi.unstubAllEnvs());
  const key = () => vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "12".repeat(32));
  it("cifra con nonce distinto y vincula nota, profesional y paciente", async () => {
    key();
    const text = "Apunte completamente ficticio, sin datos reales.";
    const a = await encryptNote(text, "pro-a", "patient-a", "note-a");
    expect(a).not.toContain(text);
    expect(await encryptNote(text, "pro-a", "patient-a", "note-a")).not.toBe(a);
    expect(await decryptNote(a, "pro-a", "patient-a", "note-a")).toBe(text);
    await expect(
      decryptNote(a, "pro-b", "patient-a", "note-a"),
    ).rejects.toThrow();
    await expect(
      decryptNote(a, "pro-a", "patient-b", "note-a"),
    ).rejects.toThrow();
  });
  it("rechaza acceso a paciente ajeno", async () => {
    key();
    expect(
      (
        await savePatientNote({
          patientId: `${P}-patient-other`,
          content: "Ejemplo",
        })
      ).ok,
    ).toBe(false);
  });
  it("guarda sin texto legible y el reintento no duplica", async () => {
    key();
    const input = {
      patientId: `${P}-patient`,
      id: `${P}-note`,
      revision: 0,
      content: "Ejemplo de nota privada",
    };
    expect(await savePatientNote(input)).toMatchObject({
      ok: true,
      revision: 1,
    });
    expect(await savePatientNote(input)).toMatchObject({
      ok: true,
      revision: 1,
    });
    const rows = await db
      .select()
      .from(practiceNotes)
      .where(eq(practiceNotes.id, input.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].ciphertext).not.toContain(input.content);
  });
  it("dos ventanas no sobrescriben la misma revisión", async () => {
    key();
    const base = { patientId: `${P}-patient`, id: `${P}-note`, revision: 1 };
    const results = await Promise.all([
      savePatientNote({ ...base, content: "Cambio A" }),
      savePatientNote({ ...base, content: "Cambio B" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await deletePatientNote(base.patientId, base.id, 1)).ok).toBe(
      false,
    );
    expect((await deletePatientNote(base.patientId, base.id, 2)).ok).toBe(true);
  });
  it("SQLite no admite notas vinculadas a un paciente de otro dueño", async () => {
    await expect(
      db.insert(practiceNotes).values({
        id: `${P}-illegal`,
        professionalId: `${P}-pro`,
        patientId: `${P}-patient-other`,
        ciphertext: "not-real",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(practiceNotes)
        .where(
          and(
            eq(practiceNotes.id, `${P}-illegal`),
            eq(practiceNotes.professionalId, `${P}-pro`),
          ),
        ),
    ).toHaveLength(0);
  });
  it("el trigger impide trasladar una nota a otra ficha aunque el nuevo dueño sea válido", async () => {
    const id = `${P}-immutable-owner`;
    await db.insert(practiceNotes).values({
      id,
      professionalId: `${P}-pro`,
      patientId: `${P}-patient`,
      ciphertext: "fixture-ciphertext",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await expect(
      db
        .update(practiceNotes)
        .set({
          professionalId: `${P}-pro-other`,
          patientId: `${P}-patient-other`,
        })
        .where(eq(practiceNotes.id, id)),
    ).rejects.toThrow();
    const note = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, id),
    });
    expect(note?.professionalId).toBe(`${P}-pro`);
    expect(note?.patientId).toBe(`${P}-patient`);
    expect(note?.ciphertext).toBe("fixture-ciphertext");
  });
});
