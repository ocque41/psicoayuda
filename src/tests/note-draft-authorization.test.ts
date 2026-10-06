import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
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
import { authorizeNoteDraft } from "@/app/pro/pacientes/[patientId]/note-draft-actions";
import { db } from "@/db";
import {
  practiceAppointments,
  practiceNotes,
  practicePatients,
  professionals,
  session,
  user,
} from "@/db/schema";
import { encryptNote } from "@/lib/practice/note-crypto";

const P = "test-note-draft-auth";
const id = (suffix: string) => `${P}-${suffix}`;
const actor = vi.hoisted(() => ({
  userId: "test-note-draft-auth-user",
  sessionId: "test-note-draft-auth-auth-session",
  onRead: null as null | (() => Promise<void>),
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => {
    const current = {
      user: { id: actor.userId },
      session: { id: actor.sessionId },
    };
    await actor.onRead?.();
    return current;
  },
}));
const input = {
  accountId: id("user"),
  professionalId: id("pro"),
  patientId: id("patient"),
  appointmentId: id("appointment"),
  noteId: id("note"),
  isNew: false,
};
async function cleanup() {
  if (
    !process.env.DATABASE_URL?.includes("/nido-tests-") ||
    !process.env.DATABASE_URL.startsWith("file:")
  )
    throw new Error("Se requiere BD efímera test:isolated");
  await db.delete(practiceNotes).where(like(practiceNotes.id, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function reset() {
  actor.userId = id("user");
  actor.sessionId = id("auth-session");
  actor.onRead = null;
  await db
    .update(professionals)
    .set({ status: "approved", nonClinicalHelper: false })
    .where(eq(professionals.id, id("pro")));
  await db
    .update(practicePatients)
    .set({ status: "active" })
    .where(eq(practicePatients.id, id("patient")));
  await db
    .insert(session)
    .values({
      id: id("auth-session"),
      userId: id("user"),
      token: id("fake-token"),
      expiresAt: new Date(Date.now() + 3600000),
    })
    .onConflictDoUpdate({
      target: session.id,
      set: { expiresAt: new Date(Date.now() + 3600000) },
    });
}
describe("autorización fresca para abrir draft RAM, sólo booleanos", () => {
  beforeAll(async () => {
    await cleanup();
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "34".repeat(32));
    for (const suffix of ["", "-other"]) {
      await db.insert(user).values({
        id: id(`user${suffix}`),
        name: "Cuenta ficticia",
        email: `${id(`user${suffix}`)}@example.test`,
      });
      await db.insert(professionals).values({
        id: id(`pro${suffix}`),
        userId: id(`user${suffix}`),
        fullName: "Profesional ficticio",
        email: `${id(`user${suffix}`)}@example.test`,
        status: "approved",
        languages: "[]",
        supportAreas: "[]",
        createdAt: "2026-10-04T12:00:00Z",
        updatedAt: "2026-10-04T12:00:00Z",
      });
      await db.insert(practicePatients).values({
        id: id(`patient${suffix}`),
        professionalId: id(`pro${suffix}`),
        name: "Ficha ficticia",
        country: "Venezuela",
        timeZone: "UTC",
        consentAt: "2026-10-04T12:00:00Z",
        createdAt: "2026-10-04T12:00:00Z",
        updatedAt: "2026-10-04T12:00:00Z",
      });
      await db.insert(practiceAppointments).values({
        id: id(`appointment${suffix}`),
        patientId: id(`patient${suffix}`),
        professionalId: id(`pro${suffix}`),
        startsAt: "2026-10-04T12:00:00Z",
        endsAt: "2026-10-04T13:00:00Z",
        timeZone: "UTC",
        createdAt: "2026-10-04T12:00:00Z",
        updatedAt: "2026-10-04T12:00:00Z",
      });
      await db.insert(practiceNotes).values({
        id: id(`note${suffix}`),
        professionalId: id(`pro${suffix}`),
        patientId: id(`patient${suffix}`),
        appointmentId: id(`appointment${suffix}`),
        ciphertext: await encryptNote(
          "Nota exclusivamente ficticia",
          id(`pro${suffix}`),
          id(`patient${suffix}`),
          id(`note${suffix}`),
        ),
        revision: 3,
        createdAt: "2026-10-04T12:00:00Z",
        updatedAt: "2026-10-04T12:00:00Z",
      });
    }
    const client = createClient({ url: process.env.DATABASE_URL || "" });
    const migration = await readFile(
      new URL("../../drizzle/0036_session_notes.sql", import.meta.url),
      "utf8",
    );
    await client.execute(
      "DROP TRIGGER IF EXISTS practice_notes_session_insert",
    );
    try {
      await db.insert(practiceNotes).values({
        id: id("legacy"),
        professionalId: id("pro"),
        patientId: id("patient"),
        ciphertext: await encryptNote(
          "Histórico ficticio",
          id("pro"),
          id("patient"),
          id("legacy"),
        ),
        revision: 7,
        createdAt: "2026-09-01T12:00:00Z",
        updatedAt: "2026-09-01T12:00:00Z",
      });
    } finally {
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim().startsWith("CREATE TRIGGER"))
          await client.execute(statement);
      client.close();
    }
  });
  beforeEach(async () => {
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "34".repeat(32));
    await reset();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(cleanup);
  it("devuelve sólo booleanos sin leer/modificar texto, revisión o ciphertext", async () => {
    const before = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, input.noteId),
    });
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: true,
      scopeAllowed: true,
    });
    await db
      .update(practiceNotes)
      .set({ revision: 4 })
      .where(eq(practiceNotes.id, input.noteId));
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: true,
      scopeAllowed: true,
    });
    const after = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, input.noteId),
    });
    expect(after).toEqual({ ...before, revision: 4 });
  });
  it("permite nueva nota sólo en una sesión propia; permite reintento de un ID propio ya guardado", async () => {
    expect(
      (await authorizeNoteDraft({ ...input, isNew: true, noteId: id("new") }))
        .scopeAllowed,
    ).toBe(true);
    expect(
      (await authorizeNoteDraft({ ...input, isNew: true })).scopeAllowed,
    ).toBe(true);
    expect(
      (await authorizeNoteDraft({ ...input, isNew: true, appointmentId: null }))
        .scopeAllowed,
    ).toBe(false);
    expect(
      (
        await authorizeNoteDraft({
          ...input,
          isNew: true,
          noteId: id("note-other"),
        })
      ).scopeAllowed,
    ).toBe(false);
  });
  it("conserva y autoriza histórico NULL sin inventar sesión", async () => {
    const before = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, id("legacy")),
    });
    expect(
      (
        await authorizeNoteDraft({
          ...input,
          noteId: id("legacy"),
          appointmentId: null,
        })
      ).scopeAllowed,
    ).toBe(true);
    expect(
      (await authorizeNoteDraft({ ...input, noteId: id("legacy") }))
        .scopeAllowed,
    ).toBe(false);
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, id("legacy")),
      }),
    ).toEqual(before);
  });
  it("rechaza otra cuenta aun con una página antigua y sus IDs", async () => {
    actor.userId = id("user-other");
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: false,
      scopeAllowed: false,
    });
  });
  it("rechaza ámbitos distintos, nota eliminada y auxiliar", async () => {
    for (const patch of [
      { professionalId: id("pro-other") },
      { patientId: id("patient-other") },
      { appointmentId: id("appointment-other") },
      { noteId: id("note-other") },
      { noteId: id("deleted") },
    ])
      expect(
        (await authorizeNoteDraft({ ...input, ...patch })).scopeAllowed,
      ).toBe(false);
    await db
      .update(professionals)
      .set({ nonClinicalHelper: true })
      .where(eq(professionals.id, id("pro")));
    expect((await authorizeNoteDraft(input)).scopeAllowed).toBe(false);
  });
  it.each([
    "suspended",
    "deleting",
    "pending",
  ])("rechaza estado profesional %s después de leer auth", async (status) => {
    actor.onRead = async () => {
      await db
        .update(professionals)
        .set({ status })
        .where(eq(professionals.id, id("pro")));
    };
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: true,
      scopeAllowed: false,
    });
  });
  it("rechaza ficha cerrada y clave no disponible", async () => {
    await db
      .update(practicePatients)
      .set({ status: "closed" })
      .where(eq(practicePatients.id, id("patient")));
    expect((await authorizeNoteDraft(input)).scopeAllowed).toBe(false);
    await reset();
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "");
    expect((await authorizeNoteDraft(input)).scopeAllowed).toBe(false);
  });
  it("verifica que la sesión aún exista y no expire después de leer auth", async () => {
    actor.onRead = async () => {
      await db.delete(session).where(eq(session.id, id("auth-session")));
    };
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: false,
      scopeAllowed: false,
    });
    await reset();
    actor.onRead = async () => {
      await db
        .update(session)
        .set({ expiresAt: new Date(Date.now() - 1) })
        .where(eq(session.id, id("auth-session")));
    };
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: false,
      scopeAllowed: false,
    });
  });
  it("rechaza inputs inválidos sin redirect ni textos clínicos en respuesta", async () => {
    expect(await authorizeNoteDraft({ ...input, accountId: "" })).toEqual({
      accountCurrent: false,
      scopeAllowed: false,
    });
    actor.sessionId = "";
    expect(await authorizeNoteDraft(input)).toEqual({
      accountCurrent: false,
      scopeAllowed: false,
    });
  });
});
