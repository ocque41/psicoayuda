import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { eq, like, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  googleCalendarConnections,
  googleCalendarEventLinks,
} from "@/db/calendar-schema";
import {
  auditLogs,
  session as authSessions,
  carePlans,
  conversations,
  patientAccounts,
  patientConversationLinks,
  practicePatients,
  practiceSettings,
  professionalMemberships,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  database: null as D1Database | null,
  session: vi.fn(),
  revokeCalendar: vi.fn(async () => undefined),
  retrieveSubscription: vi.fn(async (_reference: string) => ({
    status: "active",
  })),
  cancelSubscription: vi.fn(async (_reference: string) => ({
    status: "canceled",
  })),
  retrieveCheckout: vi.fn(async () => ({ status: "open" })),
  expireCheckout: vi.fn(async () => ({ status: "expired" })),
  purge: vi.fn(async (): Promise<string> => "purged"),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: mocks.database } }),
}));
vi.mock("@/lib/calendar/google", async (original) => ({
  ...(await original<typeof import("@/lib/calendar/google")>()),
  revokeCalendarTokens: mocks.revokeCalendar,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { signOut: vi.fn(async () => undefined) } },
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: vi.fn(async () => true),
  purgeConversationMessagesDetailed: mocks.purge,
}));
vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: mocks.retrieveSubscription,
      cancel: mocks.cancelSubscription,
    },
    checkout: {
      sessions: {
        retrieve: mocks.retrieveCheckout,
        expire: mocks.expireCheckout,
      },
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdminWaitlistEntry: vi.fn(async () => undefined),
  notifyWaitlistConfirmation: vi.fn(async () => undefined),
  conversationUrl: (id: string) => `https://nido.example.test/c/${id}`,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`fixture-redirect:${path}`);
  },
}));

const url = process.env.DATABASE_URL || "";
if (!url.startsWith("file:") || !url.includes("nido-tests-"))
  throw new Error("Requiere la BD temporal de test:isolated.");
const local = createClient({ url });
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wranglerRequire("miniflare") as {
  Miniflare: new (
    options: unknown,
  ) => {
    getD1Database(name: string): Promise<D1Database>;
    dispose(): Promise<void>;
  };
};
const runtime = new Miniflare({
  modules: true,
  script: "export default {fetch(){return new Response('fixture')}}",
  compatibilityDate: "2026-06-28",
  d1Databases: { DB: "fixture-no-profile-snapshot-d1" },
});
const P = "fixture-no-profile-snapshot";
const stamp = "2000-01-01T00:00:00.000Z";
const id = {
  user: `${P}-user`,
  session: `${P}-session`,
  outsider: `${P}-outsider`,
  outsiderPro: `${P}-outsider-pro`,
  room: `${P}-room`,
  calendar: `${P}-calendar`,
  event: `${P}-calendar-event`,
  plan: `${P}-plan`,
  patient: `${P}-patient`,
};
let database: typeof import("@/db").db;
const createdProfiles: string[] = [];

