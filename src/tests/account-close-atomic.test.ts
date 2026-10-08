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
  conversations,
  helpRequests,
  patientAccounts,
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
  retrieveSubscription: vi.fn(async () => ({ status: "active" })),
  cancelSubscription: vi.fn(async () => ({ status: "canceled" })),
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
  d1Databases: { DB: "caller-close-fixture" },
});
const P = "fixture-account-close";
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
async function snapshot() {
  return {
    outsider: await database.query.professionals.findFirst({
      where: eq(professionals.id, `${P}-outsider-pro`),
    }),
    audits: await database
      .select()
      .from(auditLogs)
      .where(
        sql`${auditLogs.entityId} IN (${id.request},${id.otherRequest},${id.pro})`,
      ),
    requests: await database
      .select()
      .from(helpRequests)
      .where(like(helpRequests.id, `${P}%`)),
    relations: await database
      .select()
      .from(assignments)
      .where(like(assignments.id, `${P}%`)),
    pro: await database.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    }),
    rooms: await database
      .select()
      .from(conversations)
      .where(like(conversations.id, `${P}%`)),
    sessions: await database
      .select()
      .from(seekerSessions)
      .where(like(seekerSessions.sid, `${P}%`)),
  };
}
async function failQuota() {
  await database.run(
    sql.raw(
      `CREATE TRIGGER fixture_release_fail BEFORE UPDATE OF current_active_requests ON professionals WHEN NEW.id='${id.pro}' BEGIN SELECT RAISE(ABORT,'fixture-quota-failure'); END`,
    ),
  );
}
async function allowQuota() {
  await database.run(sql.raw("DROP TRIGGER IF EXISTS fixture_release_fail"));
}
async function cleanup() {
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
  await allowQuota();
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
  async function join() {
    const { joinWaitlistFromChat } = await import(
      "@/app/c/[conversationId]/actions"
    );
    const data = new FormData();
    data.set("conversationId", id.room);
    data.set("email", "ficticio-baja@example.test");
    data.set("generalReason", "1");
    data.set("asPersona", "1");
    return joinWaitlistFromChat(null, data);
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
  async function invokeAdmin() {
    const { adminDeleteAccount } = await import("@/app/actions-account");
    const form = new FormData();
    form.set("userId", id.user);
    try {
      await adminDeleteAccount(form);
      return { success: false };
    } catch (error) {
      if (String(error).includes("fixture-redirect:/admin?cuenta=borrada"))
        return { success: true };
      throw error;
    }
  }
  function onBatch(
    phase: "start" | "close" | "final",
    callback: () => Promise<void>,
  ) {
    const action = {
      start: "account_deletion_started",
      close: "account_assignments_closed",
      final: "account_deletion_completed",
    }[phase];
    const batch = database.batch.bind(database);
    let called = false;
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      if (
        !called &&
        queries.some((query) => {
          if (!("toSQL" in query)) return false;
          const q = (
            query as { toSQL(): { sql: string; params: unknown[] } }
          ).toSQL();
          return q.sql.includes(action) || q.params.includes(action);
        })
      ) {
        called = true;
        await callback();
      }
      return batch(queries);
    });
    return () => called;
  }
  async function assertLocked() {
    const s = await snapshot();
    expect(s.pro).toMatchObject({
      status: "deleting",
      cryptoPublicKey: "fixture-public-key",
    });
    expect(
      s.sessions
        .filter((row) => [id.room, id.otherRoom].includes(row.conversationId))
        .every((row) => row.revokedAt !== null),
    ).toBe(true);
    expect(
      s.sessions.find((row) => row.sid === `${P}-outsider-browser`)?.revokedAt,
    ).toBeNull();
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeDefined();
    if (driver === "D1") {
      const { currentConnectionGate } = await import("@/server/auth-gate");
      const env = {
        DB: required(mocks.database),
        BETTER_AUTH_SECRET: "test-secret",
        BETTER_AUTH_URL: "https://nido.example.test",
      };
      const seeker = await currentConnectionGate(
        env,
        "seeker",
        `${P}-browser-a`,
        id.room,
        Date.now(),
      );
      expect(seeker.allowed).toBe(false);
      expect(seeker.allowed && seeker.canSend).toBe(false);
      const pro = await currentConnectionGate(
        env,
        "professional",
        id.pro,
        id.room,
        Date.now(),
        `${P}-owner-session`,
        id.user,
      );
      expect(pro).toEqual({ allowed: false, canSend: false });
      const { makeOnBeforeConnect } = await import("@/server/auth-gate");
      const { mintSeekerToken, SEEKER_COOKIE } = await import(
        "@/lib/seeker-token"
      );
      const now = Date.now();
      const token = mintSeekerToken(
        {
          sid: `${P}-browser-a`,
          conversationId: id.room,
          role: "seeker",
          iat: now,
          exp: now + 3600000,
        },
        "test-secret",
      );
      const denied = await makeOnBeforeConnect(env)(
        new Request("https://nido.example.test/parties/conversation/fixture", {
          headers: {
            Origin: "https://nido.example.test",
            Cookie: `${SEEKER_COOKIE}=${token}`,
            Upgrade: "websocket",
          },
        }),
        { party: "conversation", name: id.room },
      );
      expect(denied).toBeInstanceOf(Response);
      expect((denied as Response).status).toBe(403);
    }
    return s;
  }
  async function retry() {
    vi.restoreAllMocks();
    expect(await invokeSelf()).toEqual({ success: true });
  }
  async function membership() {
    await database.insert(professionalMemberships).values({
      professionalId: id.pro,
      stripeSubscriptionId: "sub_ficticio",
      checkoutId: "cs_ficticio",
      trialStartedAt: timestamp,
      trialEndsAt: timestamp,
      updatedAt: timestamp,
    });
  }
  it("admits real metadata before locking, then purges with self unverified SID and preserves outsider", async () => {
    await ownerSession();
    const before = await snapshot();
    const called = onBatch("start", async () => {
      expect(await join()).toMatchObject({ ok: true });
    });
    expect(await invokeSelf()).toEqual({ success: true });
    expect(called()).toBe(true);
    const after = await snapshot();
    expect(after.pro).toBeUndefined();
    expect(after.outsider).toEqual(before.outsider);
    expect(
      after.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    ).toEqual(
      before.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    );
    expect(after.requests.every((row) => row.status === "new")).toBe(true);
    expect(mocks.purge).toHaveBeenCalledTimes(2);
    expect(
      await database.query.session.findFirst({
        where: eq(authSessions.id, `${P}-owner-session`),
      }),
    ).toBeUndefined();
  });
  it("denies the real late seeker mutation after lock and still completes", async () => {
    await ownerSession();
    const called = onBatch("close", async () => {
      await assertLocked();
      expect(await join()).toMatchObject({ ok: false });
    });
    expect(await invokeSelf()).toEqual({ success: true });
    expect(called()).toBe(true);
  });
  it.each([
    "metadata",
    "reowned",
    "generation",
    "assignment",
    "request",
  ] as const)("rejects stale %s closure with no partial release; retains lock and retry", async (change) => {
    await ownerSession();
    const called = onBatch("close", async () => {
      if (change === "metadata")
        await database
          .update(conversations)
          .set({
            updatedAt: new Date().toISOString(),
            seekerEmail: "ficticio-tardio@example.test",
          })
          .where(eq(conversations.id, id.room));
      if (change === "reowned")
        await database
          .update(conversations)
          .set({ professionalId: `${P}-outsider-pro` })
          .where(eq(conversations.id, id.room));
      if (change === "generation")
        await database.insert(auditLogs).values({
          id: `${P}-generation`,
          action: "conversation_reopened",
          entityType: "conversation",
          entityId: id.room,
          createdAt: timestamp,
        });
      if (change === "assignment")
        await database
          .update(assignments)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(assignments.id, id.assignment));
      if (change === "request")
        await database
          .update(helpRequests)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(helpRequests.id, id.request));
    });
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called()).toBe(true);
    const state = await assertLocked();
    expect(state.pro?.currentActiveRequests).toBe(2);
    expect(state.relations.every((row) => row.status === "assigned")).toBe(
      true,
    );
    expect(state.requests.every((row) => row.status === "assigned")).toBe(true);
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
    if (change === "reowned") {
      expect(state.rooms.find((row) => row.id === id.room)?.status).toBe(
        "open",
      );
      vi.restoreAllMocks();
      await database
        .update(conversations)
        .set({ professionalId: id.pro })
        .where(eq(conversations.id, id.room));
    }
    await retry();
  });
  it.each([
    "grant",
    "audit",
  ] as const)("rolls back the initial %s failure before providers", async (kind) => {
    await ownerSession();
    const before = await snapshot();
    await database.run(
      sql.raw(
        kind === "grant"
          ? "CREATE TRIGGER fixture_account_fail BEFORE UPDATE ON seeker_sessions BEGIN SELECT RAISE(ABORT,'fixture-lock-grant'); END"
          : "CREATE TRIGGER fixture_account_fail BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture-lock-audit'); END",
      ),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(await snapshot()).toEqual(before);
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    await database.run(sql.raw("DROP TRIGGER fixture_account_fail"));
    await retry();
  });
  it("rolls back closure quota/relations/audit but retains earlier deleting and revocation", async () => {
    await ownerSession();
    await failQuota();
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    const state = await assertLocked();
    expect(state.pro?.currentActiveRequests).toBe(2);
    expect(state.relations.every((row) => row.status === "assigned")).toBe(
      true,
    );
    expect(state.rooms.find((row) => row.id === id.room)?.status).toBe("open");
    expect(mocks.purge).not.toHaveBeenCalled();
    await allowQuota();
    await retry();
  });
  it.each([
    "SID deleted",
    "SID expired",
    "email changed",
    "owner changed",
  ] as const)("rejects initial %s before any lock", async (change) => {
    const sid = await ownerSession();
    const called = onBatch("start", async () => {
      if (change === "SID deleted")
        await database.delete(authSessions).where(eq(authSessions.id, sid));
      if (change === "SID expired")
        await database
          .update(authSessions)
          .set({ expiresAt: new Date(0) })
          .where(eq(authSessions.id, sid));
      if (change === "email changed")
        await database
          .update(user)
          .set({ email: "otro-ficticio@example.test" })
          .where(eq(user.id, id.user));
      if (change === "owner changed")
        await database
          .update(professionals)
          .set({ userId: `${P}-outsider-user` })
          .where(eq(professionals.id, id.pro));
    });
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called()).toBe(true);
    const state = await snapshot();
    expect(state.pro?.status).toBe("approved");
    expect(state.relations.every((row) => row.status === "assigned")).toBe(
      true,
    );
    expect(
      state.sessions.find((row) => row.sid === `${P}-browser-a`)?.revokedAt,
    ).toBeNull();
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it.each([
    "start",
    "close",
    "final",
  ] as const)("fresh admin authority and protected target at %s", async (phase) => {
    const called = onBatch(phase, async () => {
      await database
        .update(user)
        .set({ email: `${id.admin}-target@example.test` })
        .where(eq(user.id, id.user));
      vi.stubEnv(
        "ADMIN_EMAILS",
        `${id.admin}@example.test,${id.admin}-target@example.test`,
      );
    });
    await expect(invokeAdmin()).rejects.toThrow();
    expect(called()).toBe(true);
    const state = await snapshot();
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeDefined();
    expect(state.pro?.status).toBe(phase === "start" ? "approved" : "deleting");
  });
  it("allows self deletion of an admin account without adding the admin target protection", async () => {
    await ownerSession();
    vi.stubEnv("ADMIN_EMAILS", `${id.user}@example.test`);
    expect(await invokeSelf()).toEqual({ success: true });
  });
  it("admin can delete a nonadmin with fresh verified SID", async () => {
    expect(await invokeAdmin()).toEqual({ success: true });
  });
  it.each([
    "SID",
    "verified",
    "scope",
  ] as const)("denies stale admin %s before lock", async (change) => {
    onBatch("start", async () => {
      if (change === "SID")
        await database
          .delete(authSessions)
          .where(eq(authSessions.id, `${P}-admin-session`));
      if (change === "verified")
        await database
          .update(user)
          .set({ emailVerified: false })
          .where(eq(user.id, id.admin));
      if (change === "scope")
        await database
          .update(user)
          .set({ email: "staff-ficticio@example.test" })
          .where(eq(user.id, id.admin));
    });
    await expect(invokeAdmin()).rejects.toThrow();
    expect((await snapshot()).pro?.status).toBe("approved");
  });
  it("retains provider pointers and deleting after a partial cancellation; retry uses provider state", async () => {
    await ownerSession();
    await membership();
    mocks.retrieveSubscription.mockResolvedValue({ status: "active" });
    mocks.cancelSubscription.mockImplementation(async () => {
      mocks.retrieveSubscription.mockResolvedValue({ status: "canceled" });
      return { status: "canceled" };
    });
    mocks.expireCheckout.mockRejectedValueOnce(
      new Error("fixture checkout unavailable"),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    await assertLocked();
    expect(
      await database.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, id.pro),
      }),
    ).toMatchObject({
      stripeSubscriptionId: "sub_ficticio",
      checkoutId: "cs_ficticio",
    });
    expect(mocks.purge).not.toHaveBeenCalled();
    await retry();
    expect(mocks.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.expireCheckout).toHaveBeenCalledTimes(2);
  });
  it.each([
    "failed",
    "throw",
  ] as const)("retains every room and session after DO %s, hybrid retry works", async (failure) => {
    await ownerSession();
    await database.insert(patientAccounts).values({
      userId: id.user,
      displayName: "Alias ficticio",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (failure === "failed") mocks.purge.mockResolvedValueOnce("failed");
    else mocks.purge.mockRejectedValueOnce(new Error("fixture DO failed"));
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    const state = await assertLocked();
    expect(state.pro?.currentActiveRequests).toBe(0);
    expect(
      state.rooms.filter((row) => row.professionalId === id.pro),
    ).toHaveLength(2);
    expect(
      await database.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, id.user),
      }),
    ).toMatchObject({ deletionState: "deleting" });
    expect(
      await database.query.session.findFirst({
        where: eq(authSessions.id, `${P}-owner-session`),
      }),
    ).toBeDefined();
    await retry();
  });
  it.each([
    "SID",
    "owner",
    "room owner",
    "generation",
    "new room",
    "new grant",
  ] as const)("final purge refuses changed %s after DO with all references retained", async (change) => {
    const sid = await ownerSession();
    await membership();
    const called = onBatch("final", async () => {
      if (change === "SID")
        await database.delete(authSessions).where(eq(authSessions.id, sid));
      if (change === "owner")
        await database
          .update(professionals)
          .set({ userId: `${P}-outsider-user` })
          .where(eq(professionals.id, id.pro));
      if (change === "room owner")
        await database
          .update(conversations)
          .set({ professionalId: `${P}-outsider-pro` })
          .where(eq(conversations.id, id.room));
      if (change === "generation")
        await database.insert(auditLogs).values({
          id: `${P}-new-generation`,
          action: "conversation_reopened",
          entityType: "conversation",
          entityId: id.room,
          createdAt: timestamp,
        });
      if (change === "new room")
        await database.insert(conversations).values({
          id: `${P}-late-room`,
          professionalId: id.pro,
          seekerSid: `${P}-late-sid`,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      if (change === "new grant")
        await database.insert(seekerSessions).values({
          sid: `${P}-late-grant`,
          conversationId: id.room,
          expiresAt: new Date(Date.now() + 3600000),
          issuedAt: new Date(),
        });
    });
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    expect(called()).toBe(true);
    expect(
      await database.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, id.pro),
      }),
    ).toBeDefined();
    expect(
      await database.query.user.findFirst({ where: eq(user.id, id.user) }),
    ).toBeDefined();
    expect(
      (await snapshot()).rooms.find((row) => row.id === id.room),
    ).toBeDefined();
  });
  it("rolls back the entire final child deletion; retry preserves provider references", async () => {
    await ownerSession();
    await membership();
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_account_fail BEFORE DELETE ON user WHEN OLD.id='${id.user}' BEGIN SELECT RAISE(ABORT,'fixture-final-user'); END`,
      ),
    );
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    await assertLocked();
    expect(
      await database.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, id.pro),
      }),
    ).toBeDefined();
    expect(
      await database.query.session.findFirst({
        where: eq(authSessions.id, `${P}-owner-session`),
      }),
    ).toBeDefined();
    await database.run(sql.raw("DROP TRIGGER fixture_account_fail"));
    await retry();
  });
  it("account lock revokes closed/inactivity grants, preserving previous revocation and crypto until purge succeeds", async () => {
    await ownerSession();
    const old = new Date(123456);
    await database
      .update(conversations)
      .set({
        status: "closed",
        closedReason: "inactivity",
        closedAt: timestamp,
      })
      .where(eq(conversations.id, id.room));
    await database
      .update(seekerSessions)
      .set({ revokedAt: old })
      .where(eq(seekerSessions.sid, `${P}-browser-b`));
    const before = await snapshot();
    mocks.purge.mockResolvedValueOnce("failed");
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    const after = await assertLocked();
    expect(after.rooms.find((row) => row.id === id.room)).toEqual(
      before.rooms.find((row) => row.id === id.room),
    );
    expect(
      after.sessions.find((row) => row.sid === `${P}-browser-b`)?.revokedAt,
    ).toEqual(old);
    await retry();
  });
  it.each([
    "SID deleted",
    "SID expired",
  ] as const)("provider await cannot carry an obsolete %s into release; fresh login retries", async (change) => {
    const sid = await ownerSession();
    await membership();
    mocks.retrieveSubscription.mockImplementationOnce(async () => {
      if (change === "SID deleted")
        await database.delete(authSessions).where(eq(authSessions.id, sid));
      else
        await database
          .update(authSessions)
          .set({ expiresAt: new Date(0) })
          .where(eq(authSessions.id, sid));
      return { status: "canceled" };
    });
    expect(await invokeSelf()).toMatchObject({ error: expect.any(String) });
    const state = await assertLocked();
    expect(state.pro?.currentActiveRequests).toBe(2);
    expect(state.relations.every((row) => row.status === "assigned")).toBe(
      true,
    );
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(
      await database.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, id.pro),
      }),
    ).toBeDefined();
    await ownerSession("-fresh");
    await retry();
  });
});
