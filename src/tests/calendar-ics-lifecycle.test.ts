import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET } from "@/app/api/calendar/export/route";
import {
  rescheduleAppointment,
  scheduleAppointment,
  updateAppointment,
} from "@/app/pro/consulta/actions";
import { db } from "@/db";
import {
  auditLogs,
  conversations,
  patientAccounts,
  patientConversationLinks,
  practiceAppointments,
  practicePatients,
  practiceServices,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import { completePatientOnboarding } from "@/lib/patient/accounts";

const identity = vi.hoisted(() => {
  const previousTarget = process.env.NIDO_DB_TARGET;
  const d1 = process.env.NIDO_CALENDAR_TEST_D1 === "true";
  if (d1) process.env.NIDO_DB_TARGET = "cloudflare";
  return {
    userId: "test-ics-lifecycle-pro-user",
    d1,
    previousTarget,
    database: null as D1Database | null,
    daily: vi.fn(async () => undefined),
  };
});
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: identity.database } }),
}));
vi.mock("@/lib/practice/calls", () => ({ dailyRequest: identity.daily }));
let disposeD1: (() => Promise<void>) | undefined;
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({
    user: { id: identity.userId, email: `${identity.userId}@example.test` },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`Unexpected redirect: ${destination}`);
  },
}));

const id = (suffix: string) => `test-ics-lifecycle-${suffix}`;
// SQLite's atomic guards use its own clock. Next year's dates stay future
// without mocking SQL or making this regression expire on a fixed date.
const year = new Date().getUTCFullYear() + 1;
const stamp = `${year}-01-01T10:00:00.000Z`;
function lastSunday(month: number) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}
const local = (month: number, day: number, time = "10:00") =>
  `${new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)}T${time}`;
// Expected UTC from explicit known offsets; never call the converter under test.
const expectedUtc = (wall: string, offsetHours: number) =>
  new Date(Date.parse(`${wall}:00Z`) - offsetHours * 3600000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.000Z$/, "Z");
const october = lastSunday(9),
  march = lastSunday(2);