beforeAll(async () => {
  mocks.database = await runtime.getD1Database("DB");
  const schema = await local.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END",
    args: [],
  });
  for (const row of schema.rows)
    await mocks.database.prepare(String(row.sql)).run();
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await runtime.dispose();
  local.close();
});
async function cleanup() {
  await database.run(sql.raw("DROP TRIGGER IF EXISTS fixture_no_profile_fail"));
  for (const proId of createdProfiles.splice(0)) {
    await database
      .delete(professionalMemberships)
      .where(eq(professionalMemberships.professionalId, proId));
    await database
      .delete(practiceSettings)
      .where(eq(practiceSettings.professionalId, proId));
    await database.delete(professionals).where(eq(professionals.id, proId));
  }
  await database.delete(carePlans).where(eq(carePlans.id, id.plan));
  await database
    .delete(practicePatients)
    .where(eq(practicePatients.id, id.patient));
  await database
    .delete(patientConversationLinks)
    .where(eq(patientConversationLinks.userId, id.user));
  await database
    .delete(seekerSessions)
    .where(like(seekerSessions.sid, `${P}%`));
  await database.delete(conversations).where(eq(conversations.id, id.room));
  await database
    .delete(googleCalendarEventLinks)
    .where(eq(googleCalendarEventLinks.connectionId, id.calendar));
  await database
    .delete(googleCalendarConnections)
    .where(eq(googleCalendarConnections.userId, id.user));
  await database
    .delete(patientAccounts)
    .where(eq(patientAccounts.userId, id.user));
  await database.delete(auditLogs).where(eq(auditLogs.entityId, id.user));
  await database.delete(authSessions).where(like(authSessions.id, `${P}%`));
  await database
    .delete(professionals)
    .where(eq(professionals.id, id.outsiderPro));
  await database.delete(user).where(like(user.id, `${P}%`));
}
describe.each([
  "libSQL",
  "D1",
] as const)("unprofiled account on %s", (driver) => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv("NIDO_DB_TARGET", driver === "D1" ? "cloudflare" : "");
    vi.stubEnv("NIDO_CALENDAR_ENCRYPTION_KEY", "a1".repeat(32));
    vi.stubEnv("ADMIN_EMAILS", "");
    ({ db: database } = await import("@/db"));
    await cleanup();
    mocks.revokeCalendar.mockReset().mockResolvedValue(undefined);
    mocks.retrieveSubscription
      .mockReset()
      .mockResolvedValue({ status: "active" });
    mocks.cancelSubscription
      .mockReset()
      .mockResolvedValue({ status: "canceled" });
    mocks.retrieveCheckout.mockReset().mockResolvedValue({ status: "open" });
    mocks.expireCheckout.mockReset().mockResolvedValue({ status: "expired" });
    mocks.purge.mockClear();
    await database.insert(user).values([
      {
        id: id.user,
        name: "Persona ficticia sin perfil",
        email: `${id.user}@example.test`,
        emailVerified: true,
      },
      {
        id: id.outsider,
        name: "Otra persona ficticia",
        email: `${id.outsider}@example.test`,
      },
    ]);
    await ownerSession();
    // Existing opaque calendar reference is fictional DB state. This does not
    // claim that the UI permits initial calendar linking without onboarding.
    const { sealCalendarSecret } = await import("@/lib/calendar/crypto");
    await database.insert(googleCalendarConnections).values({
      id: id.calendar,
      userId: id.user,
      audience: "patient",
      tokenEnvelope: await sealCalendarSecret(
        JSON.stringify({
          accessToken: "fixture-access",
          refreshToken: "fixture-refresh",
          expiresAt: Date.now() + 3600000,
        }),
        "token",
        id.user,
        "patient",
        id.calendar,
      ),
      createdAt: stamp,
      updatedAt: stamp,
    });
    await database.insert(googleCalendarEventLinks).values({
      id: id.event,
      connectionId: id.calendar,
      eventId: "fixture-opaque-event",
      updatedAt: stamp,
    });
    expect(
      await database.query.professionals.findFirst({
        where: eq(professionals.userId, id.user),
      }),
    ).toBeUndefined();
    expect(
      await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
    ).toBeUndefined();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  async function ownerSession(suffix = "") {
    const sessionId = `${id.session}${suffix}`;
    await database.insert(authSessions).values({
      id: sessionId,
      userId: id.user,
      token: `${sessionId}-fake-token`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    mocks.session.mockResolvedValue({
      user: {
        id: id.user,
        email: `${id.user}@example.test`,
        emailVerified: true,
      },
      session: { id: sessionId, expiresAt: new Date(Date.now() + 3600000) },
    });
  }
  async function invokeSelf() {
    const { deleteMyAccount } = await import("@/app/actions-account");
    try {
      return await deleteMyAccount({ error: null }, new FormData());
    } catch (error) {
      if (String(error).includes("fixture-redirect:/entrar?cuenta=borrada"))
        return { success: true };
      throw error;
    }
  }
  async function createProfessional() {
    const { saveProfessionalOnboarding } = await import("@/app/actions");
    const form = new FormData();
    for (const [key, value] of Object.entries({
      expectedOwnerId: id.user,
      fullName: "Auxiliar ficticio",
      nonClinicalHelper: "on",
      emailPublic: "on",
      supportAreas: "orientacion_general",
      maxActiveRequests: "3",
      timezone: "America/Caracas",
      conductFreeService: "on",
      conductNoClientCapture: "on",
      conductConfidentiality: "on",
      conductNoEmergencyGuarantee: "on",
      conductCompetence: "on",
    }))
      form.set(key, value);
    await expect(saveProfessionalOnboarding(null, form)).rejects.toThrow(
      "fixture-redirect:/pro/dashboard",
    );
    const profile = await database.query.professionals.findFirst({
      where: eq(professionals.userId, id.user),
    });
    if (!profile) throw new Error("Fixture no creó perfil real");
    createdProfiles.push(profile.id);
    // Provider pointer is fictitious, not a membership onboarding assertion.
    await database.insert(professionalMemberships).values({
      professionalId: profile.id,
      stripeSubscriptionId: "sub_no_profile_new_professional",
      trialStartedAt: stamp,
      trialEndsAt: stamp,
      updatedAt: stamp,
    });
    return profile.id;
  }
  async function createPatient() {
    const { finishPatientOnboarding } = await import("@/app/empezar/actions");
    const form = new FormData();
    for (const [key, value] of Object.entries({
      expectedOwnerId: id.user,
      privacyAccepted: "on",
      ageBand: "adult",
      displayName: "Persona ficticia",
      country: "VE",
      timezone: "America/Caracas",
      preferredLanguage: "es",
    }))
      form.set(key, value);
    await expect(finishPatientOnboarding(null, form)).rejects.toThrow(
      "fixture-redirect:/mi",
    );
    await database.insert(professionals).values({
      id: id.outsiderPro,
      userId: id.outsider,
      email: `${id.outsider}@example.test`,
      fullName: "Otro profesional ficticio",
      languages: "[]",
      supportAreas: "[]",
      status: "approved",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await database.insert(conversations).values({
      id: id.room,
      professionalId: id.outsiderPro,
      seekerSid: `${P}-seeker`,
      seekerEmail: `${id.user}@example.test`,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await database.insert(seekerSessions).values({
      sid: `${P}-seeker`,
      conversationId: id.room,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    const { connectExistingChats } = await import("@/app/mi/actions");
    expect(await connectExistingChats(null, new FormData())).toMatchObject({
      ok: true,
    });
    await database.insert(practicePatients).values({
      id: id.patient,
      professionalId: id.outsiderPro,
      conversationId: id.room,
      name: "Persona ficticia",
      country: "VE",
      consentAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await database.insert(carePlans).values({
      id: id.plan,
      professionalId: id.outsiderPro,
      patientId: id.patient,
      title: "Plan ficticio",
      sessionsCount: 1,
      durationMinutes: 50,
      priceCents: 1000,
      currency: "usd",
      interval: "month",
      validityDays: 30,
      stripeSubscriptionId: "sub_no_profile_new_patient",
      createdAt: stamp,
    });
  }
  async function retained(kind: "professional" | "patient", proId?: string) {
    const state = {
      driver,
      user: !!(await database.query.user.findFirst({
        where: eq(user.id, id.user),
      })),
      session: !!(await database.query.session.findFirst({
        where: eq(authSessions.id, id.session),
      })),
      patient: await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
      professional: await database.query.professionals.findFirst({
        where: eq(professionals.userId, id.user),
      }),
      calendar: await database.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.id, id.calendar),
      }),
      membership: proId
        ? await database.query.professionalMemberships.findFirst({
            where: eq(professionalMemberships.professionalId, proId),
          })
        : undefined,
      link: await database.query.patientConversationLinks.findFirst({
        where: eq(patientConversationLinks.userId, id.user),
      }),
      cancels: mocks.cancelSubscription.mock.calls.map((args) => args[0]),
    };
    // Print only fictional opaque IDs/state; never token envelopes.
    console.info("no-profile-race-state", {
      driver,
      user: state.user,
      session: state.session,
      patient: !!state.patient,
      professional: !!state.professional,
      calendar: !!state.calendar,
      membership: !!state.membership,
      link: !!state.link,
      cancels: state.cancels,
    });
    expect(state.user).toBe(true);
    expect(state.session).toBe(true);
    expect(state.calendar).toMatchObject({ status: "disconnecting" });
    expect(
      await database.query.googleCalendarEventLinks.findFirst({
        where: eq(googleCalendarEventLinks.id, id.event),
      }),
    ).toBeDefined();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(
      await database
        .select()
        .from(auditLogs)
        .where(
          sql`${auditLogs.entityId}=${id.user} AND ${auditLogs.action}='account_unprofiled_deletion_completed'`,
        ),
    ).toEqual([]);
    if (kind === "professional") {
      expect(state.professional).toMatchObject({
        id: proId,
        userId: id.user,
        status: "pending_verification",
      });
      expect(state.membership).toMatchObject({
        stripeSubscriptionId: "sub_no_profile_new_professional",
      });
      expect(state.patient).toBeUndefined();
    } else {
      expect(state.patient).toMatchObject({
        deletionState: "active",
        country: "VE",
      });
      expect(state.patient?.onboardingCompletedAt).toBeTruthy();
      expect(state.link).toMatchObject({
        conversationId: id.room,
        userId: id.user,
      });
      expect(
        await database.query.carePlans.findFirst({
          where: eq(carePlans.id, id.plan),
        }),
      ).toMatchObject({ stripeSubscriptionId: "sub_no_profile_new_patient" });
      expect(
        (
          await database.query.seekerSessions.findFirst({
            where: eq(seekerSessions.sid, `${P}-seeker`),
          })
        )?.revokedAt,
      ).toBeNull();
    }
  }
  async function retry(kind: "professional" | "patient", proId?: string) {
    vi.restoreAllMocks();
    if (kind === "professional") {
      await database
        .delete(authSessions)
        .where(eq(authSessions.id, id.session));
      expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
      expect(mocks.cancelSubscription).not.toHaveBeenCalled();
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.userId, id.user),
        }),
      ).toMatchObject({ status: "pending_verification" });
    }
    await ownerSession("-retry");
    expect(await invokeSelf()).toEqual({ success: true });
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeUndefined();
    expect(
      await database.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.id, id.calendar),
      }),
    ).toBeUndefined();
    expect(
      await database.query.googleCalendarEventLinks.findFirst({
        where: eq(googleCalendarEventLinks.id, id.event),
      }),
    ).toBeUndefined();
    expect(mocks.cancelSubscription).toHaveBeenCalledExactlyOnceWith(
      kind === "professional"
        ? "sub_no_profile_new_professional"
        : "sub_no_profile_new_patient",
    );
    if (proId) {
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, proId),
        }),
      ).toBeUndefined();
      expect(
        await database.query.professionalMemberships.findFirst({
          where: eq(professionalMemberships.professionalId, proId),
        }),
      ).toBeUndefined();
    } else {
      expect(
        await database.query.patientAccounts.findFirst({
          where: eq(patientAccounts.userId, id.user),
        }),
      ).toBeUndefined();
      expect(
        await database.query.patientConversationLinks.findFirst({
          where: eq(patientConversationLinks.userId, id.user),
        }),
      ).toBeUndefined();
      // Provider agreement belongs to the other professional; it is cancelled,
      // not silently erased by this patient's account deletion.
      expect(
        await database.query.carePlans.findFirst({
          where: eq(carePlans.id, id.plan),
        }),
      ).toBeDefined();
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, id.outsiderPro),
        }),
      ).toBeDefined();
    }
  }
  it.each([
    "professional",
    "patient",
  ] as const)("rejects real %s onboarding completed during Calendar provider await and retries explicitly", async (kind) => {
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let resume!: () => void;
    const barrier = new Promise<void>((resolve) => {
      resume = resolve;
    });
    mocks.revokeCalendar.mockImplementationOnce(async () => {
      entered();
      await barrier;
    });
    const deleting = invokeSelf();
    await ready;
    let proId: string | undefined;
    try {
      if (kind === "professional") proId = await createProfessional();
      else await createPatient();
    } finally {
      resume();
    }
    const outcome = await deleting;
    console.info("no-profile-delete-outcome", { driver, kind, outcome });
    // Record state before assertions so legacy behavior is preserved as proof.
    await retained(kind, proId);
    expect(outcome).toMatchObject({ error: expect.any(String) });
    expect(mocks.revokeCalendar).toHaveBeenCalledTimes(1);
    await retry(kind, proId);
  }, 20000);
  it.each([
    "professional",
    "patient",
  ] as const)("checks %s absence in the actual final batch, not a preflight read", async (kind) => {
    const batch = database.batch.bind(database);
    let called = false;
    let proId: string | undefined;
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      if (
        !called &&
        queries.some((query) => {
          if (!("toSQL" in query)) return false;
          const text = (query as { toSQL(): { sql: string } }).toSQL().sql;
          return (
            text.includes("account_unprofiled_deletion_completed") ||
            text.startsWith('delete from "user"')
          );
        })
      ) {
        called = true;
        if (kind === "professional") proId = await createProfessional();
        else await createPatient();
      }
      return batch(queries);
    });
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called).toBe(true);
    await retained(kind, proId);
    expect(mocks.revokeCalendar).toHaveBeenCalledTimes(1);
    await retry(kind, proId);
  });
  it("an old unprofiled attempt cannot reactivate or erase a newer hybrid deletion lock", async () => {
    let readyCalendar!: () => void;
    const calendarEntered = new Promise<void>((resolve) => {
      readyCalendar = resolve;
    });
    let resumeCalendar!: () => void;
    const calendarBarrier = new Promise<void>((resolve) => {
      resumeCalendar = resolve;
    });
    mocks.revokeCalendar.mockImplementationOnce(async () => {
      readyCalendar();
      await calendarBarrier;
    });
    const older = invokeSelf();
    await calendarEntered;
    await createPatient();
    const proId = await createProfessional();
    await ownerSession("-hybrid");
    let readyPatient!: () => void;
    const patientEntered = new Promise<void>((resolve) => {
      readyPatient = resolve;
    });
    let failPatient!: (error: Error) => void;
    const patientBarrier = new Promise<{ status: string }>(
      (_resolve, reject) => {
        failPatient = reject;
      },
    );
    mocks.retrieveSubscription.mockImplementationOnce(async () => {
      readyPatient();
      return patientBarrier;
    });
    const newer = invokeSelf();
    await patientEntered;
    resumeCalendar();
    try {
      expect(await older).toMatchObject({ error: expect.any(String) });
      expect(
        await database.query.user.findFirst({ where: eq(user.id, id.user) }),
      ).toBeDefined();
      expect(
        await database.query.patientAccounts.findFirst({
          where: eq(patientAccounts.userId, id.user),
        }),
      ).toMatchObject({ deletionState: "deleting" });
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, proId),
        }),
      ).toMatchObject({ status: "deleting" });
      expect(
        await database.query.professionalMemberships.findFirst({
          where: eq(professionalMemberships.professionalId, proId),
        }),
      ).toMatchObject({
        stripeSubscriptionId: "sub_no_profile_new_professional",
      });
      expect(
        await database.query.patientConversationLinks.findFirst({
          where: eq(patientConversationLinks.userId, id.user),
        }),
      ).toBeDefined();
      expect(
        await database.query.googleCalendarEventLinks.findFirst({
          where: eq(googleCalendarEventLinks.id, id.event),
        }),
      ).toBeDefined();
      expect(
        (
          await database.query.seekerSessions.findFirst({
            where: eq(seekerSessions.sid, `${P}-seeker`),
          })
        )?.revokedAt,
      ).not.toBeNull();
      expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    } finally {
      failPatient(
        new Error("fixture partial provider failure under newer lock"),
      );
      expect(await newer).toMatchObject({ error: expect.any(String) });
    }
    await ownerSession("-hybrid-retry");
    expect(await invokeSelf()).toEqual({ success: true });
    expect(mocks.cancelSubscription).toHaveBeenCalledTimes(2);
    expect(mocks.cancelSubscription).toHaveBeenNthCalledWith(
      1,
      "sub_no_profile_new_patient",
    );
    expect(mocks.cancelSubscription).toHaveBeenNthCalledWith(
      2,
      "sub_no_profile_new_professional",
    );
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeUndefined();
    expect(
      await database.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, proId),
      }),
    ).toBeUndefined();
  }, 20000);
  it("deletes an unchanged unprofiled account and its calendar children atomically", async () => {
    expect(await invokeSelf()).toEqual({ success: true });
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeUndefined();
    expect(
      await database.query.session.findFirst({
        where: eq(authSessions.id, id.session),
      }),
    ).toBeUndefined();
    expect(
      await database.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.id, id.calendar),
      }),
    ).toBeUndefined();
    expect(
      await database.query.googleCalendarEventLinks.findFirst({
        where: eq(googleCalendarEventLinks.id, id.event),
      }),
    ).toBeUndefined();
    expect(
      await database
        .select()
        .from(auditLogs)
        .where(
          sql`${auditLogs.entityId}=${id.user} AND ${auditLogs.action}='account_unprofiled_deletion_completed'`,
        ),
    ).toHaveLength(1);
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.outsider) }),
    ).toBeDefined();
    expect(mocks.revokeCalendar).toHaveBeenCalledTimes(1);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });
  it("rolls back every final child deletion and marker if the last DELETE fails, then retries", async () => {
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_no_profile_fail BEFORE DELETE ON user WHEN OLD.id='${id.user}' BEGIN SELECT RAISE(ABORT,'fixture-final-rollback'); END`,
      ),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeDefined();
    expect(
      await database.query.session.findFirst({
        where: eq(authSessions.id, id.session),
      }),
    ).toBeDefined();
    expect(
      await database.query.googleCalendarConnections.findFirst({
        where: eq(googleCalendarConnections.id, id.calendar),
      }),
    ).toMatchObject({ status: "disconnecting" });
    expect(
      await database.query.googleCalendarEventLinks.findFirst({
        where: eq(googleCalendarEventLinks.id, id.event),
      }),
    ).toBeDefined();
    expect(
      await database
        .select()
        .from(auditLogs)
        .where(
          sql`${auditLogs.entityId}=${id.user} AND ${auditLogs.action}='account_unprofiled_deletion_completed'`,
        ),
    ).toEqual([]);
    expect(mocks.revokeCalendar).toHaveBeenCalledTimes(1);
    await database.run(sql.raw("DROP TRIGGER fixture_no_profile_fail"));
    expect(await invokeSelf()).toEqual({ success: true });
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeUndefined();
    expect(mocks.revokeCalendar).toHaveBeenCalledTimes(2);
  });
});
