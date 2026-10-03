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
import { appointmentReminderPreferences as preferences } from "@/db/reminder-schema";
import { patientAccounts, professionals, user } from "@/db/schema";
import type { ReminderRole } from "@/lib/practice/reminder-options";
import {
  parseReminderPreferences,
  saveReminderPreferences,
} from "@/lib/practice/reminder-preferences";

const P = "test-reminder-opt-out";
const timestamp = "2026-10-03T12:00:00.000Z";
const actor = {
  professional: `${P}-professional`,
  patient: `${P}-patient`,
};

function form(offsets: string[], enabled = false, revision = 1) {
  const data = new FormData();
  if (enabled) data.set("emailEnabled", "on");
  data.set("revision", String(revision));
  data.set("timeZone", "America/Caracas");
  for (const offset of offsets) data.append("offsetMinutes", offset);
  return data;
}

describe("normalización de anticipaciones al desactivar recordatorios", () => {
  it.each([
    { offsets: ["120", "120", "15"], expected: [120, 15] },
    { offsets: ["1", "NaN", "15.5", "0", "30"], expected: [30] },
    { offsets: ["15", "30", "60", "120"], expected: [15, 30, 60] },
    { offsets: ["1", "NaN", "0"], expected: [1440] },
    { offsets: [], expected: [1440] },
  ])("permite apagar con selecciones $offsets", ({ offsets, expected }) => {
    const parsed = parseReminderPreferences(form(offsets));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data.emailEnabled).toBe(false);
    expect(parsed.data.offsets).toEqual(expected);
  });

  it.each([
    ["120", "120"],
    ["1"],
    ["NaN"],
    ["15.5"],
    ["15", "30", "60", "120"],
    [],
  ])("mantiene la validación estricta al activar: %j", (...offsets) => {
    expect(parseReminderPreferences(form(offsets, true)).success).toBe(false);
  });

  it("sigue validando zona y revisión aunque se apague", () => {
    const data = form(["120", "120"]);
    data.set("timeZone", "Zona/Inventada");
    expect(parseReminderPreferences(data).success).toBe(false);
    data.set("timeZone", "UTC");
    data.set("revision", "-1");
    expect(parseReminderPreferences(data).success).toBe(false);
    data.set("revision", "NaN");
    expect(parseReminderPreferences(data).success).toBe(false);
  });
});

async function cleanup() {
  await db.delete(preferences).where(like(preferences.userId, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db.delete(professionals).where(like(professionals.userId, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}

describe("guardado de opt-out con selecciones duplicadas", () => {
  beforeEach(async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("CONTACT_FROM_EMAIL", "");
    await cleanup();
    await db.insert(user).values(
      Object.entries(actor).map(([role, id]) => ({
        id,
        name: "Cuenta ficticia",
        email: `${role}-opt-out@example.test`,
        emailVerified: false,
      })),
    );
    await db.insert(professionals).values({
      id: `${P}-profile`,
      userId: actor.professional,
      email: "professional-opt-out@example.test",
      fullName: "Profesional ficticio",
      languages: '["es"]',
      supportAreas: '["ansiedad_depresion"]',
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(patientAccounts).values({
      userId: actor.patient,
      displayName: "Cuenta ficticia",
      onboardingCompletedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(preferences).values(
      Object.entries(actor).map(([role, userId]) => ({
        userId,
        role: role as ReminderRole,
        emailEnabled: true,
        offsetsJson: "[120]",
        timeZone: "UTC",
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(cleanup);

  it.each([
    "professional",
    "patient",
  ] as const)("desactiva %s sin proveedor ni correo verificado y conserva CAS e identidad", async (role) => {
    const otherRole = role === "professional" ? "patient" : "professional";
    const data = form(["120", "120", "15"]);
    data.set("userId", actor[otherRole]);
    data.set("role", otherRole);
    expect((await saveReminderPreferences(actor[role], role, data)).ok).toBe(
      true,
    );
    const [saved] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, actor[role]));
    expect(saved.emailEnabled).toBe(false);
    expect(JSON.parse(saved.offsetsJson)).toEqual([120, 15]);
    expect(saved.revision).toBe(2);
    expect(saved.role).toBe(role);
    const [other] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, actor[otherRole]));
    expect(other.emailEnabled).toBe(true);
    expect(other.revision).toBe(1);
    expect((await saveReminderPreferences(actor[role], role, data)).ok).toBe(
      false,
    );
    const [afterStale] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, actor[role]));
    expect(afterStale).toEqual(saved);
  });

  it.each([
    "professional",
    "patient",
  ] as const)("rechaza opt-out si %s dejó de estar habilitado", async (role) => {
    if (role === "professional")
      await db
        .update(professionals)
        .set({ status: "suspended" })
        .where(eq(professionals.userId, actor[role]));
    else
      await db
        .update(patientAccounts)
        .set({ deletionState: "deleting" })
        .where(eq(patientAccounts.userId, actor[role]));
    expect(
      (await saveReminderPreferences(actor[role], role, form(["120", "120"])))
        .ok,
    ).toBe(false);
    const [saved] = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, actor[role]));
    expect(saved.emailEnabled).toBe(true);
    expect(saved.revision).toBe(1);
  });
});
