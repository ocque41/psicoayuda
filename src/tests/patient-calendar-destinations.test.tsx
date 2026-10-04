import { eq, like } from "drizzle-orm";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import PatientCalendar from "@/app/mi/calendario/page";
import type { CalendarEvent } from "@/components/practice/calendar";
import { db } from "@/db";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  practiceAppointments,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";
import { completePatientOnboarding } from "@/lib/patient/accounts";

const mocks = vi.hoisted(() => ({ account: vi.fn(), calendar: vi.fn() }));
vi.mock("@/lib/patient/access", () => ({
  requirePatientAccount: mocks.account,
}));
vi.mock("@/app/mi/patient-parts", () => ({
  AppointmentList: () => null,
  RequestList: () => null,
}));
vi.mock("@/components/workspace/shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/practice/calendar", () => ({
  PracticeCalendar: (props: { events: CalendarEvent[] }) => {
    mocks.calendar(props.events);
    return null;
  },
  CalendarPagination: () => null,
}));

const P = "test-calendar-destinations";
const owner = `${P}-owner`;
const timestamp = "2026-10-01T12:00:00.000Z";
const variants = ["live", "closed", "closed-at", "suspended", "helper"];
const id = (kind: string, variant: string) => `${P}-${kind}-${variant}`;
async function cleanup() {
  for (const [table, column] of [
    [patientConversationLinks, patientConversationLinks.conversationId],
    [practiceAppointments, practiceAppointments.id],
    [practicePatients, practicePatients.id],
    [conversations, conversations.id],
    [professionals, professionals.id],
    [patientAccounts, patientAccounts.userId],
    [user, user.id],
  ] as const)
    await db.delete(table).where(like(column, `${P}%`));
}

describe("destinos autorizados del calendario del paciente", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values({
      id: owner,
      name: "Cuenta ficticia",
      email: `${owner}@example.test`,
      emailVerified: true,
    });
    await db.insert(user).values(
      variants.map((variant) => ({
        id: id("pro-user", variant),
        name: "Profesional ficticio",
        email: `${id("pro-user", variant)}@example.test`,
      })),
    );
    const account = await completePatientOnboarding(owner, {
      displayName: "Alias ficticio",
      country: "VE",
      timezone: "UTC",
      ageBand: "adult",
    });
    mocks.account.mockResolvedValue({ account });
    for (const variant of variants) {
      await db.insert(professionals).values({
        id: id("pro", variant),
        userId: id("pro-user", variant),
        fullName: "Profesional ficticio",
        email: `${id("pro", variant)}@example.test`,
        languages: '["es"]',
        supportAreas: "[]",
        status: variant === "suspended" ? "suspended" : "approved",
        nonClinicalHelper: variant === "helper",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await db.insert(conversations).values({
        id: id("chat", variant),
        professionalId: id("pro", variant),
        seekerSid: id("sid", variant),
        status: variant === "closed" ? "closed" : "open",
        closedAt: variant === "closed-at" ? timestamp : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await db.insert(patientConversationLinks).values({
        conversationId: id("chat", variant),
        userId: owner,
        verifiedBy: "verified_email",
        verifiedAt: timestamp,
      });
      await db.insert(practicePatients).values({
        id: id("record", variant),
        professionalId: id("pro", variant),
        conversationId: id("chat", variant),
        name: "Ficha ficticia",
        country: "VE",
        timeZone: "UTC",
        consentAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await db.insert(practiceAppointments).values({
        id: id("appointment", variant),
        professionalId: id("pro", variant),
        patientId: id("record", variant),
        startsAt: "2026-10-06T14:00:00.000Z",
        endsAt: "2026-10-06T14:50:00.000Z",
        timeZone: "UTC",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    await db.insert(practiceAppointments).values({
      id: id("appointment", "previous-month"),
      professionalId: id("pro", "live"),
      patientId: id("record", "live"),
      startsAt: "2026-09-30T14:00:00.000Z",
      endsAt: "2026-09-30T14:50:00.000Z",
      timeZone: "UTC",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    renderToStaticMarkup(
      await PatientCalendar({
        searchParams: Promise.resolve({ mes: "2026-10" }),
      }),
    );
  });
  afterAll(cleanup);

  it("conserva el enlace de sesión para una relación clínica vigente", () => {
    const events = mocks.calendar.mock.calls.at(-1)?.[0] as CalendarEvent[];
    expect(events.find((e) => e.id === id("appointment", "live"))?.href).toBe(
      `/sesion/${id("appointment", "live")}`,
    );
  });

  it("consulta la semana completa aunque empiece en el mes anterior", async () => {
    renderToStaticMarkup(
      await PatientCalendar({
        searchParams: Promise.resolve({
          mes: "2026-10",
          dia: "2026-10-01",
          vista: "semana",
        }),
      }),
    );
    const events = mocks.calendar.mock.calls.at(-1)?.[0] as CalendarEvent[];
    expect(events.map((event) => event.id)).toEqual([
      id("appointment", "previous-month"),
    ]);
  });

  it("el modo diario no incluye sesiones de otros días", async () => {
    renderToStaticMarkup(
      await PatientCalendar({
        searchParams: Promise.resolve({
          mes: "2026-10",
          dia: "2026-10-06",
          vista: "dia",
        }),
      }),
    );
    const events = mocks.calendar.mock.calls.at(-1)?.[0] as CalendarEvent[];
    expect(events).toHaveLength(5);
    expect(
      events.every((event) => event.startsAt === "2026-10-06T14:00:00.000Z"),
    ).toBe(true);
  });

  it.each([
    "closed",
    "closed-at",
    "suspended",
    "helper",
  ])("abre el historial autorizado cuando la relación está %s", (variant) => {
    const events = mocks.calendar.mock.calls.at(-1)?.[0] as CalendarEvent[];
    expect(events.find((e) => e.id === id("appointment", variant))?.href).toBe(
      `/mi/mensajes/${id("chat", variant)}`,
    );
  });

  it("mantiene fuera de la agenda los chats borrados o anonimizados", async () => {
    await db
      .update(conversations)
      .set({ deletedAt: new Date(timestamp) })
      .where(eq(conversations.id, id("chat", "closed")));
    await db
      .update(conversations)
      .set({ anonymizedAt: timestamp })
      .where(eq(conversations.id, id("chat", "suspended")));
    renderToStaticMarkup(
      await PatientCalendar({
        searchParams: Promise.resolve({ mes: "2026-10" }),
      }),
    );
    const events = mocks.calendar.mock.calls.at(-1)?.[0] as CalendarEvent[];
    expect(events).toHaveLength(3);
    expect(events.some((e) => e.id === id("appointment", "closed"))).toBe(
      false,
    );
    expect(events.some((e) => e.id === id("appointment", "suspended"))).toBe(
      false,
    );
  });
});
