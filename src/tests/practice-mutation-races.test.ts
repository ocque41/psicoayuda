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
import {
  auditLogs,
  careCycles,
  carePlans,
  conversations,
  helpRequests,
  practiceAppointments,
  practicePatients,
  practiceReceipts,
  practiceServices,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  session: vi.fn(async () => ({
    user: {
      id: "test-practice-race-user",
      email: "test-practice-race@test.local",
    },
  })),
  daily: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/practice/calls", () => ({ dailyRequest: mocks.daily }));

import {
  createPatient,
  rescheduleAppointment,
  saveReceipt,
  saveService,
  saveSettings,
  scheduleAppointment,
  setPatientStatus,
  toggleService,
  updateAppointment,
  updatePatientContact,
} from "@/app/pro/consulta/actions";
import {
  confirmExternalCycle,
  proposeCare,
} from "@/app/pro/pacientes/[patientId]/care-actions";
import { nextPracticeTimestamp } from "@/lib/practice/mutation-guard";

const P = "test-practice-race";
const proId = `${P}-pro`;
const patientId = `${P}-patient`;
const serviceId = `${P}-service`;
const appointmentId = `${P}-appointment`;
const planId = `${P}-plan`;
const snapshot = "2025-01-01T00:00:00.000Z";
const nextSnapshot = "2025-01-01T00:00:00.001Z";
function form(data: Record<string, string>) {
  const value = new FormData();
  for (const [key, entry] of Object.entries(data)) value.set(key, entry);
  return value;
}
function localFuture(days = 2) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
}
const patientForm = () =>
  form({
    name: "Persona ficticia nueva",
    email: "",
    country: "Venezuela",
    timeZone: "UTC",
    program: "general",
    consent: "on",
  });
const serviceForm = () =>
  form({
    title: "Servicio ficticio nuevo",
    durationMinutes: "50",
    sessionsCount: "1",
    price: "25",
    currency: "usd",
    interval: "one_time",
    validityDays: "30",
    cancellationHours: "24",
  });
const appointmentForm = () =>
  form({ patientId, serviceId, startsAt: localFuture() });
const contactForm = () =>
  form({
    patientId,
    name: "Contacto ficticio nuevo",
    email: "",
    country: "Venezuela",
    timeZone: "UTC",
    consent: "on",
  });
const cycleForm = () =>
  form({
    carePlanId: planId,
    reference: "Referencia ficticia",
    confirmed: "on",
  });

