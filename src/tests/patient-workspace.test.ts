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
  accountOnboardingDrafts,
  accountRolePreferences,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
} from "@/db/patient-schema";
import {
  conversations,
  practiceAppointments,
  practicePatients,
  practiceReceipts,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import {
  hasPatientConversationAccess,
  linkPatientConversation,
} from "@/lib/patient/access";
import {
  completePatientOnboarding,
  ensurePatientAccount,
  patientOnboardingSchema,
} from "@/lib/patient/accounts";
import { patientExportChunks } from "@/lib/patient/export";
import { patientAccountDeleteStatements } from "@/lib/patient/purge";
import {
  patientAppointments,
  patientChats,
  patientPayments,
} from "@/lib/patient/queries";
import {
  createPatientSessionRequest,
  withdrawPatientRequest,
} from "@/lib/patient/requests";
import { mintSeekerToken } from "@/lib/seeker-token";

const P = "test-patient-space",
  now = () => new Date().toISOString();
function token(sid: string, conversationId: string) {
  return mintSeekerToken(
    {
      sid,
      conversationId,
      role: "seeker",
      iat: Date.now(),
      exp: Date.now() + 3600000,
    },
    getAuthSecret(),
  );
}
async function cleanup() {
  await db
    .delete(patientSessionRequests)
    .where(like(patientSessionRequests.userId, `${P}%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db
    .delete(accountOnboardingDrafts)
    .where(like(accountOnboardingDrafts.userId, `${P}%`));
  await db
    .delete(accountRolePreferences)
    .where(like(accountRolePreferences.userId, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db.delete(practiceReceipts).where(like(practiceReceipts.id, `${P}%`));
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
describe("espacio autenticado del paciente", () => {
  beforeAll(async () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-patient-space-secret-at-least-32-characters",
    );
    await cleanup();
    await db.insert(user).values([
      {
        id: `${P}-owner`,
        name: "Cuenta ficticia",
        email: `${P}@example.test`,
        emailVerified: true,
      },
      {
        id: `${P}-other`,
        name: "Otra cuenta ficticia",
        email: `${P}-other@example.test`,
        emailVerified: false,
      },
      {
        id: `${P}-prouser`,
        name: "Profesional ficticio",
        email: `${P}-pro@example.test`,
      },
    ]);
    await db.insert(professionals).values({
      id: `${P}-pro`,
      userId: `${P}-prouser`,
      email: `${P}-pro@example.test`,
      fullName: "Profesional ficticio",
      languages: '["es"]',
      supportAreas: '["ansiedad_depresion"]',
      status: "approved",
      createdAt: now(),
      updatedAt: now(),
    });
    for (const id of ["owner", "other"])
      await completePatientOnboarding(`${P}-${id}`, {
        displayName: "Alias ficticio",
        country: "VE",
        timezone: "America/Caracas",
        ageBand: "adult",
      });
    await db.insert(conversations).values(
      Array.from({ length: 25 }, (_, i) => ({
        id: `${P}-chat-${i}`,
        professionalId: `${P}-pro`,
        seekerSid: `${P}-original-${i}`,
        seekerEmail: i === 24 ? `${P}-other@example.test` : `${P}@example.test`,
        createdAt: now(),
        updatedAt: now(),
      })),
    );
    await db.insert(practicePatients).values(
      Array.from({ length: 25 }, (_, i) => ({
        id: `${P}-record-${i}`,
        professionalId: `${P}-pro`,
        conversationId: `${P}-chat-${i}`,
        name: "Ficha ficticia",
        country: "Venezuela",
        timeZone: "America/Caracas",
        consentAt: now(),
        createdAt: now(),
        updatedAt: now(),
      })),
    );
    await db.insert(practiceAppointments).values(
      Array.from({ length: 25 }, (_, i) => ({
        id: `${P}-appointment-${i}`,
        professionalId: `${P}-pro`,
        patientId: `${P}-record-${i}`,
        startsAt: new Date(Date.now() + (i + 5) * 86400000).toISOString(),
        endsAt: new Date(
          Date.now() + (i + 5) * 86400000 + 3600000,
        ).toISOString(),
        timeZone: "UTC",
        createdAt: now(),
        updatedAt: now(),
      })),
    );
    await db.insert(practiceReceipts).values([
      {
        id: `${P}-receipt-own`,
        professionalId: `${P}-pro`,
        patientId: `${P}-record-0`,
        amountCents: 2500,
        currency: "usd",
        method: "zelle",
        reference: `${P}-own-ref`,
        receivedAt: now(),
      },
      {
        id: `${P}-receipt-other`,
        professionalId: `${P}-pro`,
        patientId: `${P}-record-24`,
        amountCents: 7700,
        currency: "eur",
        method: "transfer",
        reference: `${P}-other-ref`,
        receivedAt: now(),
      },
    ]);
  });
  afterAll(async () => {
    await cleanup();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllGlobals());
  it("no crea cuentas huérfanas si el usuario ya no existe", async () => {
    await expect(
      ensurePatientAccount({ id: `${P}-missing`, name: "Alias" }),
    ).rejects.toThrow("preparar");
    await expect(
      completePatientOnboarding(`${P}-missing`, {
        displayName: "Alias",
        country: "VE",
        timezone: "UTC",
        ageBand: "adult",
      }),
    ).rejects.toThrow("guardar");
    expect(
      await db.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, `${P}-missing`),
      }),
    ).toBeUndefined();
  });
  it("no vincula por un correo no verificado", async () => {
    expect(await linkPatientConversation(`${P}-other`, `${P}-chat-24`)).toBe(
      false,
    );
    expect(
      await hasPatientConversationAccess(`${P}-other`, `${P}-chat-24`),
    ).toBe(false);
  });
  it("un correo verificado exacto da acceso propio y nunca a otro correo", async () => {
    expect(await linkPatientConversation(`${P}-owner`, `${P}-chat-0`)).toBe(
      true,
    );
    expect(await linkPatientConversation(`${P}-owner`, `${P}-chat-24`)).toBe(
      false,
    );
  });
  it("no basta un HMAC válido sin registro de sesión", async () => {
    expect(
      await linkPatientConversation(
        `${P}-other`,
        `${P}-chat-24`,
        token(`${P}-missing`, `${P}-chat-24`),
      ),
    ).toBe(false);
  });
  it("rechaza sesiones registradas revocadas, vencidas o de otro chat", async () => {
    await db.insert(seekerSessions).values([
      {
        sid: `${P}-revoked`,
        conversationId: `${P}-chat-24`,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: new Date(),
      },
      {
        sid: `${P}-expired`,
        conversationId: `${P}-chat-24`,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() - 1),
      },
      {
        sid: `${P}-wrong-chat`,
        conversationId: `${P}-chat-23`,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    ]);
    for (const sid of ["revoked", "expired", "wrong-chat"])
      expect(
        await linkPatientConversation(
          `${P}-other`,
          `${P}-chat-24`,
          token(`${P}-${sid}`, `${P}-chat-24`),
        ),
      ).toBe(false);
  });
  it("una sesión vigente registrada vincula sin depender del sid original y no reasigna a otra cuenta", async () => {
    await db.insert(seekerSessions).values({
      sid: `${P}-valid`,
      conversationId: `${P}-chat-24`,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    const proof = token(`${P}-valid`, `${P}-chat-24`);
    expect(
      await linkPatientConversation(`${P}-other`, `${P}-chat-24`, proof),
    ).toBe(true);
    expect(
      await linkPatientConversation(`${P}-owner`, `${P}-chat-24`, proof),
    ).toBe(false);
  });
  it("lista chats y citas de forma paginada sin filtrar otras fichas", async () => {
    for (let i = 1; i < 24; i++)
      await linkPatientConversation(`${P}-owner`, `${P}-chat-${i}`);
    const first = await patientChats(`${P}-owner`),
      second = await patientChats(`${P}-owner`, "2");
    expect(first.total).toBe(24);
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(4);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(
      24,
    );
    const appts = await patientAppointments(`${P}-owner`, { upcoming: true });
    expect(appts.total).toBe(24);
    expect(appts.rows).toHaveLength(20);
    expect(appts.rows.some((r) => r.id === `${P}-appointment-24`)).toBe(false);
  });
  it("pagos de otro paciente no entran en el historial", async () => {
    const payments = await patientPayments(`${P}-owner`);
    expect(payments.rows).toHaveLength(1);
    expect(payments.rows[0].amountCents).toBe(2500);
  });
  it("valida país real y zona IANA sin modificar preferencias completadas al asegurar cuenta", async () => {
    expect(
      patientOnboardingSchema.safeParse({
        displayName: "Alias",
        country: "ZZ",
        timezone: "UTC",
        ageBand: "adult",
      }).success,
    ).toBe(false);
    expect(
      patientOnboardingSchema.safeParse({
        displayName: "Alias",
        country: "VE",
        timezone: "Zona/Inventada",
        ageBand: "adult",
      }).success,
    ).toBe(false);
    const original = await ensurePatientAccount({
      id: `${P}-owner`,
      name: "Nombre de sesión distinto",
    });
    expect(original.displayName).toBe("Alias ficticio");
    expect(original.country).toBe("VE");
  });
  it("no acepta una solicitud para una conversación o cita ajena", async () => {
    const preferred = new Date(Date.now() + 86400000 * 2)
      .toISOString()
      .slice(0, 16);
    await expect(
      createPatientSessionRequest(`${P}-owner`, {
        conversationId: `${P}-chat-24`,
        kind: "new",
        preferredLocal: preferred,
        timezone: "UTC",
      }),
    ).rejects.toThrow("acceso");
    await expect(
      createPatientSessionRequest(`${P}-owner`, {
        conversationId: `${P}-chat-0`,
        appointmentId: `${P}-appointment-24`,
        kind: "cancel",
        timezone: "UTC",
      }),
    ).rejects.toThrow("cambió");
  });
  it("solicitar un cambio no modifica una cita y repetir no duplica pendientes", async () => {
    const input = {
      conversationId: `${P}-chat-0`,
      appointmentId: `${P}-appointment-0`,
      kind: "cancel" as const,
      timezone: "UTC",
    };
    const id = await createPatientSessionRequest(`${P}-owner`, input);
    expect(id).toMatch(/^preq_/);
    expect(
      (
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, `${P}-appointment-0`),
        })
      )?.status,
    ).toBe("scheduled");
    await expect(
      createPatientSessionRequest(`${P}-owner`, input),
    ).rejects.toThrow("pendiente");
    expect(await withdrawPatientRequest(`${P}-other`, id)).toBe(false);
    expect(await withdrawPatientRequest(`${P}-owner`, id)).toBe(true);
    expect(await createPatientSessionRequest(`${P}-owner`, input)).toBeTruthy();
  });
  it("dos solicitudes simultáneas para la misma cita solo guardan una", async () => {
    const input = {
      conversationId: `${P}-chat-1`,
      appointmentId: `${P}-appointment-1`,
      kind: "cancel" as const,
      timezone: "UTC",
    };
    const results = await Promise.allSettled([
      createPatientSessionRequest(`${P}-owner`, input),
      createPatientSessionRequest(`${P}-owner`, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("bloquea vistas borradas y una cuenta con baja en curso", async () => {
    await db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, `${P}-chat-2`));
    expect(
      await hasPatientConversationAccess(`${P}-owner`, `${P}-chat-2`),
    ).toBe(false);
    await db
      .update(conversations)
      .set({ deletedAt: null })
      .where(eq(conversations.id, `${P}-chat-2`));
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, `${P}-owner`));
    expect(
      await hasPatientConversationAccess(`${P}-owner`, `${P}-chat-0`),
    ).toBe(false);
    await db
      .update(patientAccounts)
      .set({ deletionState: "active" })
      .where(eq(patientAccounts.userId, `${P}-owner`));
  });
  it("exporta JSON propio sin claves, sesiones o pagos ajenos", async () => {
    let json = "";
    for await (const part of patientExportChunks(`${P}-owner`)) json += part;
    const data = JSON.parse(json);
    expect(data.conversations).toHaveLength(24);
    expect(data.receipts).toHaveLength(1);
    expect(json).not.toContain(`${P}-receipt-other`);
    expect(json).not.toContain("valid");
    expect(data.appointments).toHaveLength(24);
  });
  it("la baja elimina datos de cuenta y revoca accesos sin destruir fichas compartidas", async () => {
    await db.batch(
      patientAccountDeleteStatements(`${P}-other`) as [
        ReturnType<typeof patientAccountDeleteStatements>[number],
        ...ReturnType<typeof patientAccountDeleteStatements>,
      ],
    );
    expect(
      await db.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, `${P}-other`),
      }),
    ).toBeUndefined();
    expect(
      (
        await db.query.seekerSessions.findFirst({
          where: eq(seekerSessions.sid, `${P}-valid`),
        })
      )?.revokedAt,
    ).toBeTruthy();
    expect(
      await db.query.practicePatients.findFirst({
        where: eq(practicePatients.id, `${P}-record-24`),
      }),
    ).toBeTruthy();
  });
});
