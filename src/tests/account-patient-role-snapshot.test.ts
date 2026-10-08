// New independent causal cases; historical fixture remains unchanged.
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
  assignments,
  auditLogs,
  session as authSessions,
  carePlans,
  conversations,
  helpRequests,
  patientAccounts,
  patientConversationLinks,
  practicePatients,
  practiceSettings,
  professionalMemberships,
  professionals,
  seekerSessions,
  user,
  waitlistEntries,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  database: null as D1Database | null,
  session: vi.fn(),
  getCookie: vi.fn(),
  disconnect: vi.fn(async () => true),
  purge: vi.fn(async (): Promise<string> => "purged"),
  retrieveSubscription: vi.fn(async (_reference: string) => ({
    status: "active",
  })),
  cancelSubscription: vi.fn(async (_reference: string) => ({
    status: "canceled",
  })),
  retrieveCheckout: vi.fn(async () => ({ status: "open" })),
  expireCheckout: vi.fn(async () => ({ status: "expired" })),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: mocks.database } }),
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: mocks.disconnect,
  purgeConversationMessagesDetailed: mocks.purge,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { signOut: vi.fn(async () => undefined) } },
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
  cookies: async () => ({ get: mocks.getCookie, set: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdminWaitlistEntry: vi.fn(async () => undefined),
  notifyWaitlistConfirmation: vi.fn(async () => undefined),
  notifyConversationReopened: vi.fn(async () => undefined),
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
  d1Databases: { DB: "fixture-patient-role-snapshot-d1" },
});
const P = "fixture-patient-role-snapshot";
const timestamp = "2000-01-01T00:00:00.000Z";
const id = {
  admin: `${P}-admin`,
  user: `${P}-user`,
  pro: `${P}-pro`,
  request: `${P}-request`,
  otherRequest: `${P}-other-request`,
  assignment: `${P}-assignment`,
  otherAssignment: `${P}-other-assignment`,
  room: `${P}-room`,
  otherRoom: `${P}-other-room`,
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

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Fixture incompleta");
  return value;
}
async function cleanup() {
  await database.delete(carePlans).where(like(carePlans.id, `${P}%`));
  await database
    .delete(practicePatients)
    .where(like(practicePatients.id, `${P}%`));
  await database
    .delete(patientConversationLinks)
    .where(eq(patientConversationLinks.userId, id.user));
  await database.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await database
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.conversationId, id.room));
  await database
    .delete(professionalMemberships)
    .where(like(professionalMemberships.professionalId, `${P}%`));
  await database
    .delete(patientAccounts)
    .where(like(patientAccounts.userId, `${P}%`));
  await database.run(sql.raw("DROP TRIGGER IF EXISTS fixture_account_fail"));
  await database.delete(authSessions).where(like(authSessions.id, `${P}%`));
  await database.run(
    sql.raw("DROP TRIGGER IF EXISTS fixture_patient_final_fail"),
  );
  await database.run(
    sql.raw("DROP TRIGGER IF EXISTS fixture_patient_claim_fail"),
  );
  for (const proId of createdProfiles.splice(0)) {
    await database
      .delete(professionalMemberships)
      .where(eq(professionalMemberships.professionalId, proId));
    await database
      .delete(practiceSettings)
      .where(eq(practiceSettings.professionalId, proId));
    await database.delete(professionals).where(eq(professionals.id, proId));
  }
  await database
    .delete(seekerSessions)
    .where(like(seekerSessions.sid, `${P}%`));
  for (const table of [
    conversations,
    assignments,
    helpRequests,
    auditLogs,
    professionals,
    user,
  ]) {
    await database.delete(table).where(like(table.id, `${P}%`));
  }
}