async function cleanup() {
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
    .delete(conversations)
    .where(like(conversations.professionalId, `${P}%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.actorEmail, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function seed() {
  await cleanup();
  for (const suffix of ["", "-other"]) {
    await db.insert(user).values({
      id: `${P}-user${suffix}`,
      name: "Cuenta ficticia",
      email: `${P}${suffix}@test.local`,
    });
    await db.insert(professionals).values({
      id: `${proId}${suffix}`,
      userId: `${P}-user${suffix}`,
      email: `${P}${suffix}@test.local`,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: '["es"]',
      supportAreas: '["ansiedad_depresion"]',
      createdAt: snapshot,
      updatedAt: snapshot,
    });
  }
  await db.insert(practicePatients).values({
    id: patientId,
    professionalId: proId,
    name: "Paciente ficticio",
    email: null,
    country: "Venezuela",
    timeZone: "UTC",
    program: "general",
    status: "active",
    consentAt: snapshot,
    createdAt: snapshot,
    updatedAt: snapshot,
  });
  await db.insert(practiceServices).values({
    id: serviceId,
    professionalId: proId,
    title: "Servicio ficticio",
    durationMinutes: 50,
    sessionsCount: 1,
    priceCents: 2500,
    currency: "usd",
    createdAt: snapshot,
  });
  await db
    .insert(practiceSettings)
    .values({ professionalId: proId, timeZone: "UTC", updatedAt: snapshot });
}
async function seedAppointment(room: string | null = null) {
  const startsAt = `${localFuture()}:00.000Z`;
  await db.insert(practiceAppointments).values({
    id: appointmentId,
    professionalId: proId,
    patientId,
    serviceId,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 50 * 60000).toISOString(),
    timeZone: "UTC",
    dailyRoom: room,
    createdAt: snapshot,
    updatedAt: snapshot,
  });
}
async function seedPlan() {
  await db.insert(carePlans).values({
    id: planId,
    professionalId: proId,
    patientId,
    serviceId,
    title: "Acuerdo ficticio",
    sessionsCount: 2,
    durationMinutes: 50,
    priceCents: 4000,
    currency: "usd",
    interval: "one_time",
    validityDays: 30,
    createdAt: snapshot,
  });
}
// La barrera deja terminar las lecturas previas y cambia la BD justo antes
// de ejecutar el batch real; no sustituye ni simula el resultado de SQL.
function raceAtWrite(mutate: () => Promise<unknown>) {
  const original = db.batch.bind(db);
  vi.spyOn(db, "batch").mockImplementationOnce((async (queries) => {
    await mutate();
    return original(queries);
  }) as typeof db.batch);
}
async function expectNoAudit() {
  expect(
    await db.query.auditLogs.findMany({
      where: like(auditLogs.actorEmail, `${P}%`),
    }),
  ).toHaveLength(0);
}
async function suspend() {
  return db
    .update(professionals)
    .set({ status: "deleting" })
    .where(eq(professionals.id, proId));
}
async function reassignActor() {
  return db
    .update(professionals)
    .set({ userId: `${P}-user-other` })
    .where(eq(professionals.id, proId));
}
async function closePatient() {
  return db
    .update(practicePatients)
    .set({ status: "closed", updatedAt: nextSnapshot })
    .where(eq(practicePatients.id, patientId));
}
async function pauseService() {
  return db
    .update(practiceServices)
    .set({ active: false })
    .where(eq(practiceServices.id, serviceId));
}

describe("Escrituras CRM autorizadas en el instante de mutación", () => {
  beforeEach(seed);
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.daily.mockReset();
    mocks.daily.mockResolvedValue(undefined);
  });
  afterAll(cleanup);

  for (const [label, mutate] of [
    ["suspender", suspend],
    ["reasignar su cuenta", reassignActor],
    [
      "convertirlo en colaborador no clínico",
      () =>
        db
          .update(professionals)
          .set({ nonClinicalHelper: true })
          .where(eq(professionals.id, proId)),
    ],
  ] as const) {
    it(`no crea una ficha tras ${label} al profesional durante la petición`, async () => {
      raceAtWrite(mutate);
      expect((await createPatient(null, patientForm()))?.ok).toBe(false);
      expect(
        await db.query.practicePatients.findMany({
          where: eq(practicePatients.professionalId, proId),
        }),
      ).toHaveLength(1);
      await expectNoAudit();
    });
  }
  it("no crea un servicio después de suspender el actor", async () => {
    raceAtWrite(suspend);
    expect((await saveService(null, serviceForm()))?.ok).toBe(false);
    expect(
      await db.query.practiceServices.findMany({
        where: eq(practiceServices.professionalId, proId),
      }),
    ).toHaveLength(1);
    await expectNoAudit();
  });
  it("crea fichas y servicios válidos con una sola auditoría por escritura", async () => {
    expect((await createPatient(null, patientForm()))?.ok).toBe(true);
    expect((await saveService(null, serviceForm()))?.ok).toBe(true);
    const logs = await db.query.auditLogs.findMany({
      where: like(auditLogs.actorEmail, `${P}%`),
    });
    expect(logs.map((entry) => entry.action).sort()).toEqual([
      "patient_created",
      "service_created",
    ]);
  });
  it("no vincula una ficha nueva si el chat se cierra tras leerlo", async () => {
    const id = `${P}-chat`;
    await db.insert(conversations).values({
      id,
      professionalId: proId,
      seekerSid: `${P}-seeker`,
      createdAt: snapshot,
      updatedAt: snapshot,
    });
    const data = patientForm();
    data.set("conversationId", id);
    raceAtWrite(() =>
      db
        .update(conversations)
        .set({ closedAt: new Date().toISOString(), status: "closed" })
        .where(eq(conversations.id, id)),
    );
    expect((await createPatient(null, data))?.ok).toBe(false);
    expect(
      await db.query.practicePatients.findMany({
        where: eq(practicePatients.conversationId, id),
      }),
    ).toHaveLength(0);
    await expectNoAudit();
  });
  it("rechaza un chat cuya solicitud de ayuda desaparece entre la lectura y la creación de ficha", async () => {
    const requestId = `${P}-request`;
    const conversationId = `${P}-request-chat`;
    await db.insert(helpRequests).values({
      id: requestId,
      email: `${P}-seeker@example.test`,
      needCategory: "ansiedad_depresion",
      urgency: "soon",
      createdAt: snapshot,
      updatedAt: snapshot,
    });
    await db.insert(conversations).values({
      id: conversationId,
      professionalId: proId,
      seekerSid: `${P}-request-seeker`,
      helpRequestId: requestId,
      createdAt: snapshot,
      updatedAt: snapshot,
    });
    const data = patientForm();
    data.set("conversationId", conversationId);
    raceAtWrite(() =>
      db
        .update(conversations)
        .set({ helpRequestId: null })
        .where(eq(conversations.id, conversationId)),
    );
    expect((await createPatient(null, data))?.ok).toBe(false);
    expect(
      await db.query.practicePatients.findMany({
        where: eq(practicePatients.conversationId, conversationId),
      }),
    ).toHaveLength(0);
    await expectNoAudit();
  });

  for (const [label, mutate] of [
    ["ficha cerrada", closePatient],
    ["servicio pausado", pauseService],
    ["actor suspendido", suspend],
    ["actor reasignado", reassignActor],
    [
      "duración modificada",
      () =>
        db
          .update(practiceServices)
          .set({ durationMinutes: 60 })
          .where(eq(practiceServices.id, serviceId)),
    ],
    [
      "precio modificado",
      () =>
        db
          .update(practiceServices)
          .set({ priceCents: 3000 })
          .where(eq(practiceServices.id, serviceId)),
    ],
    [
      "zona modificada",
      () =>
        db
          .update(practiceSettings)
          .set({ timeZone: "America/Caracas" })
          .where(eq(practiceSettings.professionalId, proId)),
    ],
  ] as const) {
    it(`no programa una cita con ${label} entre la lectura y el INSERT`, async () => {
      raceAtWrite(mutate);
      expect((await scheduleAppointment(null, appointmentForm()))?.ok).toBe(
        false,
      );
      expect(
        await db.query.practiceAppointments.findMany({
          where: eq(practiceAppointments.professionalId, proId),
        }),
      ).toHaveLength(0);
      await expectNoAudit();
    });
  }
  it("no consume crédito ni audita al rechazar la ficha de un ciclo pagado", async () => {
    await seedPlan();
    const cycleId = `${P}-cycle`;
    await db.insert(careCycles).values({
      id: cycleId,
      carePlanId: planId,
      externalReference: `${P}-paid`,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      sessionsCount: 1,
      amountCents: 2500,
      currency: "usd",
      createdAt: snapshot,
    });
    const data = appointmentForm();
    data.set("careCycleId", cycleId);
    raceAtWrite(closePatient);
    expect((await scheduleAppointment(null, data))?.ok).toBe(false);
    expect(
      await db.query.practiceAppointments.findMany({
        where: eq(practiceAppointments.careCycleId, cycleId),
      }),
    ).toHaveLength(0);
    expect(
      (
        await db.query.careCycles.findFirst({
          where: eq(careCycles.id, cycleId),
        })
      )?.sessionsCount,
    ).toBe(1);
    await expectNoAudit();
  });
  it("guarda una cita válida y conserva el precio cero de Ayuda Terremoto", async () => {
    await db
      .update(practicePatients)
      .set({ program: "earthquake" })
      .where(eq(practicePatients.id, patientId));
    expect((await scheduleAppointment(null, appointmentForm()))?.ok).toBe(true);
    const [appointment] = await db.query.practiceAppointments.findMany({
      where: eq(practiceAppointments.patientId, patientId),
    });
    expect(appointment?.priceCents).toBe(0);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, appointment?.id || "missing"),
      }),
    ).toHaveLength(1);
  });

  for (const [label, mutate] of [
    [
      "cancelación simultánea",
      () =>
        db
          .update(practiceAppointments)
          .set({ status: "cancelled", updatedAt: nextSnapshot })
          .where(eq(practiceAppointments.id, appointmentId)),
    ],
    ["suspensión simultánea", suspend],
    [
      "revisión simultánea",
      () =>
        db
          .update(practiceAppointments)
          .set({ updatedAt: nextSnapshot })
          .where(eq(practiceAppointments.id, appointmentId)),
    ],
  ] as const) {
    it(`no informa éxito ni audita un cambio de cita después de ${label}`, async () => {
      await seedAppointment();
      raceAtWrite(mutate);
      expect(
        (
          await updateAppointment(
            null,
            form({ appointmentId, status: "no_show" }),
          )
        )?.ok,
      ).toBe(false);
      expect(
        (
          await db.query.practiceAppointments.findFirst({
            where: eq(practiceAppointments.id, appointmentId),
          })
        )?.status,
      ).not.toBe("no_show");
      await expectNoAudit();
    });
  }
  it("revalida el actor después de esperar al proveedor de llamadas", async () => {
    await seedAppointment("sala-ficticia");
    mocks.daily.mockImplementationOnce(async () => {
      await suspend();
      return undefined;
    });
    expect(
      (
        await updateAppointment(
          null,
          form({ appointmentId, status: "cancelled" }),
        )
      )?.ok,
    ).toBe(false);
    expect(mocks.daily).toHaveBeenCalledOnce();
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, appointmentId),
        })
      )?.status,
    ).toBe("scheduled");
    await expectNoAudit();
  });
  for (const [label, mutate] of [
    ["ficha cerrada", closePatient],
    ["actor suspendido", suspend],
    [
      "cita cancelada",
      () =>
        db
          .update(practiceAppointments)
          .set({ status: "cancelled", updatedAt: nextSnapshot })
          .where(eq(practiceAppointments.id, appointmentId)),
    ],
    [
      "sala reemplazada",
      () =>
        db
          .update(practiceAppointments)
          .set({ dailyRoom: "otra-sala-ficticia" })
          .where(eq(practiceAppointments.id, appointmentId)),
    ],
  ] as const) {
    it(`no reprograma una sesión con ${label} durante la petición`, async () => {
      await seedAppointment();
      const previous = await db.query.practiceAppointments.findFirst({
        where: eq(practiceAppointments.id, appointmentId),
      });
      raceAtWrite(mutate);
      expect(
        (
          await rescheduleAppointment(
            null,
            form({ appointmentId, startsAt: localFuture(3) }),
          )
        )?.ok,
      ).toBe(false);
      expect(
        (
          await db.query.practiceAppointments.findFirst({
            where: eq(practiceAppointments.id, appointmentId),
          })
        )?.startsAt,
      ).toBe(previous?.startsAt);
      await expectNoAudit();
    });
  }
  it("guarda una cancelación válida una vez y rechaza el segundo intento", async () => {
    await seedAppointment();
    const data = form({ appointmentId, status: "cancelled" });
    expect((await updateAppointment(null, data))?.ok).toBe(true);
    expect((await updateAppointment(null, data))?.ok).toBe(false);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, appointmentId),
      }),
    ).toHaveLength(1);
  });
  it("guarda una reprogramación válida y avanza su revisión", async () => {
    await seedAppointment();
    const startsAt = localFuture(3);
    expect(
      (await rescheduleAppointment(null, form({ appointmentId, startsAt })))
        ?.ok,
    ).toBe(true);
    const saved = await db.query.practiceAppointments.findFirst({
      where: eq(practiceAppointments.id, appointmentId),
    });
    expect(saved?.startsAt).toBe(`${startsAt}:00.000Z`);
    expect(saved?.updatedAt).not.toBe(snapshot);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, appointmentId),
      }),
    ).toHaveLength(1);
  });

  it("no pisa un estado de ficha cambiado en otra petición", async () => {
    raceAtWrite(closePatient);
    expect(
      (await setPatientStatus(null, form({ patientId, status: "waiting" })))
        ?.ok,
    ).toBe(false);
    expect(
      (
        await db.query.practicePatients.findFirst({
          where: eq(practicePatients.id, patientId),
        })
      )?.status,
    ).toBe("closed");
    await expectNoAudit();
  });
  it("no pisa datos de contacto modificados en otra petición", async () => {
    raceAtWrite(() =>
      db
        .update(practicePatients)
        .set({ name: "Edición ficticia paralela", updatedAt: nextSnapshot })
        .where(eq(practicePatients.id, patientId)),
    );
    expect((await updatePatientContact(null, contactForm()))?.ok).toBe(false);
    expect(
      (
        await db.query.practicePatients.findFirst({
          where: eq(practicePatients.id, patientId),
        })
      )?.name,
    ).toBe("Edición ficticia paralela");
    await expectNoAudit();
  });
  it("rechaza actualizar contactos después de reasignar la cuenta del actor", async () => {
    raceAtWrite(reassignActor);
    expect((await updatePatientContact(null, contactForm()))?.ok).toBe(false);
    await expectNoAudit();
  });
  it("permite mantener contactos de una ficha cerrada sin reabrirla", async () => {
    await closePatient();
    expect((await updatePatientContact(null, contactForm()))?.ok).toBe(true);
    expect(
      (
        await db.query.practicePatients.findFirst({
          where: eq(practicePatients.id, patientId),
        })
      )?.status,
    ).toBe("closed");
  });
  it("no acepta servicios desconocidos ni repite una pausa ya guardada", async () => {
    expect(
      (
        await toggleService(
          null,
          form({ serviceId: "servicio-inexistente", active: "0" }),
        )
      )?.ok,
    ).toBe(false);
    expect(
      (await toggleService(null, form({ serviceId, active: "0" })))?.ok,
    ).toBe(true);
    expect(
      (await toggleService(null, form({ serviceId, active: "0" })))?.ok,
    ).toBe(false);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, serviceId),
      }),
    ).toHaveLength(1);
  });
  it("no cambia servicios después de una suspensión durante el write", async () => {
    raceAtWrite(suspend);
    expect(
      (await toggleService(null, form({ serviceId, active: "0" })))?.ok,
    ).toBe(false);
    expect(
      (
        await db.query.practiceServices.findFirst({
          where: eq(practiceServices.id, serviceId),
        })
      )?.active,
    ).toBe(true);
    await expectNoAudit();
  });

  for (const mode of ["actor", "settings", "first-create"] as const) {
    it(`no sobrescribe ajustes con una carrera de ${mode}`, async () => {
      if (mode === "first-create")
        await db
          .delete(practiceSettings)
          .where(eq(practiceSettings.professionalId, proId));
      const original = db.query.practiceSettings.findFirst.bind(
        db.query.practiceSettings,
      );
      vi.spyOn(db.query.practiceSettings, "findFirst").mockImplementationOnce(
        (async (config) => {
          const prior = await original(config);
          if (mode === "actor") await suspend();
          else if (mode === "settings")
            await db
              .update(practiceSettings)
              .set({ timeZone: "America/Caracas", updatedAt: nextSnapshot })
              .where(eq(practiceSettings.professionalId, proId));
          else
            await db.insert(practiceSettings).values({
              professionalId: proId,
              timeZone: "America/Caracas",
              updatedAt: nextSnapshot,
            });
          return prior;
        }) as typeof db.query.practiceSettings.findFirst,
      );
      expect(
        (
          await saveSettings(
            null,
            form({ timeZone: "Europe/Madrid", workStart: "8", workEnd: "18" }),
          )
        )?.ok,
      ).toBe(false);
      expect(
        (
          await db.query.practiceSettings.findFirst({
            where: eq(practiceSettings.professionalId, proId),
          })
        )?.timeZone,
      ).toBe(mode === "actor" ? "UTC" : "America/Caracas");
    });
  }
  it("crea y actualiza ajustes válidos sin convertir la primera escritura en no-op", async () => {
    await db
      .delete(practiceSettings)
      .where(eq(practiceSettings.professionalId, proId));
    expect(
      (
        await saveSettings(
          null,
          form({ timeZone: "UTC", workStart: "8", workEnd: "18" }),
        )
      )?.ok,
    ).toBe(true);
    expect(
      (
        await saveSettings(
          null,
          form({ timeZone: "Europe/Madrid", workStart: "9", workEnd: "20" }),
        )
      )?.ok,
    ).toBe(true);
    expect(
      (
        await db.query.practiceSettings.findFirst({
          where: eq(practiceSettings.professionalId, proId),
        })
      )?.timeZone,
    ).toBe("Europe/Madrid");
  });
  it("la revisión CAS avanza incluso en el mismo milisegundo", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(snapshot));
    expect(nextPracticeTimestamp(snapshot)).toBe(nextSnapshot);
    expect(nextPracticeTimestamp(nextSnapshot)).toBe(
      "2025-01-01T00:00:00.002Z",
    );
  });

  for (const [label, mutate] of [
    ["actor suspendido", suspend],
    ["ficha cerrada", closePatient],
    ["servicio pausado", pauseService],
  ] as const) {
    it(`no crea acuerdos con ${label} después de las lecturas previas`, async () => {
      raceAtWrite(mutate);
      expect(
        (await proposeCare(null, form({ patientId, serviceId })))?.ok,
      ).toBe(false);
      expect(
        await db.query.carePlans.findMany({
          where: eq(carePlans.professionalId, proId),
        }),
      ).toHaveLength(0);
      await expectNoAudit();
    });
  }
  it("crea acuerdos válidos con un snapshot y auditoría propios", async () => {
    expect((await proposeCare(null, form({ patientId, serviceId })))?.ok).toBe(
      true,
    );
    const [plan] = await db.query.carePlans.findMany({
      where: eq(carePlans.professionalId, proId),
    });
    expect(plan?.priceCents).toBe(2500);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, plan?.id || "missing"),
      }),
    ).toHaveLength(1);
  });
  for (const [label, mutate] of [
    ["actor suspendido", suspend],
    [
      "checkout iniciado",
      () =>
        db
          .update(carePlans)
          .set({ checkoutId: "checkout-ficticio" })
          .where(eq(carePlans.id, planId)),
    ],
    [
      "plan en revisión",
      () =>
        db
          .update(carePlans)
          .set({ status: "needs_review" })
          .where(eq(carePlans.id, planId)),
    ],
    [
      "precio modificado",
      () =>
        db
          .update(carePlans)
          .set({ priceCents: 5000 })
          .where(eq(carePlans.id, planId)),
    ],
  ] as const) {
    it(`no confirma ni activa ciclos externos con ${label} durante el write`, async () => {
      await seedPlan();
      raceAtWrite(mutate);
      expect((await confirmExternalCycle(null, cycleForm()))?.ok).toBe(false);
      expect(
        await db.query.careCycles.findMany({
          where: eq(careCycles.carePlanId, planId),
        }),
      ).toHaveLength(0);
      expect(
        (
          await db.query.carePlans.findFirst({
            where: eq(carePlans.id, planId),
          })
        )?.status,
      ).not.toBe("active");
      await expectNoAudit();
    });
  }
  it("conserva el registro financiero de un acuerdo existente al cerrar la ficha o pausar su servicio", async () => {
    await seedPlan();
    await closePatient();
    await pauseService();
    expect((await confirmExternalCycle(null, cycleForm()))?.ok).toBe(true);
    expect((await confirmExternalCycle(null, cycleForm()))?.ok).toBe(false);
    const [cycle] = await db.query.careCycles.findMany({
      where: eq(careCycles.carePlanId, planId),
    });
    expect(cycle?.amountCents).toBe(4000);
    expect(
      await db.query.auditLogs.findMany({
        where: eq(auditLogs.entityId, cycle?.id || "missing"),
      }),
    ).toHaveLength(1);
  });
  it("no registra recibos con una zona horaria cambiada durante la petición", async () => {
    raceAtWrite(() =>
      db
        .update(practiceSettings)
        .set({ timeZone: "America/Caracas" })
        .where(eq(practiceSettings.professionalId, proId)),
    );
    expect(
      (
        await saveReceipt(
          null,
          form({
            patientId,
            amount: "25",
            currency: "usd",
            method: "cash",
            reference: "Referencia ficticia recibo",
            receivedAt: "2026-01-01T10:00",
            receivedTimeZone: "UTC",
          }),
        )
      )?.ok,
    ).toBe(false);
    expect(
      await db.query.practiceReceipts.findMany({
        where: eq(practiceReceipts.professionalId, proId),
      }),
    ).toHaveLength(0);
    await expectNoAudit();
  });
});
