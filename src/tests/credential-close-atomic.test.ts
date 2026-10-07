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
  practiceCredentials,
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
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: mocks.database } }),
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: mocks.disconnect,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
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
const P = "fixture-credential-close";
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
  const names = [
    "user",
    "professionals",
    "practice_credentials",
    "help_requests",
    "assignments",
    "conversations",
    "seeker_sessions",
    "audit_logs",
    "waitlist_entries",
    "session",
  ];
  const schema = await local.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND tbl_name IN (${names.map(() => "?").join(",")}) ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END`,
    args: names,
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
function onClosingBatch(callback: () => Promise<void>) {
  const batching = database.batch.bind(database);
  let called = false;
  vi.spyOn(database, "batch").mockImplementation(async (queries) => {
    if (
      !called &&
      queries.some(
        (query) =>
          "toSQL" in query &&
          /^update ["`]?conversations["`]?\s/i.test(
            (query as { toSQL(): { sql: string } }).toSQL().sql,
          ),
      )
    ) {
      called = true;
      await callback();
    }
    return batching(queries);
  });
  return () => called;
}
async function snapshot() {
  return {
    scopes: await database
      .select()
      .from(practiceCredentials)
      .where(like(practiceCredentials.id, `${P}%`)),
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
  await database
    .delete(practiceCredentials)
    .where(like(practiceCredentials.id, `${P}%`));
  await database.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await database
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.conversationId, id.room));
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
    await database.insert(practiceCredentials).values([
      {
        id: `${P}-scope`,
        professionalId: id.pro,
        patientCountry: "España",
        registryReference: "Registro ficticio",
        reviewedBy: `${id.admin}@example.test`,
        reviewedAt: timestamp,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: `${P}-outsider-scope`,
        professionalId: `${P}-outsider-pro`,
        patientCountry: "España",
        registryReference: "Otro registro ficticio",
        reviewedBy: `${id.admin}@example.test`,
        reviewedAt: timestamp,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ]);
  });

  async function prepare(mode: "credential_review" | "kind") {
    if (mode === "kind")
      await database
        .update(professionals)
        .set({ nonClinicalHelper: true, credentialConfirmed: true })
        .where(eq(professionals.id, id.pro));
    else {
      // Revisor de credenciales válido SIN pertenecer a ADMIN_EMAILS.
      vi.stubEnv("ADMIN_EMAILS", "otro-superadmin@example.test");
      vi.stubEnv(
        "CREDENTIAL_REVIEWER_EMAILS",
        `  ${id.admin.toUpperCase()}@EXAMPLE.TEST  `,
      );
    }
  }
  async function run(mode: "credential_review" | "kind", status = "suspended") {
    const form = new FormData();
    form.set("professionalId", id.pro);
    if (mode === "credential_review") {
      const { reviewProfessional } = await import(
        "@/app/admin/operaciones/actions"
      );
      form.set("status", status);
      form.set("reference", "Referencia documental ficticia");
      form.set("checked", "on");
      return reviewProfessional(null, form);
    }
    const { adminSetProfessionalKind } = await import("@/app/actions");
    form.set("kind", "certified");
    try {
      await adminSetProfessionalKind(form);
      return { ok: true };
    } catch (error) {
      if (String(error).includes("fixture-redirect:/admin/admision"))
        return { ok: true };
      throw error;
    }
  }
  async function reject(mode: "credential_review" | "kind") {
    if (mode === "credential_review")
      expect(await run(mode)).toMatchObject({ ok: false });
    else await expect(run(mode)).rejects.toThrow();
  }
  async function committed(
    mode: "credential_review" | "kind",
    before: Awaited<ReturnType<typeof snapshot>>,
  ) {
    const after = await snapshot();
    expect(after.pro?.status).toBe(
      mode === "kind" ? "pending_verification" : "suspended",
    );
    expect(after.pro?.currentActiveRequests).toBe(0);
    expect(after.pro?.credentialConfirmed).toBe(false);
    expect(after.pro?.cryptoPublicKey).toBe(before.pro?.cryptoPublicKey);
    expect(
      after.relations
        .filter((row) => row.professionalId === id.pro)
        .every((row) => row.status === "closed"),
    ).toBe(true);
    expect(after.requests.find((row) => row.id === id.request)?.status).toBe(
      "new",
    );
    expect(
      after.rooms
        .filter((row) => row.professionalId === id.pro)
        .every(
          (row) =>
            row.status === "closed" && row.closedReason === "case_closed",
        ),
    ).toBe(true);
    expect(
      after.sessions
        .filter((row) => row.conversationId !== `${P}-outsider-room`)
        .every((row) => row.revokedAt !== null),
    ).toBe(true);
    expect(after.outsider).toEqual(before.outsider);
    expect(after.rooms.find((row) => row.id === `${P}-outsider-room`)).toEqual(
      before.rooms.find((row) => row.id === `${P}-outsider-room`),
    );
    expect(
      after.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    ).toEqual(
      before.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    );
    expect(
      after.scopes.find((row) => row.id === `${P}-outsider-scope`),
    ).toEqual(before.scopes.find((row) => row.id === `${P}-outsider-scope`));
    if (mode === "kind") {
      expect(after.pro?.nonClinicalHelper).toBe(false);
      expect(
        Date.parse(
          required(after.scopes.find((row) => row.id === `${P}-scope`))
            .expiresAt,
        ),
      ).toBeLessThanOrEqual(Date.now());
      expect(after.audits).toMatchObject([
        { action: "professional_kind_certified", metadata: null },
      ]);
    } else {
      expect(after.scopes).toEqual(before.scopes);
      expect(after.audits).toMatchObject([
        {
          action: "practice_credential_decision",
          metadata: JSON.stringify({
            status: "suspended",
            reference: "Referencia documental ficticia",
          }),
        },
      ]);
      expect(after.pro?.acceptingRequests).toBe(before.pro?.acceptingRequests);
    }
  }

  it.each([
    "credential_review",
    "kind",
  ] as const)("metadata real: %s rechaza todo y reintento explícito cierra sin pérdida", async (mode) => {
    await prepare(mode);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    const { mintSeekerToken, SEEKER_COOKIE } = await import(
      "@/lib/seeker-token"
    );
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
    const before = await snapshot();
    const called = onClosingBatch(async () => {
      const { joinWaitlistFromChat } = await import(
        "@/app/c/[conversationId]/actions"
      );
      const data = new FormData();
      data.set("conversationId", id.room);
      data.set("email", "ficticio-reintento@example.test");
      data.set("generalReason", "1");
      expect(await joinWaitlistFromChat(null, data)).toMatchObject({
        ok: true,
      });
    });
    await reject(mode);
    expect(called()).toBe(true);
    const after = await snapshot();
    expect(after.pro).toEqual(before.pro);
    expect(after.requests).toEqual(before.requests);
    expect(after.relations).toEqual(before.relations);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.audits).toEqual(before.audits);
    expect(after.scopes).toEqual(before.scopes);
    expect(after.rooms.find((row) => row.id === id.room)?.seekerEmail).toBe(
      "ficticio-reintento@example.test",
    );
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(await run(mode)).toMatchObject({ ok: true });
    await committed(mode, before);
    if (mode === "kind") {
      await run(mode);
      expect((await snapshot()).audits).toHaveLength(1);
    }
  });

  it.each([
    "credential_review",
    "kind",
  ] as const)("rollback/retry: %s en cupo, grants, auditoría y expiración de ámbitos", async (mode) => {
    await prepare(mode);
    const before = await snapshot();
    for (const fault of [
      "quota",
      "grants",
      "audit",
      ...(mode === "kind" ? ["scope"] : []),
    ]) {
      if (fault === "quota") await failQuota();
      else
        await database.run(
          sql.raw(
            fault === "grants"
              ? `CREATE TRIGGER fixture_release_fail BEFORE UPDATE OF revoked_at ON seeker_sessions BEGIN SELECT RAISE(ABORT,'fixture-grant-failure'); END`
              : fault === "scope"
                ? `CREATE TRIGGER fixture_release_fail BEFORE UPDATE OF expires_at ON practice_credentials BEGIN SELECT RAISE(ABORT,'fixture-scope-failure'); END`
                : `CREATE TRIGGER fixture_release_fail AFTER INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture-audit-failure'); END`,
          ),
        );
      await reject(mode);
      expect(await snapshot()).toEqual(before);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      await allowQuota();
    }
    expect(await run(mode)).toMatchObject({ ok: true });
    await committed(mode, before);
  });

  it.each([
    "credential_review",
    "kind",
  ] as const)("autorización SQL: %s conserva decisión completa ante SID/email/verificación/expiry nuevos", async (mode) => {
    await prepare(mode);
    for (const change of ["sid", "expiry", "email", "verified"] as const) {
      vi.restoreAllMocks();
      const before = await snapshot();
      const called = onClosingBatch(async () => {
        if (change === "sid")
          await database
            .delete(authSessions)
            .where(eq(authSessions.id, `${P}-admin-session`));
        if (change === "expiry")
          await database
            .update(authSessions)
            .set({ expiresAt: new Date(0) })
            .where(eq(authSessions.id, `${P}-admin-session`));
        if (change === "email")
          await database
            .update(user)
            .set({ email: `${P}-changed@example.test` })
            .where(eq(user.id, id.admin));
        if (change === "verified")
          await database
            .update(user)
            .set({ emailVerified: false })
            .where(eq(user.id, id.admin));
      });
      await reject(mode);
      expect(called()).toBe(true);
      expect(await snapshot()).toEqual(before);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      await database
        .delete(authSessions)
        .where(eq(authSessions.id, `${P}-admin-session`));
      await database.insert(authSessions).values({
        id: `${P}-admin-session`,
        userId: id.admin,
        token: `${P}-fake-admin-token`,
        expiresAt: new Date(Date.now() + 3600000),
      });
      await database
        .update(user)
        .set({ email: `${id.admin}@example.test`, emailVerified: true })
        .where(eq(user.id, id.admin));
    }
    expect(await run(mode)).toMatchObject({ ok: true });
  });

  it.each([
    "credential_review",
    "kind",
  ] as const)("deleting/owner/type: %s no reautoriza la versión nueva de perfil", async (mode) => {
    await prepare(mode);
    for (const values of [
      { status: "deleting" },
      { userId: `${P}-outsider-user` },
      { nonClinicalHelper: mode !== "kind" },
    ]) {
      vi.restoreAllMocks();
      const original = required(
        await database.query.professionals.findFirst({
          where: eq(professionals.id, id.pro),
        }),
      );
      let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
      const called = onClosingBatch(async () => {
        await database
          .update(professionals)
          .set(values)
          .where(eq(professionals.id, id.pro));
        expected = await snapshot();
      });
      await reject(mode);
      expect(called()).toBe(true);
      expect(await snapshot()).toEqual(expected);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      await database
        .update(professionals)
        .set(original)
        .where(eq(professionals.id, id.pro));
    }
  });

  it.each([
    "support",
    "admission",
    "nobody",
    "credentials",
  ] as const)("scope de credenciales %s conserva permiso exacto y no permite reclasificar", async (scope) => {
    vi.stubEnv("ADMIN_EMAILS", "otro-superadmin@example.test");
    vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", "");
    vi.stubEnv(
      scope === "support"
        ? "SUPPORT_EMAILS"
        : scope === "admission"
          ? "ADMISSION_REVIEWER_EMAILS"
          : "CREDENTIAL_REVIEWER_EMAILS",
      scope === "nobody" ? "" : `${id.admin}@example.test`,
    );
    const before = await snapshot();
    const result = await run("credential_review");
    if (scope === "credentials") {
      expect(result).toMatchObject({ ok: true });
      await committed("credential_review", before);
    } else {
      expect(result).toMatchObject({ ok: false });
      expect(await snapshot()).toEqual(before);
    }
    await database
      .update(professionals)
      .set({ nonClinicalHelper: true })
      .where(eq(professionals.id, id.pro));
    const kindBefore = await snapshot();
    await expect(run("kind")).rejects.toThrow("fixture-redirect:/pro");
    expect(await snapshot()).toEqual(kindBefore);
  });

  it.each([
    "credential_review",
    "kind",
  ] as const)("ABA real: %s rechaza tras reapertura con fechas idénticas y conserva permisos nuevos", async (mode) => {
    await prepare(mode);
    const at = Date.now() + 1000,
      version = new Date(at).toISOString();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    try {
      await database
        .update(conversations)
        .set({
          helpRequestId: null,
          seekerEmail: null,
          updatedAt: version,
          reopenedAt: new Date(at),
        })
        .where(eq(conversations.id, id.room));
      let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
      const called = onClosingBatch(async () => {
        const { closeConversations } = await import("@/lib/assignment");
        const { reopenConversation } = await import(
          "@/app/c/[conversationId]/actions"
        );
        await database.insert(authSessions).values({
          id: `${P}-pro-session`,
          userId: id.user,
          token: `${P}-fake-pro-token`,
          expiresAt: new Date(at + 3600000),
        });
        mocks.session.mockResolvedValue({
          user: { id: id.user, email: `${id.user}@example.test` },
          session: {
            id: `${P}-pro-session`,
            expiresAt: new Date(at + 3600000),
          },
        });
        await closeConversations(
          [{ id: id.room }],
          version,
          new Date(at),
          "inactivity",
        );
        expect(await reopenConversation(id.room)).toMatchObject({ ok: true });
        expected = await snapshot();
        expect(
          expected.rooms.find((row) => row.id === id.room)?.updatedAt,
        ).toBe(version);
        expect(
          expected.rooms.find((row) => row.id === id.room)?.reopenedAt,
        ).toEqual(new Date(at));
        mocks.session.mockResolvedValue({
          user: { id: id.admin, email: `${id.admin}@example.test` },
          session: {
            id: `${P}-admin-session`,
            expiresAt: new Date(at + 3600000),
          },
        });
        mocks.disconnect.mockClear();
      });
      await reject(mode);
      expect(called()).toBe(true);
      expect(await snapshot()).toEqual(expected);
      expect(mocks.disconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ámbitos: reclasificar no expira un scope añadido/modificado después del snapshot", async () => {
    await prepare("kind");
    let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
    const called = onClosingBatch(async () => {
      await database
        .update(practiceCredentials)
        .set({ registryReference: "Nuevo cotejo ficticio" })
        .where(eq(practiceCredentials.id, `${P}-scope`));
      expected = await snapshot();
    });
    await reject("kind");
    expect(called()).toBe(true);
    expect(await snapshot()).toEqual(expected);
  });

  it("grants previos: nueva suspensión no reescribe revocaciones ni claves", async () => {
    await prepare("credential_review");
    const old = new Date(1);
    await database
      .update(seekerSessions)
      .set({ revokedAt: old })
      .where(eq(seekerSessions.sid, `${P}-browser-b`));
    const before = await snapshot();
    expect(await run("credential_review")).toMatchObject({ ok: true });
    await committed("credential_review", before);
    expect(
      (await snapshot()).sessions.find((row) => row.sid === `${P}-browser-b`)
        ?.revokedAt,
    ).toEqual(old);
  });
  it.each([
    "pending_verification",
    "rejected",
  ])("decisión clínica %s conserva estados, scopes y auditoría originales con cierre completo", async (status) => {
    await prepare("credential_review");
    const before = await snapshot();
    expect(await run("credential_review", status)).toMatchObject({ ok: true });
    const after = await snapshot();
    expect(after.pro?.status).toBe(status);
    expect(after.pro?.currentActiveRequests).toBe(0);
    expect(after.pro?.credentialConfirmed).toBe(false);
    expect(after.pro?.acceptingRequests).toBe(before.pro?.acceptingRequests);
    expect(after.pro?.cryptoPublicKey).toBe(before.pro?.cryptoPublicKey);
    expect(after.scopes).toEqual(before.scopes);
    expect(
      after.rooms
        .filter((row) => row.professionalId === id.pro)
        .every((row) => row.status === "closed"),
    ).toBe(true);
    expect(
      after.sessions
        .filter((row) => row.conversationId !== `${P}-outsider-room`)
        .every((row) => row.revokedAt !== null),
    ).toBe(true);
    expect(after.audits).toMatchObject([
      {
        action: "practice_credential_decision",
        metadata: JSON.stringify({
          status,
          reference: "Referencia documental ficticia",
        }),
      },
    ]);
  });
});