describe.each(["libSQL", "D1"] as const)("liberación real con %s", (driver) => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv("NIDO_DB_TARGET", driver === "D1" ? "cloudflare" : "");
    vi.stubEnv("ADMIN_EMAILS", `${id.admin}@example.test`);
    ({ db: database } = await import("@/db"));

    await cleanup();
    mocks.disconnect.mockClear();
    mocks.purge.mockReset().mockResolvedValue("purged");
    mocks.retrieveSubscription
      .mockReset()
      .mockResolvedValue({ status: "active" });
    mocks.cancelSubscription
      .mockReset()
      .mockResolvedValue({ status: "canceled" });
    mocks.retrieveCheckout.mockReset().mockResolvedValue({ status: "open" });
    mocks.expireCheckout.mockReset().mockResolvedValue({ status: "expired" });
    mocks.session.mockResolvedValue({
      user: { id: id.admin, email: `${id.admin}@example.test` },
      session: {
        id: `${P}-admin-session`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await database.insert(user).values([
      {
        id: id.user,
        name: "Profesional ficticio",
        email: `${id.user}@example.test`,
      },
      {
        id: id.admin,
        name: "Admin ficticio",
        email: `${id.admin}@example.test`,
        emailVerified: true,
      },
    ]);
    await database.insert(authSessions).values({
      id: `${P}-admin-session`,
      userId: id.admin,
      token: `${P}-fake-admin-token`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await database.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.user}@example.test`,
      fullName: "Profesional ficticio",
      languages: "[]",
      supportAreas: "[]",
      status: "approved",
      currentActiveRequests: 2,
      cryptoPublicKey: "fixture-public-key",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.insert(helpRequests).values(
      [id.request, id.otherRequest].map((request) => ({
        id: request,
        email: `${request}@example.test`,
        needCategory: "orientacion_general",
        urgency: "baja",
        status: "assigned",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await database.insert(assignments).values([
      {
        id: id.assignment,
        helpRequestId: id.request,
        professionalId: id.pro,
        status: "assigned",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: id.otherAssignment,
        helpRequestId: id.otherRequest,
        professionalId: id.pro,
        status: "assigned",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    await database.insert(conversations).values([
      {
        id: id.room,
        helpRequestId: id.request,
        professionalId: id.pro,
        seekerSid: `${P}-browser-a`,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: id.otherRoom,
        helpRequestId: id.otherRequest,
        professionalId: id.pro,
        seekerSid: `${P}-other`,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    await database.insert(seekerSessions).values([
      ...["browser-a", "browser-b", "link"].map((suffix) => ({
        sid: `${P}-${suffix}`,
        conversationId: id.room,
        role: suffix === "link" ? "access-link" : "seeker",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      })),
      {
        sid: `${P}-other`,
        conversationId: id.otherRoom,
        role: "seeker",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    ]);
    await database.insert(user).values({
      id: `${P}-outsider-user`,
      name: "Otra persona ficticia",
      email: `${P}-outsider@example.test`,
    });
    await database.insert(professionals).values({
      id: `${P}-outsider-pro`,
      userId: `${P}-outsider-user`,
      email: `${P}-outsider@example.test`,
      fullName: "Otro profesional ficticio",
      languages: "[]",
      supportAreas: "[]",
      status: "approved",
      currentActiveRequests: 1,
      cryptoPublicKey: "fixture-other-public-key",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.insert(conversations).values({
      id: `${P}-outsider-room`,
      professionalId: `${P}-outsider-pro`,
      seekerSid: `${P}-outsider-browser`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.insert(seekerSessions).values({
      sid: `${P}-outsider-browser`,
      conversationId: `${P}-outsider-room`,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });
  });

  async function ownerSession(suffix = "") {
    const sessionId = `${P}-owner-session${suffix}`;
    await database.insert(authSessions).values({
      id: sessionId,
      userId: id.user,
      token: `${sessionId}-token`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    mocks.session.mockResolvedValue({
      user: {
        id: id.user,
        email: `${id.user}@example.test`,
        emailVerified: false,
      },
      session: { id: sessionId, expiresAt: new Date(Date.now() + 3600000) },
    });
    const { mintSeekerToken, SEEKER_COOKIE } = await import(
      "@/lib/seeker-token"
    );
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    const now = Date.now();
    mocks.getCookie.mockImplementation((name: string) =>
      name === SEEKER_COOKIE
        ? {
            value: mintSeekerToken(
              {
                sid: `${P}-browser-a`,
                conversationId: id.room,
                role: "seeker",
                iat: now,
                exp: now + 3600000,
              },
              "test-secret",
            ),
          }
        : undefined,
    );
    return sessionId;
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

  async function purePatient(withProvider = false) {
    await ownerSession();
    await database
      .delete(assignments)
      .where(eq(assignments.professionalId, id.pro));
    await database
      .update(conversations)
      .set({ professionalId: `${P}-outsider-pro` })
      .where(eq(conversations.professionalId, id.pro));
    await database.delete(professionals).where(eq(professionals.id, id.pro));
    await database.insert(patientAccounts).values({
      userId: id.user,
      displayName: "Cuenta ficticia",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.insert(patientConversationLinks).values({
      userId: id.user,
      conversationId: id.room,
      verifiedBy: "seeker",
      verifiedAt: timestamp,
    });
    if (withProvider) {
      await database.insert(practicePatients).values({
        id: `${P}-patient`,
        professionalId: `${P}-outsider-pro`,
        conversationId: id.room,
        name: "Ficticio",
        country: "VE",
        consentAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await database.insert(carePlans).values({
        id: `${P}-plan`,
        professionalId: `${P}-outsider-pro`,
        patientId: `${P}-patient`,
        title: "Plan ficticio",
        sessionsCount: 1,
        durationMinutes: 50,
        priceCents: 1000,
        currency: "usd",
        interval: "month",
        validityDays: 30,
        stripeSubscriptionId: "sub_patient_fixture",
        createdAt: timestamp,
      });
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
    const created = required(
      await database.query.professionals.findFirst({
        where: eq(professionals.userId, id.user),
      }),
    );
    createdProfiles.push(created.id);
    // Financial pointer is a fictional DB state, not a billing onboarding proof.
    await database.insert(professionalMemberships).values({
      professionalId: created.id,
      stripeSubscriptionId: "sub_new_professional_fixture",
      trialStartedAt: timestamp,
      trialEndsAt: timestamp,
      updatedAt: timestamp,
    });
    return created;
  }
  async function retained(proId?: string) {
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeDefined();
    expect(
      await database.query.session.findFirst({
        where: eq(authSessions.id, `${P}-owner-session`),
      }),
    ).toBeDefined();
    expect(
      await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
    ).toMatchObject({ deletionState: "deleting" });
    expect(
      await database.query.patientConversationLinks.findFirst({
        where: eq(patientConversationLinks.userId, id.user),
      }),
    ).toBeDefined();
    expect(
      (
        await database.query.seekerSessions.findFirst({
          where: eq(seekerSessions.sid, `${P}-browser-a`),
        })
      )?.revokedAt,
    ).not.toBeNull();
    expect(
      await database
        .select()
        .from(auditLogs)
        .where(
          sql`${auditLogs.entityId}=${id.user} AND ${auditLogs.action}='account_patient_deletion_completed'`,
        ),
    ).toEqual([]);
    if (proId) {
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, proId),
        }),
      ).toMatchObject({ userId: id.user, status: "pending_verification" });
      expect(
        await database.query.professionalMemberships.findFirst({
          where: eq(professionalMemberships.professionalId, proId),
        }),
      ).toMatchObject({ stripeSubscriptionId: "sub_new_professional_fixture" });
    }
  }
  function beforeBatch(action: string, callback: () => Promise<void>) {
    const batching = database.batch.bind(database);
    let called = false;
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      if (
        !called &&
        queries.some(
          (query) =>
            "toSQL" in query &&
            (query as { toSQL(): { sql: string } })
              .toSQL()
              .sql.includes(action),
        )
      ) {
        called = true;
        await callback();
      }
      return batching(queries);
    });
    return () => called;
  }
  async function retry(proId?: string, priorCancels = 0) {
    vi.restoreAllMocks();
    await ownerSession("-fresh");
    mocks.retrieveSubscription.mockImplementation(async (ref) => ({
      status: ref === "sub_patient_fixture" ? "canceled" : "active",
    }));
    expect(await invokeSelf()).toEqual({ success: true });
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeUndefined();
    expect(
      await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
    ).toBeUndefined();
    if (proId) {
      expect(mocks.cancelSubscription).toHaveBeenCalledTimes(priorCancels + 1);
      expect(mocks.cancelSubscription).toHaveBeenNthCalledWith(
        priorCancels + 1,
        "sub_new_professional_fixture",
      );
      expect(
        await database.query.professionalMemberships.findFirst({
          where: eq(professionalMemberships.professionalId, proId),
        }),
      ).toBeUndefined();
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, proId),
        }),
      ).toBeUndefined();
    }
  }
  it("rejects role added by real onboarding during patient provider await; conserves pointers/deleting and fresh retry purges new role", async () => {
    await purePatient(true);
    let enter!: () => void;
    const entered = new Promise<void>((yes) => {
      enter = yes;
    });
    let resume!: (x: { status: string }) => void;
    const provider = new Promise<{ status: string }>((yes) => {
      resume = yes;
    });
    mocks.retrieveSubscription.mockImplementationOnce(async () => {
      enter();
      return provider;
    });
    const deleting = invokeSelf();
    await entered;
    let created: Awaited<ReturnType<typeof createProfessional>>;
    try {
      created = await createProfessional();
    } finally {
      resume({ status: "canceled" });
    }
    expect(await deleting).toMatchObject({ error: expect.any(String) });
    await retained(created.id);
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
    // Resuming with the appeared professional uses the normal live-SID guard,
    // not the prior patient marker as authorization.
    await database
      .delete(authSessions)
      .where(eq(authSessions.id, `${P}-owner-session`));
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(
      await database.query.professionals.findFirst({
        where: eq(professionals.id, created.id),
      }),
    ).toMatchObject({ status: "pending_verification" });
    expect(
      await database.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, created.id),
      }),
    ).toBeDefined();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    await retry(created.id);
  }, 20000);
  it("role appearing immediately before actual final batch rejects every delete and completion audit; new intentional retry succeeds", async () => {
    await purePatient();
    let created: Awaited<ReturnType<typeof createProfessional>> | undefined;
    const called = beforeBatch(
      "account_patient_deletion_completed",
      async () => {
        created = await createProfessional();
      },
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called()).toBe(true);
    const pro = required(created);
    await retained(pro.id);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    await retry(pro.id);
  });
  it("last-statement failure rolls back all final child deletes and completion marker; patient-only deleting retry remains functional", async () => {
    await purePatient();
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_patient_final_fail BEFORE DELETE ON user WHEN OLD.id='${id.user}' BEGIN SELECT RAISE(ABORT,'fixture-final-rollback'); END`,
      ),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    await retained();
    expect(
      await database.query.professionals.findFirst({
        where: eq(professionals.userId, id.user),
      }),
    ).toBeUndefined();
    await database.run(sql.raw("DROP TRIGGER fixture_patient_final_fail"));
    await retry();
  });
  it("a superseded patient reservation rejects final deletes and preserves the newer deleting version", async () => {
    await purePatient();
    let newerVersion = "";
    const actualBatch = database.batch.bind(database);
    const called = beforeBatch(
      "account_patient_deletion_completed",
      async () => {
        // The second attempt really claims the scope in SQL. Simulate a lost
        // acknowledgement after its commit; its durable marker/version remain.
        let secondClaimed = false;
        vi.spyOn(database, "batch").mockImplementationOnce(async (queries) => {
          await actualBatch(queries);
          secondClaimed = true;
          throw new Error("fixture lost acknowledgement after patient claim");
        });
        expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
        expect(secondClaimed).toBe(true);
        const row = required(
          await database.query.patientAccounts.findFirst({
            where: eq(patientAccounts.userId, id.user),
          }),
        );
        newerVersion = row.updatedAt;
        expect(
          await database
            .select()
            .from(auditLogs)
            .where(
              sql`${auditLogs.entityId}=${id.user} AND ${auditLogs.action}='account_patient_deletion_started' AND ${auditLogs.createdAt}=${newerVersion}`,
            ),
        ).toHaveLength(1);
      },
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called()).toBe(true);
    await retained();
    expect(
      await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
    ).toMatchObject({ deletionState: "deleting", updatedAt: newerVersion });
    await retry();
  });
  it("a prior partial provider cancellation remains deleting when a role appears before the next attempt's preparation", async () => {
    await purePatient(true);
    await database
      .update(carePlans)
      .set({ checkoutId: "cs_patient_fixture" })
      .where(eq(carePlans.id, `${P}-plan`));
    mocks.cancelSubscription.mockImplementation(async (reference) => {
      if (reference === "sub_patient_fixture")
        mocks.retrieveSubscription.mockResolvedValue({ status: "canceled" });
      return { status: "canceled" };
    });
    mocks.expireCheckout.mockRejectedValueOnce(
      new Error("fixture checkout failure after cancellation"),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    await retained();
    expect(mocks.cancelSubscription).toHaveBeenCalledExactlyOnceWith(
      "sub_patient_fixture",
    );
    const batching = database.batch.bind(database);
    let called = false;
    let created: Awaited<ReturnType<typeof createProfessional>> | undefined;
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      const results = await batching(queries);
      if (
        !called &&
        queries.some(
          (query) =>
            "toSQL" in query &&
            (query as { toSQL(): { sql: string } })
              .toSQL()
              .sql.includes("account_patient_deletion_started"),
        )
      ) {
        called = true;
        created = await createProfessional();
      }
      return results;
    });
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called).toBe(true);
    const profile = required(created);
    await retained(profile.id);
    expect(
      await database.query.carePlans.findFirst({
        where: eq(carePlans.id, `${P}-plan`),
      }),
    ).toMatchObject({
      stripeSubscriptionId: "sub_patient_fixture",
      checkoutId: "cs_patient_fixture",
    });
    expect(mocks.cancelSubscription).toHaveBeenCalledTimes(1);
    await retry(profile.id, 1);
    expect(mocks.expireCheckout).toHaveBeenCalledTimes(2);
  });
  it("an older active-patient attempt cannot reactivate the lock adopted by a fresh professional attempt", async () => {
    await purePatient(true);
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    let fail!: (reason: Error) => void;
    const provider = new Promise<{ status: string }>((_resolve, reject) => {
      fail = reject;
    });
    mocks.retrieveSubscription.mockImplementationOnce(async () => {
      enter();
      return provider;
    });
    const batching = database.batch.bind(database);
    let called = false;
    let created: Awaited<ReturnType<typeof createProfessional>> | undefined;
    let second: ReturnType<typeof invokeSelf> | undefined;
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      const result = await batching(queries);
      if (
        !called &&
        queries.some(
          (query) =>
            "toSQL" in query &&
            (query as { toSQL(): { sql: string } })
              .toSQL()
              .sql.includes("account_patient_deletion_started"),
        )
      ) {
        called = true;
        created = await createProfessional();
        await ownerSession("-handoff");
        second = invokeSelf();
        await entered;
      }
      return result;
    });
    try {
      expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
      expect(called).toBe(true);
      const profile = required(created);
      expect(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, profile.id),
        }),
      ).toMatchObject({ status: "deleting" });
      expect(
        await database.query.patientAccounts.findFirst({
          where: eq(patientAccounts.userId, id.user),
        }),
      ).toMatchObject({ deletionState: "deleting" });
      expect(
        await database.query.professionalMemberships.findFirst({
          where: eq(professionalMemberships.professionalId, profile.id),
        }),
      ).toBeDefined();
      expect(
        await database.query.user.findFirst({ where: eq(user.id, id.user) }),
      ).toBeDefined();
      expect(mocks.cancelSubscription).not.toHaveBeenCalled();
      expect(mocks.purge).not.toHaveBeenCalled();
    } finally {
      fail(new Error("fixture provider remains unavailable after handoff"));
      expect(await required(second)).toMatchObject({
        error: expect.any(String),
      });
    }
    await retry(required(created).id);
  });
  it("early grant failure rolls back patient state/version and start marker before all providers", async () => {
    await purePatient(true);
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_patient_claim_fail BEFORE UPDATE OF revoked_at ON seeker_sessions WHEN NEW.sid='${P}-browser-a' BEGIN SELECT RAISE(ABORT,'fixture-claim-rollback'); END`,
      ),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(
      await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
    ).toMatchObject({ deletionState: "active", updatedAt: timestamp });
    expect(
      (
        await database.query.seekerSessions.findFirst({
          where: eq(seekerSessions.sid, `${P}-browser-a`),
        })
      )?.revokedAt,
    ).toBeNull();
    expect(
      await database
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, id.user)),
    ).toEqual([]);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeDefined();
  });
});
