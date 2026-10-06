import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { and, eq, like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PatientNotes } from "@/components/practice/patient-notes";
import { db } from "@/db";
import {
  practiceAppointments,
  practiceNotes,
  practicePatients,
  professionals,
  session,
  user,
} from "@/db/schema";
import { decryptNote, encryptNote } from "@/lib/practice/note-crypto";

const gates = vi.hoisted(() => ({
  afterEncrypt: null as null | (() => Promise<void>),
  afterPatient: null as null | (() => Promise<void>),
}));
vi.mock("@/lib/practice/note-crypto", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/practice/note-crypto")
  >("@/lib/practice/note-crypto");
  return {
    ...actual,
    encryptNote: async (...args: Parameters<typeof actual.encryptNote>) => {
      const result = await actual.encryptNote(...args);
      await gates.afterEncrypt?.();
      return result;
    },
  };
});
vi.mock("@/lib/practice/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/practice/access")>(
    "@/lib/practice/access",
  );
  return {
    ...actual,
    ownedPatient: async (...args: Parameters<typeof actual.ownedPatient>) => {
      const result = await actual.ownedPatient(...args);
      await gates.afterPatient?.();
      return result;
    },
  };
});
const P = "test-private-notes";
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({
    session: { id: `${P}-auth-session` },
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
  if (
    !process.env.DATABASE_URL?.startsWith("file:") ||
    !process.env.DATABASE_URL.includes("/nido-tests-")
  ) {
    throw new Error(
      "Esta prueba requiere la BD efímera de pnpm test:isolated.",
    );
  }
  await db.delete(practiceNotes).where(like(practiceNotes.id, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function restoreAuth() {
  await db
    .insert(session)
    .values({
      id: `${P}-auth-session`,
      userId: `${P}-user`,
      token: `${P}-token`,
      expiresAt: new Date(Date.now() + 3600000),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: session.id,
      set: { expiresAt: new Date(Date.now() + 3600000) },
    });
}
describe("notas privadas con cifrado e integridad", () => {
  beforeAll(async () => {
    if (
      !process.env.DATABASE_URL?.startsWith("file:") ||
      !process.env.DATABASE_URL.includes("/nido-tests-")
    ) {
      throw new Error(
        "Esta prueba requiere la BD efímera de pnpm test:isolated.",
      );
    }
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
      await db.insert(practiceAppointments).values({
        id: `${P}-session${suffix}`,
        professionalId: `${P}-pro${suffix}`,
        patientId: `${P}-patient${suffix}`,
        startsAt: "2026-10-01T14:00:00.000Z",
        endsAt: "2026-10-01T14:50:00.000Z",
        timeZone: "UTC",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    await restoreAuth();
    await db.insert(practiceAppointments).values({
      id: `${P}-session-2`,
      professionalId: `${P}-pro`,
      patientId: `${P}-patient`,
      startsAt: "2026-10-02T14:00:00.000Z",
      endsAt: "2026-10-02T14:50:00.000Z",
      timeZone: "UTC",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.insert(practicePatients).values({
      id: `${P}-patient-same-pro`,
      professionalId: `${P}-pro`,
      name: "Otra ficha ficticia",
      country: "Venezuela",
      timeZone: "UTC",
      consentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.insert(practiceAppointments).values({
      id: `${P}-session-same-pro`,
      professionalId: `${P}-pro`,
      patientId: `${P}-patient-same-pro`,
      startsAt: "2026-10-03T14:00:00.000Z",
      endsAt: "2026-10-03T14:50:00.000Z",
      timeZone: "UTC",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    key();
    const client = createClient({ url: process.env.DATABASE_URL || "" });
    const migration = await readFile(
      new URL("../../drizzle/0036_session_notes.sql", import.meta.url),
      "utf8",
    );
    // Solo la BD efímera verificada arriba: simula una fila creada antes de 0036.
    // El guard se restaura antes de ejecutar cualquiera de las pruebas.
    await client.execute(
      "DROP TRIGGER IF EXISTS practice_notes_session_insert",
    );
    try {
      await db.insert(practiceNotes).values({
        id: `${P}-legacy`,
        professionalId: `${P}-pro`,
        patientId: `${P}-patient`,
        ciphertext: await encryptNote(
          "Nota antigua ficticia",
          `${P}-pro`,
          `${P}-patient`,
          `${P}-legacy`,
        ),
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      });
    } finally {
      try {
        for (const statement of migration.split("--> statement-breakpoint")) {
          if (statement.trim().startsWith("CREATE TRIGGER"))
            await client.execute(statement);
        }
      } finally {
        client.close();
      }
    }
  });
  afterAll(cleanup);
  afterEach(() => {
    gates.afterEncrypt = null;
    gates.afterPatient = null;
    vi.unstubAllEnvs();
  });
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
      appointmentId: `${P}-session`,
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
  it("rechaza una revisión positiva sin identificador antes de insertar", async () => {
    key();
    const before = await db
      .select()
      .from(practiceNotes)
      .where(eq(practiceNotes.patientId, `${P}-patient`));
    const result = await savePatientNote({
      patientId: `${P}-patient`,
      appointmentId: `${P}-session`,
      revision: 5,
      content: "Apunte ficticio sin ID",
    });
    expect(result.ok).toBe(false);
    expect(result.revision).toBeUndefined();
    expect(
      await db
        .select()
        .from(practiceNotes)
        .where(eq(practiceNotes.patientId, `${P}-patient`)),
    ).toEqual(before);
  });
  it("dos ventanas no sobrescriben la misma revisión", async () => {
    key();
    const base = {
      patientId: `${P}-patient`,
      appointmentId: `${P}-session`,
      id: `${P}-note`,
      revision: 1,
    };
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
  it("reintentar una edición cuya respuesta se perdió confirma el guardado sin otra escritura", async () => {
    key();
    const base = {
      patientId: `${P}-patient`,
      appointmentId: `${P}-session`,
      id: `${P}-edit-retry`,
      content: "Apunte inicial ficticio",
      revision: 0,
    };
    expect(await savePatientNote(base)).toMatchObject({
      ok: true,
      revision: 1,
    });
    const edit = { ...base, content: "Apunte ficticio editado", revision: 1 };
    expect(await savePatientNote(edit)).toMatchObject({
      ok: true,
      revision: 2,
    });
    const saved = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, base.id),
    });
    expect(await savePatientNote(edit)).toMatchObject({
      ok: true,
      id: base.id,
      revision: 2,
    });
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, base.id),
      }),
    ).toEqual(saved);
    expect(
      (await savePatientNote({ ...edit, content: "Otra edición ficticia" })).ok,
    ).toBe(false);
    expect(
      (await savePatientNote({ ...edit, appointmentId: `${P}-session-2` })).ok,
    ).toBe(false);
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, base.id),
      }),
    ).toEqual(saved);
    expect(await savePatientNote({ ...edit, revision: 2 })).toMatchObject({
      ok: true,
      revision: 3,
    });
    const latest = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, base.id),
    });
    expect((await savePatientNote(edit)).ok).toBe(false);
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, base.id),
      }),
    ).toEqual(latest);
  });
  it.each([
    undefined,
    null,
    "",
    "inexistente",
    `${P}-session-other`,
    `${P}-session-same-pro`,
  ])("rechaza sesión ausente o de otra ficha: %s", async (appointmentId) => {
    key();
    expect(
      (
        await savePatientNote({
          patientId: `${P}-patient`,
          appointmentId,
          content: "Ejemplo ficticio",
        })
      ).ok,
    ).toBe(false);
  });
  it("conserva y permite editar notas antiguas sin inventar una sesión", async () => {
    key();
    const result = await savePatientNote({
      patientId: `${P}-patient`,
      id: `${P}-legacy`,
      revision: 1,
      content: "Nota antigua revisada",
    });
    expect(result).toMatchObject({ ok: true, revision: 2 });
    const saved = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, `${P}-legacy`),
    });
    expect(
      await savePatientNote({
        patientId: `${P}-patient`,
        id: `${P}-legacy`,
        revision: 1,
        content: "Nota antigua revisada",
      }),
    ).toMatchObject({ ok: true, revision: 2 });
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, `${P}-legacy`),
      }),
    ).toEqual(saved);
    expect(
      (
        await savePatientNote({
          patientId: `${P}-patient`,
          appointmentId: `${P}-session`,
          id: `${P}-legacy`,
          revision: 2,
          content: "Traslado no permitido",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, `${P}-legacy`),
        })
      )?.appointmentId,
    ).toBeNull();
  });
  it("no permite mover una nota ni reutilizar su ID en otra sesión", async () => {
    key();
    const base = {
      patientId: `${P}-patient`,
      id: `${P}-fixed-session`,
      content: "Nota de sesión fija",
      revision: 0,
    };
    expect(
      (await savePatientNote({ ...base, appointmentId: `${P}-session` })).ok,
    ).toBe(true);
    expect(
      (await savePatientNote({ ...base, appointmentId: `${P}-session-2` })).ok,
    ).toBe(false);
    expect(
      (
        await savePatientNote({
          ...base,
          revision: 1,
          appointmentId: `${P}-session-2`,
        })
      ).ok,
    ).toBe(false);
    await expect(
      db
        .update(practiceNotes)
        .set({ appointmentId: `${P}-session-2` })
        .where(eq(practiceNotes.id, base.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(practiceNotes)
        .set({ appointmentId: null })
        .where(eq(practiceNotes.id, base.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(practiceAppointments)
        .set({ patientId: `${P}-patient-same-pro` })
        .where(eq(practiceAppointments.id, `${P}-session`)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(practiceAppointments)
        .where(eq(practiceAppointments.id, `${P}-session`)),
    ).rejects.toThrow();
  });
  it.each([
    "cancelled",
    "completed",
  ])("admite varias notas y edición en una sesión %s", async (status) => {
    key();
    await db
      .update(practiceAppointments)
      .set({ status })
      .where(eq(practiceAppointments.id, `${P}-session-2`));
    for (const suffix of ["a", "b"]) {
      const base = {
        patientId: `${P}-patient`,
        appointmentId: `${P}-session-2`,
        id: `${P}-${status}-${suffix}`,
        revision: 0,
        content: "Apunte ficticio",
      };
      expect((await savePatientNote(base)).ok).toBe(true);
      expect(
        (
          await savePatientNote({
            ...base,
            revision: 1,
            content: "Apunte ficticio revisado",
          })
        ).ok,
      ).toBe(true);
    }
  });
  it("pagina, filtra por fecha local del encuentro y separa las notas antiguas", async () => {
    key();
    for (let index = 0; index < 12; index++) {
      await savePatientNote({
        patientId: `${P}-patient`,
        appointmentId: `${P}-session-2`,
        id: `${P}-page-${index}`,
        content: `Nota paginada ficticia ${index}`,
      });
    }
    const render = async (query: Parameters<typeof PatientNotes>[0]["query"]) =>
      renderToStaticMarkup(
        await PatientNotes({
          patientId: `${P}-patient`,
          professionalId: `${P}-pro`,
          timeZone: "America/Caracas",
          query,
        }),
      );
    const html = await render({ notaSesion: `${P}-session-2`, notas: "2" });
    expect(html).toContain("Página 2 de 2");
    expect(html).toContain("Notas anteriores sin sesión");
    expect(html).not.toContain("Nota antigua revisada");
    expect(html).toContain("Comprobando acceso…");
    expect(html).not.toContain("Nota de sesión fija");
    expect(html).not.toContain("v1.");
    const filtered = await render({ encuentro: "2026-10-01" });
    expect(filtered).toContain("notaSesion=test-private-notes-session#notas");
    expect(filtered).not.toContain("notaSesion=test-private-notes-session-2");
    expect(await render({ encuentro: "2026-10-01" })).not.toContain(
      "Nota paginada ficticia",
    );
    expect(await render({ encuentro: "2026-12-01" })).toContain(
      "No hay sesiones para esta fecha",
    );
    expect(await render({ notaSesion: `${P}-session-other` })).toContain(
      "Esta sesión no está disponible",
    );
    expect(await render({ notaSesion: `${P}-session-other` })).not.toContain(
      "Nueva nota privada",
    );
  });
  it.each([
    "suspended",
    "deleting",
  ])("si pasa a %s durante el cifrado no crea ni edita ni elimina notas", async (status) => {
    key();
    const base = {
      patientId: `${P}-patient`,
      appointmentId: `${P}-session`,
      id: `${P}-actor-${status}`,
      revision: 0,
      content: "Apunte ficticio estable",
    };
    expect((await savePatientNote(base)).ok).toBe(true);
    const before = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, base.id),
    });
    const restore = () =>
      db
        .update(professionals)
        .set({ status: "approved" })
        .where(eq(professionals.id, `${P}-pro`));
    const revoke = async () => {
      await db
        .update(professionals)
        .set({ status })
        .where(eq(professionals.id, `${P}-pro`));
    };
    try {
      gates.afterEncrypt = revoke;
      expect(
        (await savePatientNote({ ...base, id: `${base.id}-new` })).ok,
      ).toBe(false);
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, `${base.id}-new`),
        }),
      ).toBeUndefined();
      await restore();
      expect(
        (
          await savePatientNote({
            ...base,
            revision: 1,
            content: "Cambio rechazado",
          })
        ).ok,
      ).toBe(false);
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, base.id),
        }),
      ).toEqual(before);
      await restore();
      gates.afterEncrypt = null;
      gates.afterPatient = revoke;
      expect((await deletePatientNote(base.patientId, base.id, 1)).ok).toBe(
        false,
      );
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, base.id),
        }),
      ).toEqual(before);
    } finally {
      gates.afterEncrypt = null;
      gates.afterPatient = null;
      await restore();
    }
  });
  it.each([
    "deleted",
    "expired",
  ])("la sesión %s después del guard inicial impide crear, editar, confirmar retry y eliminar", async (kind) => {
    key();
    const base = {
      patientId: `${P}-patient`,
      appointmentId: `${P}-session`,
      id: `${P}-auth-${kind}`,
      revision: 0,
      content: "Nota ficticia con sesión vigente",
    };
    expect((await savePatientNote(base)).ok).toBe(true);
    const before = await db.query.practiceNotes.findFirst({
      where: eq(practiceNotes.id, base.id),
    });
    const revoke = async () => {
      if (kind === "deleted")
        await db.delete(session).where(eq(session.id, `${P}-auth-session`));
      else
        await db
          .update(session)
          .set({ expiresAt: new Date(0) })
          .where(eq(session.id, `${P}-auth-session`));
    };
    try {
      gates.afterEncrypt = revoke;
      expect(
        (await savePatientNote({ ...base, id: `${base.id}-new` })).ok,
      ).toBe(false);
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, `${base.id}-new`),
        }),
      ).toBeUndefined();
      await restoreAuth();
      expect(
        (
          await savePatientNote({
            ...base,
            revision: 1,
            content: "Cambio ficticio rechazado",
          })
        ).ok,
      ).toBe(false);
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, base.id),
        }),
      ).toEqual(before);
      await restoreAuth();
      expect((await savePatientNote(base)).ok).toBe(false);
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, base.id),
        }),
      ).toEqual(before);
      await restoreAuth();
      gates.afterEncrypt = null;
      gates.afterPatient = revoke;
      expect((await deletePatientNote(base.patientId, base.id, 1)).ok).toBe(
        false,
      );
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, base.id),
        }),
      ).toEqual(before);
      await restoreAuth();
      gates.afterPatient = null;
      const edit = {
        ...base,
        revision: 1,
        content: "Edición ficticia ya confirmada",
      };
      expect((await savePatientNote(edit)).ok).toBe(true);
      const edited = await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, base.id),
      });
      gates.afterEncrypt = revoke;
      expect((await savePatientNote(edit)).ok).toBe(false);
      expect(
        await db.query.practiceNotes.findFirst({
          where: eq(practiceNotes.id, base.id),
        }),
      ).toEqual(edited);
    } finally {
      gates.afterEncrypt = null;
      gates.afterPatient = null;
      await restoreAuth();
    }
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
      appointmentId: `${P}-session`,
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
