import { eq, like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
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
import { PatientNotes } from "@/components/practice/patient-notes";
import { SessionNotesReminder } from "@/components/practice/session-notes-reminder";
import { db } from "@/db";
import {
  practiceAppointments,
  practiceNotes,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";
import { encryptNote } from "@/lib/practice/note-crypto";
import {
  SESSION_NOTES_REMINDER_WINDOW_MS,
  sessionNotesReminders,
} from "@/lib/practice/session-notes-reminder";

const P = "test-session-notes-reminder";
const actor = vi.hoisted(() => ({
  userId: "test-session-notes-reminder-user",
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({ user: { id: actor.userId } }),
}));
const at = Date.parse("2026-10-04T12:00:00.000Z");
const timestamp = new Date(at).toISOString();
const id = (suffix: string) => `${P}-${suffix}`;
const key = () => vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "12".repeat(32));
async function cleanup() {
  if (
    !process.env.DATABASE_URL?.startsWith("file:") ||
    !process.env.DATABASE_URL.includes("/nido-tests-")
  )
    throw new Error("Esta prueba requiere pnpm test:isolated con BD efímera.");
  await db.delete(practiceNotes).where(like(practiceNotes.id, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function candidates(
  sessions: string[],
  overrides: Partial<Parameters<typeof sessionNotesReminders>[0]> = {},
) {
  return sessionNotesReminders({
    professionalId: id("pro"),
    professionalUserId: id("user"),
    patientId: id("patient"),
    appointmentIds: sessions.map(id),
    now: at,
    ...overrides,
  });
}
describe("pajarito pos-sesión: elegibilidad, CTA privada y límites", () => {
  beforeAll(async () => {
    await cleanup();
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
        languages: '["es"]',
        supportAreas: "[]",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await db.insert(practicePatients).values({
        id: id(`patient${suffix}`),
        professionalId: id(`pro${suffix}`),
        name: "Alias de fixture que jamás viaja al aviso",
        country: "Venezuela",
        timeZone: "UTC",
        consentAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    await db.insert(practicePatients).values({
      id: id("same-pro-patient"),
      professionalId: id("pro"),
      name: "Otra ficha ficticia",
      country: "Venezuela",
      timeZone: "UTC",
      consentAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    for (const [suffix, status, patientId, professionalId, end] of [
      ["done", "completed", id("patient"), id("pro"), at],
      ["scheduled", "scheduled", id("patient"), id("pro"), at],
      ["cancelled", "cancelled", id("patient"), id("pro"), at],
      ["no-show", "no_show", id("patient"), id("pro"), at],
      ["future", "completed", id("patient"), id("pro"), at + 60000],
      [
        "old",
        "completed",
        id("patient"),
        id("pro"),
        at - SESSION_NOTES_REMINDER_WINDOW_MS - 1,
      ],
      ["foreign", "completed", id("patient-other"), id("pro-other"), at],
      [
        "same-pro-other-patient",
        "completed",
        id("same-pro-patient"),
        id("pro"),
        at,
      ],
    ] as const) {
      await db.insert(practiceAppointments).values({
        id: id(suffix),
        patientId,
        professionalId,
        status,
        startsAt: new Date(end - 3600000).toISOString(),
        endsAt: new Date(end).toISOString(),
        timeZone: "UTC",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  });
  beforeEach(key);
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    actor.userId = id("user");
    await db
      .update(professionals)
      .set({ status: "approved", nonClinicalHelper: false })
      .where(eq(professionals.id, id("pro")));
    await db
      .update(practicePatients)
      .set({ status: "active" })
      .where(eq(practicePatients.id, id("patient")));
    await db.delete(practiceNotes).where(like(practiceNotes.id, `${P}%`));
  });
  afterAll(cleanup);
  it("propone apuntes solo después del fin del horario y distingue una cita aún sin marcar realizada", async () => {
    const reminders = await candidates([
      "done",
      "scheduled",
      "cancelled",
      "no-show",
      "future",
      "old",
      "foreign",
      "same-pro-other-patient",
    ]);
    expect(reminders.map((row) => row.appointmentId).sort()).toEqual(
      [id("done"), id("scheduled")].sort(),
    );
    expect(
      reminders.find((row) => row.appointmentId === id("scheduled"))?.body,
    ).toContain("Si el encuentro se realizó");
    expect(
      reminders.find((row) => row.appointmentId === id("done"))?.title,
    ).toBe("Tu sesión terminó");
    expect(await candidates(["done"], { now: at - 1 })).toEqual([]);
    expect(
      await candidates(["done"], {
        now: at + SESSION_NOTES_REMINDER_WINDOW_MS,
      }),
    ).toHaveLength(1);
    expect(
      await candidates(["done"], {
        now: at + SESSION_NOTES_REMINDER_WINDOW_MS + 1,
      }),
    ).toEqual([]);
  });
  it("no devuelve datos clínicos, nombres o direcciones en la proyección para el transporte", async () => {
    const [reminder] = await candidates(["done"]);
    expect(Object.keys(reminder).sort()).toEqual(
      ["appointmentId", "body", "endsAt", "href", "patientId", "title"].sort(),
    );
    const url = new URL(reminder.href, "https://nido.example.test");
    expect(url.pathname).toBe(`/pro/pacientes/${id("patient")}`);
    expect(url.searchParams.get("notaSesion")).toBe(id("done"));
    expect(url.hash).toBe("#nota-nueva");
    expect(JSON.stringify(reminder)).not.toContain("Alias de fixture");
    expect(JSON.stringify(reminder)).not.toContain("example.test");
  });
  it("la ficha muestra el aviso y deja de mostrarlo en cuanto existen notas cifradas propias de ese encuentro", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    const render = () =>
      PatientNotes({
        patientId: id("patient"),
        professionalId: id("pro"),
        timeZone: "UTC",
        query: { notaSesion: id("done") },
      }).then(renderToStaticMarkup);
    const before = await render();
    expect(before).toContain("Tu pajarito de Nido");
    expect(before).toContain("Abrir notas de esta sesión");
    expect(before).toContain("Horario terminado el");
    expect(before).toContain('id="nota-nueva"');
    expect(before).toContain("Escribir una nota para esta sesión");
    const noteId = id("saved-note");
    await db.insert(practiceNotes).values({
      id: noteId,
      professionalId: id("pro"),
      patientId: id("patient"),
      appointmentId: id("done"),
      ciphertext: await encryptNote(
        "Apunte exclusivamente ficticio",
        id("pro"),
        id("patient"),
        noteId,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(await candidates(["done"])).toEqual([]);
    const after = await render();
    expect(after).not.toContain("Tu pajarito de Nido");
    expect(after).not.toContain("Apunte exclusivamente ficticio");
    expect(after).toContain("Comprobando acceso…");
    expect(after).toContain("Notas anteriores sin sesión");
  });
  it.each([
    "suspended",
    "deleting",
    "pending",
  ])("vuelve a comprobar permiso actual: %s", async (status) => {
    expect(await candidates(["done"])).toHaveLength(1);
    await db
      .update(professionals)
      .set({ status })
      .where(eq(professionals.id, id("pro")));
    expect(await candidates(["done"])).toEqual([]);
  });
  it("rechaza auxiliar, actor distinto y ficha cerrada", async () => {
    expect(
      await candidates(["done"], { professionalUserId: id("user-other") }),
    ).toEqual([]);
    expect(
      await candidates(["done"], { patientId: id("patient-other") }),
    ).toEqual([]);
    await db
      .update(professionals)
      .set({ nonClinicalHelper: true })
      .where(eq(professionals.id, id("pro")));
    expect(await candidates(["done"])).toEqual([]);
    await db
      .update(professionals)
      .set({ nonClinicalHelper: false })
      .where(eq(professionals.id, id("pro")));
    await db
      .update(practicePatients)
      .set({ status: "closed" })
      .where(eq(practicePatients.id, id("patient")));
    expect(await candidates(["done"])).toEqual([]);
  });
  it("oculta el aviso de la ficha si cambia la cuenta autenticada", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    actor.userId = id("user-other");
    const html = renderToStaticMarkup(
      await PatientNotes({
        patientId: id("patient"),
        professionalId: id("pro"),
        timeZone: "UTC",
        query: { notaSesion: id("done") },
      }),
    );
    expect(html).not.toContain("Tu pajarito de Nido");
  });
  it("no ofrece escribir cuando el almacén no está configurado o el reloj/lote no es válido", async () => {
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "");
    expect(await candidates(["done"])).toEqual([]);
    key();
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, 1e20])
      expect(await candidates(["done"], { now })).toEqual([]);
    expect(await candidates([])).toEqual([]);
    expect(await candidates(Array(26).fill("done"))).toEqual([]);
    expect(await candidates(["done"], { professionalUserId: "" })).toEqual([]);
  });
  it("el canto de la tarjeta es optativo y el texto no promete notificaciones móviles activas", async () => {
    const [reminder] = await candidates(["done"]);
    const html = renderToStaticMarkup(
      <SessionNotesReminder
        reminder={reminder}
        endedLabel="4 oct. 2026, 12:00 UTC"
      />,
    );
    expect(html).toContain("Escuchar pajarito");
    expect(html).toContain('role="status"');
    expect(html).toContain("únicamente al pulsar el botón");
    expect(html).not.toContain("avisos al teléfono se activan");
  });
});
