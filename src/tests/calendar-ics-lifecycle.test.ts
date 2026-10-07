import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const identity = vi.hoisted(() => ({ userId: "test-ics-lifecycle-pro-user" }));
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
      expect(values.has("SEQUENCE")).toBe(false);
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

describe("ICS: ciclo real de creación, reprogramación y cancelación", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(stamp));
    vi.stubEnv("TZ", "UTC");
    await cleanup();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
    vi.unstubAllEnvs();
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
    const replacement = await create(movedLocal);
    expect(replacement.id).not.toBe(created.id);
    for (const audience of ["pro", "patient"] as const) {
      const recreated = (await exportAgenda(audience, `${label}-replacement`))
        .rows;
      expect(recreated).toHaveLength(1);
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
  it("caracteriza el límite de versión: dos escrituras dentro del segundo comparten LAST-MODIFIED", async () => {
    await seed("America/Caracas");
    const created = await create(local(10, october - 2));
    const previous = (await exportAgenda("pro", "subsecond-before")).rows[0];
    identity.userId = id("pro-user");
    expect(
      (
        await rescheduleAppointment(
          null,
          form({ appointmentId: created.id, startsAt: local(10, october + 1) }),
        )
      )?.ok,
    ).toBe(true);
    const next = (await exportAgenda("pro", "subsecond-after")).rows[0];
    const saved = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, created.id),
    });
    expect(saved?.updatedAt).toBe(`${year}-01-01T10:00:00.001Z`);
    expect(next.get("UID")).toBe(previous.get("UID"));
    expect(next.get("DTSTART")).not.toBe(previous.get("DTSTART"));
    expect(next.get("LAST-MODIFIED")).toBe(previous.get("LAST-MODIFIED"));
  });
});