const form = (data: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.set(key, value);
  return result;
};
async function cleanup() {
  await db
    .delete(auditLogs)
    .where(eq(auditLogs.actorEmail, `${id("pro-user")}@example.test`));
  await db
    .delete(practiceAppointments)
    .where(eq(practiceAppointments.professionalId, id("pro")));
  await db
    .delete(practicePatients)
    .where(eq(practicePatients.id, id("record")));
  await db
    .delete(practiceServices)
    .where(eq(practiceServices.id, id("service")));
  await db
    .delete(practiceSettings)
    .where(eq(practiceSettings.professionalId, id("pro")));
  await db
    .delete(patientConversationLinks)
    .where(eq(patientConversationLinks.conversationId, id("chat")));
  await db.delete(conversations).where(eq(conversations.id, id("chat")));
  await db.delete(professionals).where(eq(professionals.id, id("pro")));
  await db
    .delete(patientAccounts)
    .where(eq(patientAccounts.userId, id("patient-user")));
  for (const suffix of ["pro-user", "patient-user"])
    await db.delete(user).where(eq(user.id, id(suffix)));
}
async function seed(zone: string) {
  await db.insert(user).values(
    ["pro-user", "patient-user"].map((suffix) => ({
      id: id(suffix),
      name: "Cuenta ficticia",
      email: `${id(suffix)}@example.test`,
      emailVerified: true,
    })),
  );
  await db.insert(professionals).values({
    id: id("pro"),
    userId: id("pro-user"),
    email: `${id("pro-user")}@example.test`,
    fullName: "Profesional ficticio",
    status: "approved",
    languages: '["es"]',
    supportAreas: "[]",
    createdAt: stamp,
    updatedAt: stamp,
  });
  await completePatientOnboarding(id("patient-user"), {
    displayName: "Alias ficticio",
    country: "VE",
    timezone: zone,
    ageBand: "adult",
  });
  await db.insert(conversations).values({
    id: id("chat"),
    professionalId: id("pro"),
    seekerSid: id("sid"),
    status: "open",
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(patientConversationLinks).values({
    conversationId: id("chat"),
    userId: id("patient-user"),
    verifiedBy: "verified_email",
    verifiedAt: stamp,
  });
  await db.insert(practicePatients).values({
    id: id("record"),
    professionalId: id("pro"),
    conversationId: id("chat"),
    name: "Ficha ficticia",
    country: "VE",
    timeZone: zone,
    consentAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db
    .insert(practiceSettings)
    .values({ professionalId: id("pro"), timeZone: zone, updatedAt: stamp });
  await db.insert(practiceServices).values({
    id: id("service"),
    professionalId: id("pro"),
    title: "Servicio ficticio",
    durationMinutes: 50,
    sessionsCount: 1,
    priceCents: 0,
    currency: "usd",
    createdAt: stamp,
  });
}
async function create(local: string) {
  identity.userId = id("pro-user");
  const previousIds = new Set(
    (
      await db.query.practiceAppointments.findMany({
        where: eq(practiceAppointments.professionalId, id("pro")),
      })
    ).map((row) => row.id),
  );
  expect(
    (
      await scheduleAppointment(
        null,
        form({
          patientId: id("record"),
          serviceId: id("service"),
          startsAt: local,
        }),
      )
    )?.ok,
  ).toBe(true);
  const rows = await db.query.practiceAppointments.findMany({
    where: eq(practiceAppointments.professionalId, id("pro")),
  });
  const created = rows.find((row) => !previousIds.has(row.id));
  if (!created) throw new Error("Missing created fixture appointment");
  return created;
}

// Independent reader for the emitted non-recurring UTC subset, not a general
// calendar importer. The private QA also parses these files with ical.js.
function events(text: string) {
  expect(text).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect(text).toMatch(/\r\nEND:VCALENDAR\r\n$/);
  expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  return [...text.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)].map(
    (match) => {
      const values = new Map(
        match[1]
          .trim()
          .split("\r\n")
          .map((line) => {
            const separator = line.indexOf(":");
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      );
      for (const key of ["DTSTART", "DTEND", "DTSTAMP", "LAST-MODIFIED"])
        expect(values.get(key)).toMatch(/^\d{8}T\d{6}Z$/);
      expect(values.get("UID")).toMatch(/^[a-f0-9]{48}@nido.invalid$/);
      expect(values.get("SUMMARY")).toBe("Sesión Nido");
      expect(values.get("CLASS")).toBe("PRIVATE");
      expect(values.get("STATUS")).toBe("CONFIRMED");
      expect(values.get("SEQUENCE")).toMatch(/^(0|[1-9]\d*)$/);
      return values;
    },
  );
}
async function exportAgenda(audience: "pro" | "patient", label?: string) {
  identity.userId = id(audience === "pro" ? "pro-user" : "patient-user");
  const response = await GET(
    new Request(`http://localhost/api/calendar/export?espacio=${audience}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe(
    "text/calendar; charset=utf-8",
  );
  const text = await response.text();
  expect(text).not.toMatch(
    /test-ics-lifecycle|example\.test|Ficha ficticia|ATTENDEE|VALARM|LOCATION/,
  );
  // Optional private evidence; no new dependency or artifact enters the commit.
  const directory = process.env.NIDO_CALENDAR_QA_DIR;
  if (directory && label) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${label}-${audience}.ics`), text, {
      mode: 0o600,
    });
  }
  return { text, rows: events(text) };
}
const scenarios = [
  ["caracas", "America/Caracas", 10, october - 2, october + 1, -4, -4],
  ["madrid-fold", "Europe/Madrid", 10, october - 2, october + 1, 2, 1],
  ["madrid-gap", "Europe/Madrid", 3, march - 1, march + 2, 1, 2],
  ["kiritimati", "Pacific/Kiritimati", 10, october - 2, october + 1, 14, 14],
] as const;
const lifecycleCases = scenarios.map(
  ([label, zone, month, before, after, firstOffset, nextOffset]) => {
    const first = local(month, before),
      next = local(month, after);
    return [
      label,
      zone,
      first,
      next,
      expectedUtc(first, firstOffset),
      expectedUtc(next, nextOffset),
    ];
  },
);

describe("ICS: revisiones persistentes con writers reales", () => {
  beforeAll(async () => {
    if (!identity.d1) return;
    const url = process.env.DATABASE_URL;
    if (!url?.includes("nido-tests-")) throw new Error("Usa test:isolated.");
    const require = createRequire(import.meta.url);
    const { Miniflare } = createRequire(
      require.resolve("wrangler/package.json"),
    )("miniflare");
    const runtime = new Miniflare({
      modules: true,
      script: "export default {fetch(){return new Response('fixture')}}",
      compatibilityDate: "2026-06-28",
      d1Databases: { DB: "calendar-revision-fixture" },
    });
    disposeD1 = () => runtime.dispose();
    const database: D1Database = await runtime.getD1Database("DB");
    identity.database = database;
    const local = createClient({ url });
    try {
      const schema = await local.execute(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END",
      );
      for (const row of schema.rows)
        await database.prepare(String(row.sql)).run();
    } finally {
      local.close();
    }
  }, 30000);
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(stamp));
    vi.stubEnv("TZ", "UTC");
    identity.daily.mockReset().mockResolvedValue(undefined);
    await cleanup();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
    vi.unstubAllEnvs();
    if (identity.previousTarget === undefined)
      delete process.env.NIDO_DB_TARGET;
    else process.env.NIDO_DB_TARGET = identity.previousTarget;
    await disposeD1?.();
  });
  it.each(
    lifecycleCases,
  )("%s conserva identidad y UTC en ambos espacios", async (label, zone, initialLocal, movedLocal, initialUtc, movedUtc) => {
    await seed(zone);
    const created = await create(initialLocal);
    const initial = new Map<string, Map<string, string>>();
    for (const audience of ["pro", "patient"] as const) {
      const exported = await exportAgenda(audience, `${label}-initial`);
      expect(exported.rows).toHaveLength(1);
      expect(exported.rows[0].get("SEQUENCE")).toBe("0");
      expect(exported.rows[0].get("DTSTART")).toBe(initialUtc);
      initial.set(audience, exported.rows[0]);
      expect((await exportAgenda(audience)).text).toBe(exported.text);
    }
    expect(initial.get("pro")?.get("UID")).not.toBe(
      initial.get("patient")?.get("UID"),
    );
    vi.setSystemTime(new Date(`${year}-01-01T10:00:02Z`));
    identity.userId = id("pro-user");
    expect(
      (
        await rescheduleAppointment(
          null,
          form({ appointmentId: created.id, startsAt: movedLocal }),
        )
      )?.ok,
    ).toBe(true);
    for (const audience of ["pro", "patient"] as const) {
      const moved = (await exportAgenda(audience, `${label}-moved`)).rows;
      expect(moved).toHaveLength(1);
      expect(moved[0].get("UID")).toBe(initial.get(audience)?.get("UID"));
      expect(moved[0].get("DTSTART")).toBe(movedUtc);
      expect(moved[0].get("SEQUENCE")).toBe("1");
      expect(moved[0].get("LAST-MODIFIED")).toBe(`${year}0101T100002Z`);
      expect(moved[0].get("LAST-MODIFIED")).not.toBe(
        initial.get(audience)?.get("LAST-MODIFIED"),
      );
      const row = await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, created.id),
      });
      if (!row) throw new Error("Missing rescheduled fixture appointment");
      expect(Date.parse(row.endsAt) - Date.parse(row.startsAt)).toBe(
        50 * 60000,
      );
      expect(row?.timeZone).toBe(zone);
    }
    identity.userId = id("pro-user");
    expect(
      (
        await updateAppointment(
          null,
          form({ appointmentId: created.id, status: "cancelled" }),
        )
      )?.ok,
    ).toBe(true);
    for (const audience of ["pro", "patient"] as const)
      expect(
        (await exportAgenda(audience, `${label}-cancelled`)).rows,
      ).toHaveLength(0);
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, created.id),
        })
      )?.status,
    ).toBe("cancelled");
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, created.id),
        })
      )?.calendarRevision,
    ).toBe(2);
    const replacement = await create(movedLocal);
    expect(replacement.id).not.toBe(created.id);
    for (const audience of ["pro", "patient"] as const) {
      const recreated = (await exportAgenda(audience, `${label}-replacement`))
        .rows;
      expect(recreated).toHaveLength(1);
      expect(recreated[0].get("SEQUENCE")).toBe("0");
      expect(recreated[0].get("UID")).not.toBe(
        initial.get(audience)?.get("UID"),
      );
    }
  });
  it("rechaza conflicto y hora DST ambigua sin alterar la descarga", async () => {
    await seed("Europe/Madrid");
    const first = await create(local(10, october - 2));
    await create(local(10, october + 1));
    const original = await exportAgenda("pro", "conflict-before");
    for (const startsAt of [
      local(10, october + 1, "10:10"),
      local(10, october, "02:30"),
      local(3, march, "02:30"),
    ]) {
      identity.userId = id("pro-user");
      expect(
        (
          await rescheduleAppointment(
            null,
            form({ appointmentId: first.id, startsAt }),
          )
        )?.ok,
      ).toBe(false);
      expect((await exportAgenda("pro")).text).toBe(original.text);
    }
  });
  it.each([
    ["caracas", "America/Caracas", -4, -4],
    ["madrid", "Europe/Madrid", 2, 1],
  ] as const)("%s: revisiones rápidas conservan UID y ordenan versiones ICS", async (label, zone, firstOffset, movedOffset) => {
    await seed(zone);
    const initialLocal = local(10, october - 2);
    const created = await create(initialLocal);
    const capture = async (revision: number, wall: string, offset: number) => {
      const saved = await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, created.id),
      });
      const updatedAt = new Date(Date.parse(stamp) + revision).toISOString();
      expect(saved?.updatedAt).toBe(updatedAt);
      expect(saved?.calendarRevision).toBe(revision);
      expect(saved?.timeZone).toBe(zone);
      const exports = {
        pro: await exportAgenda("pro", `${label}-rapid-${revision}`),
        patient: await exportAgenda("patient", `${label}-rapid-${revision}`),
      };
      for (const audience of ["pro", "patient"] as const) {
        expect(exports[audience].rows).toHaveLength(1);
        expect(exports[audience].rows[0].get("SEQUENCE")).toBe(
          String(revision),
        );
        expect(exports[audience].rows[0].get("DTSTART")).toBe(
          expectedUtc(wall, offset),
        );
        expect(exports[audience].rows[0].get("LAST-MODIFIED")).toBe(
          `${year}0101T100000Z`,
        );
        expect(exports[audience].rows[0].get("DTSTAMP")).toBe(
          `${year}0101T100000Z`,
        );
        expect((await exportAgenda(audience)).text).toBe(
          exports[audience].text,
        );
      }
      expect(exports.pro.rows[0].get("UID")).not.toBe(
        exports.patient.rows[0].get("UID"),
      );
      return { updatedAt, exports };
    };
    const snapshots = [await capture(0, initialLocal, firstOffset)];
    const moves = [
      [local(10, october + 1), movedOffset],
      [local(10, october + 2), movedOffset],
      [initialLocal, firstOffset],
    ] as const;
    for (const [index, [startsAt, offset]] of moves.entries()) {
      identity.userId = id("pro-user");
      expect(
        (
          await rescheduleAppointment(
            null,
            form({ appointmentId: created.id, startsAt }),
          )
        )?.ok,
      ).toBe(true);
      snapshots.push(await capture(index + 1, startsAt, offset));
    }
    for (const audience of ["pro", "patient"] as const) {
      expect(
        new Set(snapshots.map((s) => s.exports[audience].rows[0].get("UID")))
          .size,
      ).toBe(1);
      expect(snapshots[1].exports[audience].text).not.toBe(
        snapshots[0].exports[audience].text,
      );
      expect(snapshots[2].exports[audience].text).not.toBe(
        snapshots[1].exports[audience].text,
      );
      // Returning to the same time remains a distinct persisted revision.
      expect(snapshots[3].exports[audience].text).not.toBe(
        snapshots[0].exports[audience].text,
      );
    }
    const logs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.entityId, created.id),
    });
    expect(
      logs.filter((row) => row.action === "appointment_rescheduled"),
    ).toHaveLength(3);
    expect(
      logs.filter((row) => row.action === "appointment_scheduled"),
    ).toHaveLength(1);
    // A later download advances DTSTAMP without another appointment revision.
    vi.setSystemTime(new Date(Date.parse(stamp) + 10000));
    for (const audience of ["pro", "patient"] as const) {
      const later = await exportAgenda(
        audience,
        `${label}-rapid-later-download`,
      );
      expect(later.rows[0].get("UID")).toBe(
        snapshots[3].exports[audience].rows[0].get("UID"),
      );
      expect(later.rows[0].get("DTSTART")).toBe(
        expectedUtc(initialLocal, firstOffset),
      );
      expect(later.rows[0].get("SEQUENCE")).toBe("3");
      expect(later.rows[0].get("DTSTAMP")).toBe(`${year}0101T100010Z`);
      expect(later.rows[0].get("LAST-MODIFIED")).toBe(`${year}0101T100000Z`);
    }
    const directory = process.env.NIDO_CALENDAR_QA_DIR;
    if (directory)
      await writeFile(
        path.join(directory, `${label}-rapid-db.json`),
        JSON.stringify(
          {
            zone,
            appointmentId: created.id,
            updatedAt: snapshots.map((s) => s.updatedAt),
            audits: logs.map((row) => row.action),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
  });
  it("el CAS cruza el segundo aunque DTSTAMP siga en el segundo de descarga", async () => {
    await seed("America/Caracas");
    vi.setSystemTime(new Date(Date.parse(stamp) + 999));
    const created = await create(local(10, october - 2));
    const initial = {
      pro: await exportAgenda("pro", "rollover-before"),
      patient: await exportAgenda("patient", "rollover-before"),
    };
    identity.userId = id("pro-user");
    expect(
      (
        await rescheduleAppointment(
          null,
          form({
            appointmentId: created.id,
            startsAt: local(10, october + 1),
          }),
        )
      )?.ok,
    ).toBe(true);
    const saved = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, created.id),
    });
    expect(created.updatedAt).toBe(`${year}-01-01T10:00:00.999Z`);
    expect(saved?.updatedAt).toBe(`${year}-01-01T10:00:01.000Z`);
    for (const audience of ["pro", "patient"] as const) {
      const next = (await exportAgenda(audience, "rollover-after")).rows[0];
      expect(next.get("SEQUENCE")).toBe("1");
      expect(initial[audience].rows[0].get("SEQUENCE")).toBe("0");
      expect(next.get("UID")).toBe(initial[audience].rows[0].get("UID"));
      expect(next.get("DTSTART")).not.toBe(
        initial[audience].rows[0].get("DTSTART"),
      );
      expect(next.get("LAST-MODIFIED")).toBe(`${year}0101T100001Z`);
      expect(initial[audience].rows[0].get("LAST-MODIFIED")).toBe(
        `${year}0101T100000Z`,
      );
      expect(next.get("DTSTAMP")).toBe(
        initial[audience].rows[0].get("DTSTAMP"),
      );
    }
  });
  it("fallo de llamada y rollback de auditoría no consumen revisión; reintento cancela una vez", async () => {
    await seed("America/Caracas");
    const created = await create(local(10, october - 2));
    await db
      .update(practiceAppointments)
      .set({ dailyRoom: "fixture-room" })
      .where(eq(practiceAppointments.id, created.id));
    const attempt = () => {
      identity.userId = id("pro-user");
      return rescheduleAppointment(
        null,
        form({ appointmentId: created.id, startsAt: local(10, october + 1) }),
      );
    };
    const row = () =>
      db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, created.id),
      });
    const baseline = await row();
    identity.daily.mockRejectedValueOnce(
      new Error("Fallo ficticio sin proveedor"),
    );
    expect((await attempt())?.ok).toBe(false);
    expect(await row()).toEqual(baseline);
    await db.run(
      sql.raw(
        "CREATE TRIGGER fixture_calendar_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='appointment_rescheduled' BEGIN SELECT RAISE(ABORT,'fixture-calendar-rollback'); END",
      ),
    );
    try {
      expect((await attempt())?.ok).toBe(false);
      expect(await row()).toEqual(baseline);
    } finally {
      await db.run(sql.raw("DROP TRIGGER fixture_calendar_audit_failure"));
    }
    expect((await attempt())?.ok).toBe(true);
    expect((await row())?.calendarRevision).toBe(1);
    for (const audience of ["pro", "patient"] as const)
      expect((await exportAgenda(audience)).rows[0].get("SEQUENCE")).toBe("1");
    identity.userId = id("pro-user");
    const cancel = () =>
      updateAppointment(
        null,
        form({ appointmentId: created.id, status: "cancelled" }),
      );
    expect((await cancel())?.ok).toBe(true);
    expect((await row())?.calendarRevision).toBe(2);
    expect((await cancel())?.ok).toBe(false);
    expect((await row())?.calendarRevision).toBe(2);
    for (const audience of ["pro", "patient"] as const)
      expect((await exportAgenda(audience)).rows).toHaveLength(0);
    expect(
      (
        await db.query.auditLogs.findMany({
          where: eq(auditLogs.entityId, created.id),
        })
      )
        .map((a) => a.action)
        .sort(),
    ).toEqual([
      "appointment_cancelled",
      "appointment_rescheduled",
      "appointment_scheduled",
    ]);
  });
  it.each([
    "concurrent",
    "permission",
  ] as const)("%s: CAS y actor vivo gobiernan la revisión atómica", async (mode) => {
    await seed("America/Caracas");
    const created = await create(local(10, october - 2));
    let release!: () => void,
      ready!: () => void,
      calls = 0;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const reached = new Promise<void>((r) => {
      ready = r;
    });
    const originalBatch = db.batch.bind(db);
    const batchSpy = vi.spyOn(db, "batch").mockImplementation((async (
      queries,
    ) => {
      calls++;
      if (calls === (mode === "concurrent" ? 2 : 1)) ready();
      await gate;
      return originalBatch(queries);
    }) as typeof db.batch);
    identity.userId = id("pro-user");
    const attempts = [
      rescheduleAppointment(
        null,
        form({ appointmentId: created.id, startsAt: local(10, october + 1) }),
      ),
    ];
    if (mode === "concurrent")
      attempts.push(
        rescheduleAppointment(
          null,
          form({ appointmentId: created.id, startsAt: local(10, october + 2) }),
        ),
      );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        reached,
        new Promise<void>((_, reject) => {
          timeout = setTimeout(() => {
            release();
            batchSpy.mockRestore();
            reject(new Error(`Harness reached ${calls} real batches`));
          }, 2500);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (mode === "permission")
      await db
        .update(professionals)
        .set({ status: "pending" })
        .where(eq(professionals.id, id("pro")));
    release();
    const results = await Promise.all(attempts);
    batchSpy.mockRestore();
    const saved = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, created.id),
    });
    const successes = mode === "concurrent" ? 1 : 0;
    expect(results.filter((r) => r?.ok)).toHaveLength(successes);
    expect(saved?.calendarRevision).toBe(successes);
    expect(
      (
        await db.query.auditLogs.findMany({
          where: eq(auditLogs.entityId, created.id),
        })
      ).filter((a) => a.action === "appointment_rescheduled"),
    ).toHaveLength(successes);
    if (mode === "permission") expect(saved?.startsAt).toBe(created.startsAt);
    else {
      // Read retry of the already-confirmed time is a no-op, not a new revision.
      identity.daily.mockResolvedValue(undefined);
      identity.userId = id("pro-user");
      if (!saved) throw new Error("Missing race fixture");
      const wall =
        saved.startsAt ===
        new Date(`${local(10, october + 1)}:00-04:00`).toISOString()
          ? local(10, october + 1)
          : local(10, october + 2);
      expect(
        (
          await rescheduleAppointment(
            null,
            form({ appointmentId: created.id, startsAt: wall }),
          )
        )?.ok,
      ).toBe(true);
      expect(
        (
          await db.query.practiceAppointments.findFirst({
            where: eq(practiceAppointments.id, created.id),
          })
        )?.calendarRevision,
      ).toBe(1);
    }
  });
  it("crear revierte cita y revisión si falla la auditoría final", async () => {
    await seed("America/Caracas");
    identity.userId = id("pro-user");
    const input = form({
      patientId: id("record"),
      serviceId: id("service"),
      startsAt: local(10, october - 2),
    });
    await db.run(
      sql.raw(
        "CREATE TRIGGER fixture_calendar_create_failure BEFORE INSERT ON audit_logs WHEN NEW.action='appointment_scheduled' BEGIN SELECT RAISE(ABORT,'fixture-calendar-create'); END",
      ),
    );
    try {
      expect((await scheduleAppointment(null, input))?.ok).toBe(false);
      expect(
        await db.query.practiceAppointments.findMany({
          where: eq(practiceAppointments.professionalId, id("pro")),
        }),
      ).toHaveLength(0);
    } finally {
      await db.run(sql.raw("DROP TRIGGER fixture_calendar_create_failure"));
    }
    const created = await create(local(10, october - 2));
    expect(created.calendarRevision).toBe(0);
  });
  it("consentimiento, timestamp y no-op no cambian SEQUENCE; el límite entero falla sin pérdida", async () => {
    await seed("America/Caracas");
    const wall = local(10, october - 2),
      created = await create(wall);
    await db
      .update(practiceAppointments)
      .set({
        dailyRoom: "fixture-room",
        updatedAt: `${year}-01-01T10:00:00.099Z`,
      })
      .where(eq(practiceAppointments.id, created.id));
    identity.userId = id("pro-user");
    expect(
      (
        await rescheduleAppointment(
          null,
          form({ appointmentId: created.id, startsAt: wall }),
        )
      )?.ok,
    ).toBe(true);
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, created.id),
        })
      )?.calendarRevision,
    ).toBe(0);
    await db
      .update(practiceAppointments)
      .set({ calendarRevision: 2147483647 })
      .where(eq(practiceAppointments.id, created.id));
    for (const audience of ["pro", "patient"] as const)
      expect((await exportAgenda(audience)).rows[0].get("SEQUENCE")).toBe(
        "2147483647",
      );
    const baseline = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, created.id),
    });
    identity.userId = id("pro-user");
    expect(
      (
        await rescheduleAppointment(
          null,
          form({ appointmentId: created.id, startsAt: local(10, october + 1) }),
        )
      )?.ok,
    ).toBe(false);
    expect(
      await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, created.id),
      }),
    ).toEqual(baseline);
  });
});
