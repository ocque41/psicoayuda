import { eq, like } from "drizzle-orm";
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
  auditLogs,
  callConsents,
  careCycles,
  carePlans,
  conversations,
  helpRequests,
  practiceAppointments,
  practiceCallRooms,
  practiceCredentials,
  practicePatients,
  practiceReceipts,
  practiceServices,
  practiceSettings,
  professionalMemberships,
  professionals,
  session,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  session: vi.fn(
    async (): Promise<{
      user: { id: string; email: string };
      session: { id: string };
    } | null> => ({
      user: { id: "test-practice-user", email: "test-practice@test.local" },
      session: { id: "test-practice-auth-session" },
    }),
  ),
  cookie: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));

import {
  createPatient,
  releaseConversationQuota,
  saveReceipt,
  scheduleAppointment,
} from "@/app/pro/consulta/actions";
import { saveCallConsent } from "@/app/sesion/[appointmentId]/actions";
import { ownedPatient } from "@/lib/practice/access";
import { startMembershipTrial } from "@/lib/practice/billing";
import {
  appointmentActor,
  CALL_POLICY_VERSION,
  joinCall,
} from "@/lib/practice/calls";
import { receiptRecordedAt } from "@/lib/practice/receipt-history";

const P = "test-practice";
const now = () => new Date().toISOString();
function form(data: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}
async function cleanup() {
  await db
    .delete(callConsents)
    .where(like(callConsents.appointmentId, `${P}%`));
  await db
    .delete(practiceCallRooms)
    .where(like(practiceCallRooms.professionalId, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.professionalId, `${P}%`));
  await db.delete(careCycles).where(like(careCycles.carePlanId, `${P}%`));
  await db.delete(carePlans).where(like(carePlans.professionalId, `${P}%`));
  await db
    .delete(practiceReceipts)
    .where(like(practiceReceipts.professionalId, `${P}%`));
  await db
    .delete(practicePatients)
    .where(like(practicePatients.professionalId, `${P}%`));
  await db
    .delete(practiceServices)
    .where(like(practiceServices.professionalId, `${P}%`));
  await db
    .delete(practiceSettings)
    .where(like(practiceSettings.professionalId, `${P}%`));
  await db
    .delete(professionalMemberships)
    .where(like(professionalMemberships.professionalId, `${P}%`));
  await db
    .delete(conversations)
    .where(like(conversations.professionalId, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.actorEmail, `${P}%`));
  await db
    .delete(practiceCredentials)
    .where(like(practiceCredentials.id, `${P}%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
describe("CRM con aislamiento y datos persistidos", () => {
  beforeAll(async () => {
    await cleanup();
    for (const suffix of ["", "-other"]) {
      await db.insert(user).values({
        id: `${P}-user${suffix}`,
        name: "Profesional ficticio",
        email: `${P}${suffix}@test.local`,
      });
      await db.insert(session).values({
        id: `${P}-auth-session${suffix}`,
        userId: `${P}-user${suffix}`,
        token: `${P}-auth-token${suffix}`,
        expiresAt: new Date(Date.now() + 86400000),
      });
      await db.insert(professionals).values({
        id: `${P}-pro${suffix}`,
        userId: `${P}-user${suffix}`,
        email: `${P}${suffix}@test.local`,
        fullName: "Profesional ficticio",
        status: "approved",
        languages: '["es"]',
        supportAreas: '["ansiedad_depresion"]',
        currentActiveRequests: 2,
        createdAt: now(),
        updatedAt: now(),
      });
      await db.insert(practicePatients).values({
        id: `${P}-patient${suffix}`,
        professionalId: `${P}-pro${suffix}`,
        name: "Paciente ficticio",
        country: "Venezuela",
        timeZone: "UTC",
        program: suffix ? "general" : "earthquake",
        consentAt: now(),
        createdAt: now(),
        updatedAt: now(),
      });
      await db.insert(practiceCredentials).values({
        id: `${P}-scope${suffix}`,
        professionalId: `${P}-pro${suffix}`,
        patientCountry: "Venezuela",
        registryReference: "Referencia ficticia",
        reviewedBy: "reviewer@example.test",
        reviewedAt: now(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      await db.insert(practiceSettings).values({
        professionalId: `${P}-pro${suffix}`,
        timeZone: "UTC",
        updatedAt: now(),
      });
      await db.insert(practiceServices).values({
        id: `${P}-service${suffix}`,
        professionalId: `${P}-pro${suffix}`,
        title: "Sesión de ejemplo",
        durationMinutes: 50,
        sessionsCount: 1,
        priceCents: 2500,
        currency: "usd",
        createdAt: now(),
      });
    }
  });
  afterAll(cleanup);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(process.env, "DAILY_API_KEY");
    Reflect.deleteProperty(process.env, "NIDO_CALL_CAPTURE_ENABLED");
    Reflect.deleteProperty(process.env, "NIDO_CALL_CAPTURE_POLICY_URL");
  });
  it("impide leer una ficha de otro profesional", async () =>
    expect(
      await ownedPatient(`${P}-patient-other`, `${P}-pro`),
    ).toBeUndefined());
  it("guarda la fecha real del pago y audita la fecha de registro sin duplicar", async () => {
    const patientId = `${P}-receipt-patient`;
    await db.insert(practicePatients).values({
      id: patientId,
      professionalId: `${P}-pro`,
      name: "Paciente de recibos ficticio",
      country: "Venezuela",
      timeZone: "America/Caracas",
      program: "general",
      consentAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });
    const data = {
      patientId,
      amount: "19,99",
      currency: "eur",
      method: "bizum",
      reference: `${P}-receipt-example`,
      receivedAt: "2026-01-31T23:45",
      receivedTimeZone: "UTC",
      // Una zona enviada por el navegador no cambia la zona de la consulta.
      timeZone: "America/Caracas",
    };
    const before = Date.now();
    expect((await saveReceipt(null, form(data)))?.ok).toBe(true);
    const receipt = await db.query.practiceReceipts.findFirst({
      where: eq(practiceReceipts.patientId, patientId),
    });
    expect(receipt?.amountCents).toBe(1999);
    expect(receipt?.receivedAt).toBe("2026-01-31T23:45:00.000Z");
    const logs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.entityId, receipt?.id || "missing"),
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe("external_receipt_confirmed");
    const [history] = await db
      .select({
        receivedAt: practiceReceipts.receivedAt,
        recordedAt: receiptRecordedAt,
      })
      .from(practiceReceipts)
      .where(eq(practiceReceipts.id, receipt?.id || "missing"));
    expect(history?.recordedAt).toBe(logs[0]?.createdAt);
    expect(history?.receivedAt).not.toBe(history?.recordedAt);
    expect(Date.parse(logs[0]?.createdAt || "")).toBeGreaterThanOrEqual(before);
    expect((await saveReceipt(null, form(data)))?.ok).toBe(false);
    expect(
      await db.query.practiceReceipts.findMany({
        where: eq(practiceReceipts.patientId, patientId),
      }),
    ).toHaveLength(1);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, receipt?.id || "missing"),
      }),
    ).toHaveLength(1);
    for (const receivedAt of ["", "9999-01-01T10:00", "2026-02-30T10:00"])
      expect(
        (
          await saveReceipt(
            null,
            form({
              ...data,
              reference: `${P}-invalid-${receivedAt}`,
              receivedAt,
            }),
          )
        )?.ok,
      ).toBe(false);
    expect(
      (
        await saveReceipt(
          null,
          form({ ...data, patientId: `${P}-patient-other` }),
        )
      )?.ok,
    ).toBe(false);
    expect(
      (
        await saveReceipt(
          null,
          form({ ...data, receivedTimeZone: "America/Caracas" }),
        )
      )?.ok,
    ).toBe(false);
  });
  it("impide vincular el chat de otro profesional", async () => {
    await db.insert(conversations).values({
      id: `${P}-chat-other`,
      professionalId: `${P}-pro-other`,
      seekerSid: "fake-sid",
      createdAt: now(),
      updatedAt: now(),
    });
    const result = await createPatient(
      null,
      form({
        name: "Alias",
        email: "",
        country: "Venezuela",
        timeZone: "UTC",
        program: "general",
        consent: "on",
        conversationId: `${P}-chat-other`,
      }),
    );
    expect(result?.ok).toBe(false);
  });
  it("no guarda cobros ni auditoría si la baja comienza durante el formulario", async () => {
    const original = db.batch.bind(db);
    const lookup = vi
      .spyOn(db, "batch")
      .mockImplementationOnce(async (...args) => {
        await db
          .update(professionals)
          .set({ status: "deleting" })
          .where(eq(professionals.id, `${P}-pro`));
        return original(...args);
      });
    const reference = `${P}-receipt-deleting`;
    const before = await db.query.auditLogs.findMany({
      where: eq(auditLogs.action, "external_receipt_confirmed"),
    });
    try {
      expect(
        (
          await saveReceipt(
            null,
            form({
              patientId: `${P}-receipt-patient`,
              amount: "20",
              currency: "usd",
              method: "zelle",
              reference,
              receivedAt: "2026-01-01T12:00",
              receivedTimeZone: "UTC",
            }),
          )
        )?.ok,
      ).toBe(false);
      expect(
        await db.query.practiceReceipts.findFirst({
          where: eq(practiceReceipts.reference, `${P}-pro:${reference}`),
        }),
      ).toBeUndefined();
      expect(
        await db.query.auditLogs.findMany({
          where: eq(auditLogs.action, "external_receipt_confirmed"),
        }),
      ).toHaveLength(before.length);
    } finally {
      lookup.mockRestore();
      await db
        .update(professionals)
        .set({ status: "approved" })
        .where(eq(professionals.id, `${P}-pro`));
    }
  });
  it("programa ayuda terremoto a cero y bloquea cobros externos", async () => {
    const result = await scheduleAppointment(
      null,
      form({
        patientId: `${P}-patient`,
        serviceId: `${P}-service`,
        startsAt: new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 16),
      }),
    );
    expect(result?.ok).toBe(true);
    const appt = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.patientId, `${P}-patient`),
    });
    expect(appt?.priceCents).toBe(0);
    expect(
      (
        await saveReceipt(
          null,
          form({
            patientId: `${P}-patient`,
            amount: "20",
            currency: "usd",
            method: "zelle",
            reference: "example",
          }),
        )
      )?.ok,
    ).toBe(false);
  });
  it("no permite programar con servicio ni paciente ajenos", async () =>
    expect(
      (
        await scheduleAppointment(
          null,
          form({
            patientId: `${P}-patient-other`,
            serviceId: `${P}-service`,
            startsAt: "2030-10-02T10:00",
          }),
        )
      )?.ok,
    ).toBe(false));
  it("la base de datos evita reservas simultáneas que solapan", async () => {
    const base = {
      professionalId: `${P}-pro`,
      patientId: `${P}-patient`,
      startsAt: "2030-10-03T10:00:00.000Z",
      endsAt: "2030-10-03T11:00:00.000Z",
      timeZone: "UTC",
      createdAt: now(),
      updatedAt: now(),
    };
    const outcomes = await Promise.allSettled([
      db
        .insert(practiceAppointments)
        .values({ ...base, id: `${P}-parallel-a` }),
      db
        .insert(practiceAppointments)
        .values({ ...base, id: `${P}-parallel-b` }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("libera un cupo una sola vez y conserva el chat", async () => {
    await db.insert(conversations).values({
      id: `${P}-quota`,
      professionalId: `${P}-pro`,
      seekerSid: "quota",
      createdAt: now(),
      updatedAt: now(),
    });
    await releaseConversationQuota(
      null,
      form({ conversationId: `${P}-quota` }),
    );
    await releaseConversationQuota(
      null,
      form({ conversationId: `${P}-quota` }),
    );
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, `${P}-pro`),
    });
    expect(pro?.currentActiveRequests).toBe(1);
    const chat = await db.query.conversations.findFirst({
      where: eq(conversations.id, `${P}-quota`),
    });
    expect(chat?.status).toBe("open");
    expect(chat?.quotaReleasedAt).toBeTruthy();
  });
  it("la prueba no se reinicia al volver a activarla", async () => {
    await startMembershipTrial(`${P}-pro`);
    const a = await db.query.professionalMemberships.findFirst({
      where: eq(professionalMemberships.professionalId, `${P}-pro`),
    });
    await startMembershipTrial(`${P}-pro`);
    const b = await db.query.professionalMemberships.findFirst({
      where: eq(professionalMemberships.professionalId, `${P}-pro`),
    });
    expect(a?.trialEndsAt).toBe(b?.trialEndsAt);
    expect(b?.stripeSubscriptionId).toBeNull();
  });
  it("los créditos del paquete se consumen de forma atómica", async () => {
    await db.insert(carePlans).values({
      id: `${P}-care`,
      patientId: `${P}-patient-other`,
      professionalId: `${P}-pro-other`,
      title: "Paquete ficticio",
      durationMinutes: 50,
      sessionsCount: 1,
      priceCents: 2500,
      currency: "usd",
      interval: "one_time",
      validityDays: 30,
      createdAt: now(),
    });
    await db.insert(careCycles).values({
      id: `${P}-cycle`,
      carePlanId: `${P}-care`,
      externalReference: `${P}-paid`,
      startsAt: "2030-10-01T00:00:00.000Z",
      endsAt: "2030-11-01T00:00:00.000Z",
      sessionsCount: 1,
      amountCents: 2500,
      currency: "usd",
      createdAt: now(),
    });
    const base = {
      professionalId: `${P}-pro-other`,
      patientId: `${P}-patient-other`,
      careCycleId: `${P}-cycle`,
      timeZone: "UTC",
      createdAt: now(),
      updatedAt: now(),
    };
    const outcomes = await Promise.allSettled([
      db.insert(practiceAppointments).values({
        ...base,
        id: `${P}-credit-a`,
        startsAt: "2030-10-06T10:00:00.000Z",
        endsAt: "2030-10-06T11:00:00.000Z",
      }),
      db.insert(practiceAppointments).values({
        ...base,
        id: `${P}-credit-b`,
        startsAt: "2030-10-07T10:00:00.000Z",
        endsAt: "2030-10-07T11:00:00.000Z",
      }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("el trigger de actualización impide volver a consumir un crédito ya ocupado", async () => {
    const [original] = await db
      .select()
      .from(practiceAppointments)
      .where(eq(practiceAppointments.careCycleId, `${P}-cycle`));
    if (!original) throw new Error("Falta la reserva ficticia del paquete.");
    await db
      .update(practiceAppointments)
      .set({ status: "cancelled" })
      .where(eq(practiceAppointments.id, original.id));
    await db.insert(practiceAppointments).values({
      ...original,
      id: `${P}-credit-replacement`,
      status: "scheduled",
      startsAt: "2030-10-08T10:00:00.000Z",
      endsAt: "2030-10-08T11:00:00.000Z",
    });
    await expect(
      db
        .update(practiceAppointments)
        .set({ status: "scheduled" })
        .where(eq(practiceAppointments.id, original.id)),
    ).rejects.toThrow();
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, original.id),
        })
      )?.status,
    ).toBe("cancelled");
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, `${P}-credit-replacement`),
        })
      )?.status,
    ).toBe("scheduled");
  });
  it("sin dos consentimientos la llamada no inicia captura", async () => {
    vi.stubEnv("NIDO_PRACTICE_ENABLED", "true");
    process.env.DAILY_API_KEY = "test-key";
    process.env.NIDO_CALL_CAPTURE_ENABLED = "true";
    process.env.NIDO_CALL_CAPTURE_POLICY_URL = "https://example.com/policy";
    const apptId = `${P}-call`;
    await db.insert(practiceAppointments).values({
      id: apptId,
      professionalId: `${P}-pro`,
      patientId: `${P}-patient`,
      startsAt: new Date(Date.now() - 60000).toISOString(),
      endsAt: new Date(Date.now() + 3000000).toISOString(),
      timeZone: "UTC",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(callConsents).values({
      id: `${P}-consent-pro`,
      appointmentId: apptId,
      role: "professional",
      recording: true,
      transcription: true,
      policyVersion: CALL_POLICY_VERSION,
      updatedAt: now(),
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/meeting-tokens"))
        return Response.json({ token: "fake-token" });
      if (init?.method === "POST")
        return Response.json({
          name: "opaque-room",
          privacy: "private",
          url: "https://test.daily.co/opaque-room",
        });
      return Response.json({ error: "not-found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const actor = await appointmentActor(apptId);
    expect(actor).toBeTruthy();
    if (!actor) return;
    const link = await joinCall(actor);
    expect(link).toContain("https://test.daily.co/");
    const posted = fetchMock.mock.calls
      .filter(([, init]) => init?.body)
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(posted[0].privacy).toBe("private");
    expect(posted[0].properties.enable_recording).toBeNull();
    expect(posted[1].properties.start_cloud_recording).toBeUndefined();
    expect(posted[1].properties.auto_start_transcription).toBe(false);
  });
  it("un chat de Ayuda Terremoto no se convierte en una ficha comercial", async () => {
    await db.insert(helpRequests).values({
      id: `${P}-earthquake-request`,
      email: "fixture@example.test",
      needCategory: "ansiedad_depresion",
      urgency: "baja",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.insert(conversations).values({
      id: `${P}-earthquake-chat`,
      professionalId: `${P}-pro`,
      helpRequestId: `${P}-earthquake-request`,
      seekerSid: "aid-fixture",
      createdAt: now(),
      updatedAt: now(),
    });
    const result = await createPatient(
      null,
      form({
        name: "Alias ficticio",
        country: "Venezuela",
        timeZone: "UTC",
        email: "",
        consent: "on",
        program: "general",
        conversationId: `${P}-earthquake-chat`,
      }),
    );
    expect(result?.ok).toBe(true);
    expect(
      await db.query.practicePatients.findFirst({
        where: eq(practicePatients.conversationId, `${P}-earthquake-chat`),
      }),
    ).toMatchObject({ program: "earthquake" });
  });
  it("la captura solo inicia con permisos de ambas partes y versión vigente", async () => {
    vi.stubEnv("NIDO_PRACTICE_ENABLED", "true");
    vi.stubEnv("DAILY_API_KEY", "fixture");
    vi.stubEnv("NIDO_CALL_CAPTURE_ENABLED", "true");
    vi.stubEnv("NIDO_CALL_CAPTURE_POLICY_URL", "https://example.test/policy");
    const apptId = `${P}-call`;
    await db
      .update(callConsents)
      .set({
        policyVersion: CALL_POLICY_VERSION,
        recording: true,
        transcription: true,
        updatedAt: now(),
      })
      .where(eq(callConsents.appointmentId, apptId));
    await db.insert(callConsents).values({
      id: `${P}-consent-seeker`,
      appointmentId: apptId,
      role: "seeker",
      recording: true,
      transcription: true,
      policyVersion: CALL_POLICY_VERSION,
      updatedAt: now(),
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/meeting-tokens"))
        return Response.json({ token: "fake-token" });
      if (init?.method === "POST")
        return Response.json({
          privacy: "private",
          url: "https://test.daily.co/opaque-room",
        });
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const actor = await appointmentActor(apptId);
    expect(actor).toBeTruthy();
    if (!actor) return;
    await joinCall(actor);
    const posted = fetchMock.mock.calls
      .filter(([, init]) => init?.body)
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(posted[0].properties.enable_recording).toBe("cloud");
    expect(posted[1].properties.start_cloud_recording).toBe(true);
    expect(posted[1].properties.auto_start_transcription).toBe(true);
  });
  it("retirar el permiso detiene la sala y conserva el puntero de archivos", async () => {
    vi.stubEnv("NIDO_PRACTICE_ENABLED", "true");
    vi.stubEnv("DAILY_API_KEY", "fixture");
    vi.stubEnv("NIDO_CALL_CAPTURE_ENABLED", "true");
    vi.stubEnv("NIDO_CALL_CAPTURE_POLICY_URL", "https://example.test/policy");
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await saveCallConsent(
      null,
      form({ appointmentId: `${P}-call` }),
    );
    expect(result?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/rooms/"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(
      await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, `${P}-call`),
      }),
    ).toMatchObject({ dailyRoom: null });
    expect(
      await db
        .select()
        .from(practiceCallRooms)
        .where(eq(practiceCallRooms.appointmentId, `${P}-call`)),
    ).not.toHaveLength(0);
  });
});
