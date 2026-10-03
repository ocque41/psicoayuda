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
  appointmentReminderDeliveries as deliveries,
  appointmentReminderPreferences as preferences,
} from "@/db/reminder-schema";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  practiceAppointments,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";
import {
  type ReminderEmailInput,
  type ReminderEmailResult,
  reminderEmailContent,
  sendAppointmentReminderEmail,
} from "@/lib/practice/reminder-email";
import {
  parseReminderPreferences,
  reminderPreferencesForUser,
  saveReminderPreferences,
} from "@/lib/practice/reminder-preferences";
import {
  claimAppointmentReminder,
  deliverAppointmentReminder as deliverWithClock,
  enqueueAppointmentReminders,
  runAppointmentReminderJobs,
} from "@/lib/practice/reminders";

const P = "test-reminders";
const AT = Date.parse("2026-10-04T12:00:00.000Z");
const iso = (at: number) => new Date(at).toISOString();
const actor = { pro: `${P}-pro-user`, patient: `${P}-patient-user` };
function deliverAppointmentReminder(
  id: string,
  at: number,
  send?: (input: ReminderEmailInput) => Promise<ReminderEmailResult>,
  now: () => number = () => at,
) {
  return deliverWithClock(id, at, send, now);
}
function form(
  enabled = true,
  revision = 0,
  offsets = [120],
  timeZone = "America/Caracas",
) {
  const data = new FormData();
  if (enabled) data.set("emailEnabled", "on");
  data.set("revision", String(revision));
  data.set("timeZone", timeZone);
  for (const value of offsets) data.append("offsetMinutes", String(value));
  return data;
}
async function cleanup() {
  await db.delete(deliveries).where(like(deliveries.userId, `${P}%`));
  await db.delete(preferences).where(like(preferences.userId, `${P}%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function optIn(role: "professional" | "patient" = "professional") {
  const userId = role === "professional" ? actor.pro : actor.patient;
  await db.insert(preferences).values({
    userId,
    role,
    emailEnabled: true,
    offsetsJson: "[120]",
    timeZone: "America/Caracas",
    revision: 1,
    createdAt: iso(AT - 86_400_000),
    updatedAt: iso(AT - 86_400_000),
  });
}
async function queued(role: "professional" | "patient" = "professional") {
  await optIn(role);
  await enqueueAppointmentReminders(AT);
  const [row] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.role, role));
  expect(row).toBeDefined();
  return row;
}
const sent = () =>
  vi.fn(async (_input: ReminderEmailInput) => ({ ok: true as const }));

describe("recordatorios opt-in de sesiones", () => {
  beforeEach(async () => {
    vi.stubEnv("RESEND_API_KEY", "fictitious-reminder-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Nido <reminders@example.test>");
    vi.stubEnv("NIDO_PRACTICE_ENABLED", "true");
    await cleanup();
    await db.insert(user).values([
      {
        id: actor.pro,
        name: "Profesional ficticio",
        email: "professional@example.test",
        emailVerified: true,
      },
      {
        id: actor.patient,
        name: "Cuenta ficticia",
        email: "patient@example.test",
        emailVerified: true,
      },
      {
        id: `${P}-other-user`,
        name: "Cuenta ajena ficticia",
        email: "other@example.test",
        emailVerified: true,
      },
    ]);
    await db.insert(professionals).values({
      id: `${P}-pro`,
      userId: actor.pro,
      email: "professional@example.test",
      fullName: "Profesional ficticio",
      languages: '["es"]',
      supportAreas: '["ansiedad_depresion"]',
      status: "approved",
      createdAt: iso(AT - 86_400_000),
      updatedAt: iso(AT - 86_400_000),
    });
    await db.insert(patientAccounts).values({
      userId: actor.patient,
      displayName: "Alias ficticio",
      onboardingCompletedAt: iso(AT - 86_400_000),
      createdAt: iso(AT - 86_400_000),
      updatedAt: iso(AT - 86_400_000),
    });
    await db.insert(conversations).values({
      id: `${P}-chat`,
      professionalId: `${P}-pro`,
      seekerSid: `${P}-sid`,
      seekerName: "Nombre privado ficticio",
      seekerEmail: "untrusted@example.test",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    await db.insert(patientConversationLinks).values({
      conversationId: `${P}-chat`,
      userId: actor.patient,
      verifiedBy: "verified_email",
      verifiedAt: iso(AT - 86_400_000),
    });
    await db.insert(practicePatients).values({
      id: `${P}-record`,
      professionalId: `${P}-pro`,
      conversationId: `${P}-chat`,
      name: "Nombre privado ficticio",
      email: "record-untrusted@example.test",
      country: "Venezuela",
      timeZone: "UTC",
      consentAt: iso(AT - 86_400_000),
      status: "active",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    await db.insert(practiceAppointments).values({
      id: `${P}-appointment`,
      professionalId: `${P}-pro`,
      patientId: `${P}-record`,
      startsAt: iso(AT + 120 * 60_000),
      endsAt: iso(AT + 170 * 60_000),
      timeZone: "UTC",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await cleanup();
    vi.unstubAllEnvs();
  });

  it("consulta preferencias sin crear opt-in y no prepara correos por defecto", async () => {
    const view = await reminderPreferencesForUser(
      actor.pro,
      "professional",
      "UTC",
    );
    expect(view.emailEnabled).toBe(false);
    expect(view.revision).toBe(0);
    expect(await db.select().from(preferences)).toHaveLength(0);
    expect(await enqueueAppointmentReminders(AT)).toBe(0);
  });

  it("guarda cada rol propio y rechaza una ventana antigua sin reactivar avisos", async () => {
    expect(
      (await saveReminderPreferences(actor.pro, "professional", form())).ok,
    ).toBe(true);
    expect(
      (await saveReminderPreferences(actor.patient, "patient", form())).ok,
    ).toBe(true);
    expect(
      (await saveReminderPreferences(actor.pro, "professional", form(false, 1)))
        .ok,
    ).toBe(true);
    expect(
      (await saveReminderPreferences(actor.pro, "professional", form(true, 1)))
        .ok,
    ).toBe(false);
    const view = await reminderPreferencesForUser(
      actor.pro,
      "professional",
      "UTC",
    );
    expect(view.emailEnabled).toBe(false);
    expect(view.revision).toBe(2);
    expect(
      (await saveReminderPreferences(`${P}-other-user`, "professional", form()))
        .ok,
    ).toBe(false);
  });

  it("exige verificación y cuenta activa para activar email", async () => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, actor.patient));
    expect(
      (await saveReminderPreferences(actor.patient, "patient", form())).ok,
    ).toBe(false);
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, actor.patient));
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, actor.patient));
    expect(
      (await saveReminderPreferences(actor.patient, "patient", form())).ok,
    ).toBe(false);
    expect(await db.select().from(preferences)).toHaveLength(0);
  });

  it("valida hasta tres anticipaciones distintas y zona real", () => {
    expect(
      parseReminderPreferences(form(true, 0, [1440, 120, 15])).success,
    ).toBe(true);
    expect(parseReminderPreferences(form(true, 0, [120, 120])).success).toBe(
      false,
    );
    expect(parseReminderPreferences(form(true, 0, [1])).success).toBe(false);
    expect(
      parseReminderPreferences(form(true, 0, [15, 30, 60, 120])).success,
    ).toBe(false);
    expect(
      parseReminderPreferences(form(true, 0, [], "Zona/Inventada")).success,
    ).toBe(false);
  });

  it("prepara dos destinatarios verificables sin guardar correos ni nombres y deduplica", async () => {
    await optIn();
    await optIn("patient");
    expect(await enqueueAppointmentReminders(AT)).toBe(2);
    expect(await enqueueAppointmentReminders(AT)).toBe(0);
    const rows = await db.select().from(deliveries);
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("@");
    expect(JSON.stringify(rows)).not.toContain("Nombre privado");
  });

  it("dos workers no reclaman la misma entrega", async () => {
    const row = await queued();
    const claims = await Promise.all([
      claimAppointmentReminder(row.id, AT),
      claimAppointmentReminder(row.id, AT),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("envía una vez al correo de la cuenta y mantiene registro terminal", async () => {
    const row = await queued("patient");
    const send = sent();
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("sent");
    expect(await deliverAppointmentReminder(row.id, AT + 60_000, send)).toBe(
      "unclaimed",
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe("patient@example.test");
    expect(send.mock.calls[0][0].to).not.toBe("untrusted@example.test");
    const [finished] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, row.id));
    expect(finished.status).toBe("sent");
    expect(finished.attempts).toBe(1);
  });

  it.each([
    "cancelled",
    "completed",
    "no_show",
  ])("no envía si el estado pasó a %s", async (status) => {
    const row = await queued();
    const send = sent();
    await db
      .update(practiceAppointments)
      .set({ status })
      .where(eq(practiceAppointments.id, row.appointmentId));
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("descarta horario antiguo y crea una clave nueva al reprogramar", async () => {
    const row = await queued();
    const send = sent();
    await db
      .update(practiceAppointments)
      .set({ startsAt: iso(AT + 150 * 60_000), endsAt: iso(AT + 200 * 60_000) })
      .where(eq(practiceAppointments.id, row.appointmentId));
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("skipped");
    expect(await enqueueAppointmentReminders(AT)).toBe(1);
    const rows = await db.select().from(deliveries);
    expect(new Set(rows.map((value) => value.id)).size).toBe(2);
    expect(send).not.toHaveBeenCalled();
  });

  it("revocar el vínculo cancela la entrega del paciente", async () => {
    const row = await queued("patient");
    const send = sent();
    await db
      .delete(patientConversationLinks)
      .where(eq(patientConversationLinks.userId, actor.patient));
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("no encola al paciente si closedAt existe aunque el estado siga abierto", async () => {
    await optIn("patient");
    await db
      .update(conversations)
      .set({ closedAt: iso(AT), status: "open" })
      .where(eq(conversations.id, `${P}-chat`));
    expect(await enqueueAppointmentReminders(AT)).toBe(0);
    expect(await db.select().from(deliveries)).toHaveLength(0);
  });

  it.each([
    "beforeLookup",
    "afterLookup",
  ])("no envía con lease vencido por espera DB: %s", async (phase) => {
    const row = await queued("patient");
    const send = sent();
    const clock = vi
      .fn<() => number>()
      .mockReturnValueOnce(phase === "beforeLookup" ? AT + 121_000 : AT)
      .mockReturnValue(AT + 121_000);
    expect(await deliverAppointmentReminder(row.id, AT, send, clock)).toBe(
      "skipped",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    "closedTimestamp",
    "deleted",
    "anonymized",
    "unverified",
    "emailChanged",
    "accountDeleting",
    "professionalSuspended",
    "optOut",
  ])("revalida al entregar: %s", async (change) => {
    const row = await queued("patient");
    const send = sent();
    if (change === "closedTimestamp")
      await db
        .update(conversations)
        .set({ closedAt: iso(AT), status: "open" })
        .where(eq(conversations.id, `${P}-chat`));
    if (change === "deleted")
      await db
        .update(conversations)
        .set({ deletedAt: new Date(AT) })
        .where(eq(conversations.id, `${P}-chat`));
    if (change === "anonymized")
      await db
        .update(conversations)
        .set({ anonymizedAt: iso(AT) })
        .where(eq(conversations.id, `${P}-chat`));
    if (change === "unverified")
      await db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, actor.patient));
    if (change === "emailChanged")
      await db
        .update(user)
        .set({ email: "new-address@example.test" })
        .where(eq(user.id, actor.patient));
    if (change === "accountDeleting")
      await db
        .update(patientAccounts)
        .set({ deletionState: "deleting" })
        .where(eq(patientAccounts.userId, actor.patient));
    if (change === "professionalSuspended")
      await db
        .update(professionals)
        .set({ status: "suspended" })
        .where(eq(professionals.id, `${P}-pro`));
    if (change === "optOut")
      await db
        .update(preferences)
        .set({ emailEnabled: false })
        .where(eq(preferences.userId, actor.patient));
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    if (change === "closedTimestamp") {
      const [claimedThenSkipped] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, row.id));
      expect(claimedThenSkipped.attempts).toBe(1);
      expect(claimedThenSkipped.status).toBe("skipped");
    }
  });

  it("actualiza zona/revisión de un aviso futuro que aún no se intentó", async () => {
    await db
      .update(practiceAppointments)
      .set({ startsAt: iso(AT + 150 * 60_000), endsAt: iso(AT + 200 * 60_000) })
      .where(eq(practiceAppointments.id, `${P}-appointment`));
    const row = await queued();
    await db
      .update(preferences)
      .set({ revision: 2, timeZone: "Europe/Madrid" })
      .where(eq(preferences.userId, actor.pro));
    expect(await enqueueAppointmentReminders(AT)).toBe(1);
    const [updated] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, row.id));
    expect(updated.preferenceRevision).toBe(2);
    expect(updated.timeZone).toBe("Europe/Madrid");
    expect(updated.attempts).toBe(0);
    expect(await db.select().from(deliveries)).toHaveLength(1);
  });

  it("reintenta con la misma identidad, backoff y sin reclamar antes de tiempo", async () => {
    const row = await queued();
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retryable: true, code: "network" })
      .mockResolvedValue({ ok: true });
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("retry");
    expect(
      await deliverAppointmentReminder(row.id, AT + 4 * 60_000, send),
    ).toBe("unclaimed");
    expect(
      await deliverAppointmentReminder(row.id, AT + 5 * 60_000, send),
    ).toBe("sent");
    expect(send.mock.calls[0][0].deliveryId).toBe(
      send.mock.calls[1][0].deliveryId,
    );
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  });

  it("agota cuatro intentos y después no vuelve a enviar", async () => {
    const row = await queued();
    const send = vi.fn(async () => ({
      ok: false as const,
      retryable: true,
      code: "network" as const,
    }));
    for (const minute of [0, 5, 20])
      expect(
        await deliverAppointmentReminder(row.id, AT + minute * 60_000, send),
      ).toBe("retry");
    expect(
      await deliverAppointmentReminder(row.id, AT + 80 * 60_000, send),
    ).toBe("dead");
    expect(
      await deliverAppointmentReminder(row.id, AT + 90 * 60_000, send),
    ).toBe("unclaimed");
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("no reintenta fuera de la ventana Resend de 24 horas", async () => {
    const row = await queued();
    const send = sent();
    await db
      .update(deliveries)
      .set({ firstAttemptAt: AT - 23 * 3_600_000, attempts: 1 })
      .where(eq(deliveries.id, row.id));
    expect(await deliverAppointmentReminder(row.id, AT, send)).toBe("dead");
    expect(send).not.toHaveBeenCalled();
  });

  it("sin proveedor no toca el ledger ni llama al sender", async () => {
    await optIn();
    vi.stubEnv("RESEND_API_KEY", "");
    const send = sent();
    const result = await runAppointmentReminderJobs({ now: () => AT, send });
    expect(result.unavailable).toBe(true);
    expect(await db.select().from(deliveries)).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("genera correo mínimo y headers idempotentes sin datos clínicos", async () => {
    const input = {
      to: "patient@example.test",
      startsAt: iso(AT + 120 * 60_000),
      timeZone: "America/Caracas",
      role: "patient" as const,
      deliveryId: "opaque-fictitious-id",
    };
    const content = reminderEmailContent(input);
    expect(content.subject).toBe("Tienes una sesión en Nido");
    expect(content.text).toContain("America/Caracas");
    expect(content.text).toContain("/mi/calendario");
    expect(content.html).not.toContain("Nombre privado");
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{"id":"fictitious-resend-id"}', { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await sendAppointmentReminderEmail(input)).toEqual({ ok: true });
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "nido-reminder/opaque-fictitious-id",
    );
    expect(String(init.body)).not.toContain(`${P}-appointment`);
    expect(String(init.body)).not.toContain("untrusted@example.test");
  });
});
