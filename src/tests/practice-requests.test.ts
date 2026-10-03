import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
  practiceAppointments,
  practicePatients,
  practiceServices,
  professionals,
  user,
} from "@/db/schema";

const P = "test-session-confirm";
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({
    user: { id: `${P}-pro-user`, email: `${P}-pro@example.test` },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { reviewPatientSessionRequest } from "@/app/mi/professional-request-actions";
import {
  createPatientSessionRequest,
  withdrawPatientRequest,
} from "@/lib/patient/requests";

const now = () => new Date().toISOString();
function form(id: string, status = "confirmed") {
  const data = new FormData();
  data.set("requestId", id);
  data.set("status", status);
  data.set("serviceId", `${P}-service`);
  data.set("conditionsConfirmed", "on");
  return data;
}
async function cleanup() {
  await db
    .delete(patientSessionRequests)
    .where(like(patientSessionRequests.userId, `${P}%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.professionalId, `${P}%`));
  await db
    .delete(practicePatients)
    .where(like(practicePatients.professionalId, `${P}%`));
  await db
    .delete(practiceServices)
    .where(like(practiceServices.professionalId, `${P}%`));
  await db
    .delete(conversations)
    .where(like(conversations.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
describe("solicitudes y ambos calendarios", () => {
  beforeAll(async () => {
    await cleanup();
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-10-02T12:00:00.000Z"),
    );
    await db.insert(user).values([
      {
        id: `${P}-pro-user`,
        name: "Profesional ficticio",
        email: `${P}-pro@example.test`,
      },
      {
        id: `${P}-patient-user`,
        name: "Persona ficticia",
        email: `${P}-patient@example.test`,
      },
    ]);
    await db.insert(professionals).values({
      id: `${P}-pro`,
      userId: `${P}-pro-user`,
      email: `${P}-pro@example.test`,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(conversations).values({
      id: `${P}-chat`,
      professionalId: `${P}-pro`,
      seekerSid: "fixture",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(patientAccounts).values({
      userId: `${P}-patient-user`,
      displayName: "Persona ficticia",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(patientConversationLinks).values({
      conversationId: `${P}-chat`,
      userId: `${P}-patient-user`,
      verifiedBy: "seeker_session",
      verifiedAt: now(),
    });
    await db.insert(practicePatients).values({
      id: `${P}-patient`,
      professionalId: `${P}-pro`,
      conversationId: `${P}-chat`,
      name: "Persona ficticia",
      country: "Venezuela",
      timeZone: "UTC",
      program: "earthquake",
      consentAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(practiceServices).values({
      id: `${P}-service`,
      professionalId: `${P}-pro`,
      title: "Sesión de prueba",
      durationMinutes: 50,
      priceCents: 2500,
      currency: "usd",
      createdAt: now(),
    });
  });
  afterAll(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });
  it("confirma una sesión una sola vez y conserva ayuda a cero", async () => {
    const request = await createPatientSessionRequest(`${P}-patient-user`, {
      conversationId: `${P}-chat`,
      kind: "new",
      preferredLocal: "2026-10-06T10:00",
      timezone: "UTC",
    });
    expect(
      await reviewPatientSessionRequest(null, form(request)),
    ).toMatchObject({ ok: true });
    const row = await db.query.patientSessionRequests.findFirst({
      where: eq(patientSessionRequests.id, request),
    });
    expect(row).toMatchObject({ status: "confirmed" });
    const appointment = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, row?.appointmentId || ""),
    });
    expect(appointment).toMatchObject({
      priceCents: 0,
      startsAt: "2026-10-06T10:00:00.000Z",
    });
    expect(
      await reviewPatientSessionRequest(null, form(request)),
    ).toMatchObject({ ok: false });
  });
  it("rechaza solapamientos y deja la solicitud pendiente", async () => {
    const request = await createPatientSessionRequest(`${P}-patient-user`, {
      conversationId: `${P}-chat`,
      kind: "new",
      preferredLocal: "2026-10-06T10:15",
      timezone: "UTC",
    });
    expect(
      await reviewPatientSessionRequest(null, form(request)),
    ).toMatchObject({ ok: false });
    expect(
      await db.query.patientSessionRequests.findFirst({
        where: eq(patientSessionRequests.id, request),
      }),
    ).toMatchObject({ status: "pending" });
    await withdrawPatientRequest(`${P}-patient-user`, request);
  });
  it("una solicitud retirada no crea citas", async () => {
    const request = await createPatientSessionRequest(`${P}-patient-user`, {
      conversationId: `${P}-chat`,
      kind: "new",
      preferredLocal: "2026-10-07T10:00",
      timezone: "UTC",
    });
    await withdrawPatientRequest(`${P}-patient-user`, request);
    expect(
      await reviewPatientSessionRequest(null, form(request)),
    ).toMatchObject({ ok: false });
  });
  it("confirma reprogramación y cancelación sin cobros", async () => {
    const appointment = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.professionalId, `${P}-pro`),
    });
    const changed = await createPatientSessionRequest(`${P}-patient-user`, {
      conversationId: `${P}-chat`,
      appointmentId: appointment?.id,
      kind: "reschedule",
      preferredLocal: "2026-10-08T09:00",
      timezone: "UTC",
    });
    expect(
      await reviewPatientSessionRequest(null, form(changed)),
    ).toMatchObject({ ok: true });
    expect(
      await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, appointment?.id || ""),
      }),
    ).toMatchObject({ startsAt: "2026-10-08T09:00:00.000Z" });
    const canceled = await createPatientSessionRequest(`${P}-patient-user`, {
      conversationId: `${P}-chat`,
      appointmentId: appointment?.id,
      kind: "cancel",
      timezone: "UTC",
    });
    expect(
      await reviewPatientSessionRequest(null, form(canceled)),
    ).toMatchObject({ ok: true });
    expect(
      await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, appointment?.id || ""),
      }),
    ).toMatchObject({ status: "cancelled", priceCents: 0 });
  });
});
