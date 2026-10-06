import { eq, like } from "drizzle-orm";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import PatientCalendar from "@/app/mi/calendario/page";
import PracticePage from "@/app/pro/consulta/page";
import type { CalendarEvent } from "@/components/practice/calendar";
import { db } from "@/db";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  practiceAppointments,
  practicePatients,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import {
  calendarWindow,
  loadCalendarActor,
  ownedCalendarAppointments,
} from "@/lib/calendar/access";
import { nidoCalendarIcs } from "@/lib/calendar/ics";
import { completePatientOnboarding } from "@/lib/patient/accounts";

const fixture = vi.hoisted(() => ({
  patient: vi.fn(),
  professional: vi.fn(),
  calendar: vi.fn(),
  list: vi.fn(),
  path: "/pro/consulta",
  parameters: "",
}));
vi.mock("@/lib/patient/access", () => ({
  requirePatientAccount: fixture.patient,
}));
vi.mock("@/lib/practice/access", () => ({
  requirePracticeProfessional: fixture.professional,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => fixture.path,
  useSearchParams: () => new URLSearchParams(fixture.parameters),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/practice/calendar", async (original) => {
  const actual =
    await original<typeof import("@/components/practice/calendar")>();
  return {
    ...actual,
    PracticeCalendar: (
      props: Parameters<typeof actual.PracticeCalendar>[0],
    ) => {
      fixture.calendar(props);
      return <actual.PracticeCalendar {...props} />;
    },
  };
});
vi.mock("@/components/workspace/shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/mi/patient-parts", () => ({
  AppointmentList: (props: { rows: { id: string }[] }) => {
    fixture.list(props.rows);
    return null;
  },
  RequestList: () => null,
}));
vi.mock("@/components/practice/nav", () => ({ PracticeNav: () => null }));
vi.mock("@/components/practice/legacy-navigation", () => ({
  LegacyPracticeNavigation: () => null,
}));
vi.mock("@/components/practice/inbox-notifier", () => ({
  InboxNotifier: () => null,
}));
vi.mock("@/app/mi/professional-requests", () => ({
  ProfessionalPatientRequests: () => null,
}));
vi.mock("@/lib/practice/queries", async (original) => ({
  ...(await original<typeof import("@/lib/practice/queries")>()),
  inboxSummary: async () => ({ unread: 0 }),
}));
vi.mock("@/lib/practice/receipt-queries", () => ({
  receiptTotals: async () => [],
}));

const P = "test-calendar-boundary";
const id = (value: string) => `${P}-${value}`;
const zones = [
  "America/Caracas",
  "Europe/Madrid",
  "Pacific/Kiritimati",
] as const;
const stamp = "2026-01-01T00:00:00.000Z";
const iso = (ms: number) => new Date(ms).toISOString();
const cleanAppointments = () =>
  db.delete(practiceAppointments).where(like(practiceAppointments.id, `${P}%`));
async function cleanup() {
  for (const [table, column] of [
    [practiceAppointments, practiceAppointments.id],
    [practiceSettings, practiceSettings.professionalId],
    [practicePatients, practicePatients.id],
    [patientConversationLinks, patientConversationLinks.conversationId],
    [conversations, conversations.id],
    [professionals, professionals.id],
    [patientAccounts, patientAccounts.userId],
    [user, user.id],
  ] as const)
    await db.delete(table).where(like(column, `${P}%`));
}
async function setZone(zone: string) {
  await db
    .update(practiceSettings)
    .set({ timeZone: zone })
    .where(eq(practiceSettings.professionalId, id("pro")));
  await db
    .update(patientAccounts)
    .set({ timezone: zone })
    .where(eq(patientAccounts.userId, id("patient-user")));
  fixture.patient.mockResolvedValue({
    account: await db.query.patientAccounts.findFirst({
      where: eq(patientAccounts.userId, id("patient-user")),
    }),
  });
}
// Citas de un segundo sólo para sondear fronteras, sin solapamientos ni ICS de duración cero.
async function appointments(times: Record<string, number>) {
  await db.insert(practiceAppointments).values(
    Object.entries(times).map(([key, ms]) => ({
      id: id(key),
      professionalId: id("pro"),
      patientId: id("record"),
      startsAt: iso(ms),
      endsAt: iso(ms + 1000),
      timeZone: "UTC",
      createdAt: stamp,
      updatedAt: stamp,
    })),
  );
}
async function render(
  audience: "pro" | "patient",
  parameters: Record<string, string>,
) {
  fixture.path = audience === "pro" ? "/pro/consulta" : "/mi/calendario";
  fixture.parameters = new URLSearchParams(parameters).toString();
  fixture.calendar.mockClear();
  const page = audience === "pro" ? PracticePage : PatientCalendar;
  const html = renderToStaticMarkup(
    await page({ searchParams: Promise.resolve(parameters) }),
  );
  const props = fixture.calendar.mock.calls.at(-1)?.[0] as {
    events: CalendarEvent[];
    month: string;
    initialDay: string;
    timeZone: string;
  };
  return { html, props };
}

// Oráculo explícito: estos UTC esperados no se calculan con el conversor probado.
const ranges = [
  [
    zones[0],
    "dia",
    "2026-10-01",
    "2026-10-01T04:00:00Z",
    "2026-10-02T04:00:00Z",
  ],
  [
    zones[1],
    "dia",
    "2026-10-01",
    "2026-09-30T22:00:00Z",
    "2026-10-01T22:00:00Z",
  ],
  [
    zones[2],
    "dia",
    "2026-10-01",
    "2026-09-30T10:00:00Z",
    "2026-10-01T10:00:00Z",
  ],
  [zones[0], "mes", "2026-10", "2026-10-01T04:00:00Z", "2026-11-01T04:00:00Z"],
  [zones[1], "mes", "2026-10", "2026-09-30T22:00:00Z", "2026-10-31T23:00:00Z"],
  [zones[2], "mes", "2026-10", "2026-09-30T10:00:00Z", "2026-10-31T10:00:00Z"],
  [
    zones[0],
    "semana",
    "2026-10-01",
    "2026-09-28T04:00:00Z",
    "2026-10-05T04:00:00Z",
  ],
  [
    zones[1],
    "semana",
    "2026-10-01",
    "2026-09-27T22:00:00Z",
    "2026-10-04T22:00:00Z",
  ],
  [
    zones[2],
    "semana",
    "2026-10-01",
    "2026-09-27T10:00:00Z",
    "2026-10-04T10:00:00Z",
  ],
  [zones[1], "mes", "2026-03", "2026-02-28T23:00:00Z", "2026-03-31T22:00:00Z"],
  [
    zones[1],
    "dia",
    "2026-03-29",
    "2026-03-28T23:00:00Z",
    "2026-03-29T22:00:00Z",
  ],
  [
    zones[1],
    "semana",
    "2026-03-29",
    "2026-03-22T23:00:00Z",
    "2026-03-29T22:00:00Z",
  ],
  [
    zones[1],
    "dia",
    "2026-10-25",
    "2026-10-24T22:00:00Z",
    "2026-10-25T23:00:00Z",
  ],
  [
    zones[1],
    "semana",
    "2026-10-25",
    "2026-10-18T22:00:00Z",
    "2026-10-25T23:00:00Z",
  ],
  [
    zones[0],
    "semana",
    "2027-01-01",
    "2026-12-28T04:00:00Z",
    "2027-01-04T04:00:00Z",
  ],
  [
    zones[1],
    "semana",
    "2027-01-01",
    "2026-12-27T23:00:00Z",
    "2027-01-03T23:00:00Z",
  ],
  [
    zones[2],
    "semana",
    "2027-01-01",
    "2026-12-27T10:00:00Z",
    "2027-01-03T10:00:00Z",
  ],
] as const;

describe("fronteras civiles con servidor UTC y zona propia de cada rol", () => {
  beforeAll(async () => {
    vi.stubEnv("TZ", "UTC");
    await cleanup();
    await db.insert(user).values(
      ["pro-user", "patient-user"].map((key) => ({
        id: id(key),
        name: "Cuenta ficticia",
        email: `${id(key)}@example.test`,
        emailVerified: true,
      })),
    );
    await db.insert(professionals).values({
      id: id("pro"),
      userId: id("pro-user"),
      fullName: "Profesional ficticio",
      email: `${id("pro")}@example.test`,
      languages: '["es"]',
      supportAreas: "[]",
      status: "approved",
      createdAt: stamp,
      updatedAt: stamp,
    });
    fixture.professional.mockResolvedValue({
      id: id("pro"),
      fullName: "Profesional ficticio",
    });
    await db
      .insert(practiceSettings)
      .values({ professionalId: id("pro"), timeZone: "UTC", updatedAt: stamp });
    await completePatientOnboarding(id("patient-user"), {
      displayName: "Alias ficticio",
      country: "VE",
      timezone: "UTC",
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
      timeZone: "UTC",
      consentAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T22:30:00Z"));
    await cleanAppointments();
    expect(new Date().getTimezoneOffset()).toBe(0);
  });
  afterAll(async () => {
    vi.useRealTimers();
    await cleanup();
    vi.unstubAllEnvs();
  });

  describe.each(["pro", "patient"] as const)("%s", (audience) => {
    it.each(
      ranges,
    )("%s / %s / %s incluye inicio y excluye final", async (zone, view, date, start, end) => {
      await setZone(zone);
      const from = Date.parse(start),
        until = Date.parse(end);
      await appointments({
        before: from - 1000,
        first: from,
        last: until - 1000,
        after: until,
      });
      const parameters: Record<string, string> = {
        mes: date.slice(0, 7),
        vista: view,
      };
      if (view !== "mes") parameters.dia = date;
      const { html, props } = await render(audience, parameters);
      expect(props.timeZone).toBe(zone);
      expect(props.events.map((e) => e.id).sort()).toEqual([
        id("first"),
        id("last"),
      ]);
      // También recorre la agrupación y filtrado del componente real, no sólo SQL.
      expect(html).toContain(`dateTime="${iso(from)}"`);
      expect(html).toContain(`dateTime="${iso(until - 1000)}"`);
      expect(html).not.toContain(`dateTime="${iso(from - 1000)}"`);
      expect(html).not.toContain(`dateTime="${iso(until)}"`);
      expect(html.indexOf(`dateTime="${iso(from)}"`)).toBeLessThan(
        html.indexOf(`dateTime="${iso(until - 1000)}"`),
      );
      if (view === "mes" && audience === "patient")
        expect(
          fixture.list.mock.calls
            .at(-1)?.[0]
            .map((r: { id: string }) => r.id)
            .sort(),
        ).toEqual([id("first"), id("last")].sort());
    });
    it.each([
      [zones[0], "2026-09", "2026-09-30"],
      [zones[1], "2026-10", "2026-10-01"],
      [zones[2], "2026-10", "2026-10-01"],
    ])("elige mes y día actuales en %s, no en UTC", async (zone, month, day) => {
      await setZone(zone);
      const { props } = await render(audience, {});
      expect(props.month).toBe(month);
      expect(props.initialDay).toBe(day);
    });
    it("no pierde ninguna de las dos 02:30 del cambio de hora de Madrid", async () => {
      await setZone(zones[1]);
      await appointments({
        first: Date.parse("2026-10-25T00:30:00Z"),
        second: Date.parse("2026-10-25T01:30:00Z"),
      });
      const { props, html } = await render(audience, {
        mes: "2026-10",
        dia: "2026-10-25",
        vista: "dia",
      });
      expect(props.events).toHaveLength(2);
      expect(html.match(/>02:30/g)).toHaveLength(2);
    });
    it.each(
      zones,
    )("conserva la ventana ICS UTC de 365 días en %s", async (zone) => {
      vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
      await setZone(zone);
      const from = Date.parse("2026-03-01T12:00:00Z"),
        until = Date.parse("2027-03-01T12:00:00Z");
      await appointments({
        expired: from - 1000,
        first: from,
        last: until - 1000,
        after: until,
      });
      const actor = await loadCalendarActor(
        id(audience === "pro" ? "pro-user" : "patient-user"),
        audience,
      );
      expect(actor?.timeZone).toBe(zone);
      expect(calendarWindow()).toEqual({ from: iso(from), until: iso(until) });
      if (!actor) throw Error("Falta actor ficticio");
      const rows = await ownedCalendarAppointments(actor);
      expect(rows.map((r) => r.id).sort()).toEqual(
        [id("first"), id("last")].sort(),
      );
      const ics = await nidoCalendarIcs(rows, actor.userId, actor.audience);
      expect(ics).toContain("DTSTART:20260301T120000Z\r\n");
      expect(ics).toContain("DTSTART:20270301T115959Z\r\n");
      expect(ics).not.toContain("DTSTART:20270301T120000Z\r\n");
    });
  });
});
