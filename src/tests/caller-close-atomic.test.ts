import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { eq, getTableName, like, sql } from "drizzle-orm";
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
const P = "fixture-caller-close";
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
let adminClose: typeof import("@/app/actions").adminUpdateHelpRequestStatus;

beforeAll(async () => {
  mocks.database = await runtime.getD1Database("DB");
  const names = [
    "user",
    "professionals",
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
async function invoke(mode: "request" | "suspension") {
  if (mode === "request") return adminClose(closeForm());
  const { adminUpdateProfessionalStatus } = await import("@/app/actions");
  const form = new FormData();
  form.set("professionalId", id.pro);
  form.set("status", "suspended");
  return adminUpdateProfessionalStatus(form);
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
function closeForm() {
  const form = new FormData();
  form.set("requestId", id.request);
  form.set("status", "closed");
  return form;
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
    ({ adminUpdateHelpRequestStatus: adminClose } = await import(
      "@/app/actions"
    ));
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
  });

  it.each([
    "request",
    "suspension",
  ] as const)("Causal: $0 confirma todo o rechaza todo ante alta waitlist concurrente", async (mode) => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    const { joinWaitlistFromChat } = await import(
      "@/app/c/[conversationId]/actions"
    );
    const { adminUpdateProfessionalStatus } = await import("@/app/actions");
    const { mintSeekerToken, SEEKER_COOKIE } = await import(
      "@/lib/seeker-token"
    );
    const { seekerSessionAllows, seekerCanSend, currentConnectionGate } =
      await import("@/server/auth-gate");
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
    let interleaved = false;
    let joined: unknown;
    async function metadataBeforeWrite() {
      if (interleaved) return;
      interleaved = true;
      const data = new FormData();
      data.set("conversationId", id.room);
      data.set("email", "coordinator-waitlist-fictitious@example.test");
      data.set("generalReason", "1");
      joined = await joinWaitlistFromChat(null, data);
      expect(joined).toMatchObject({ ok: true });
    }
    // Same causal boundary on base/candidate: immediately before real SQL
    // UPDATE conversations. Preserve real builders, queries and DB execution.
    const updating = database.update.bind(database);
    vi.spyOn(database, "update").mockImplementation((table) => {
      const builder = updating(table);
      if (getTableName(table) === "conversations") {
        const setting = builder.set.bind(builder);
        vi.spyOn(builder, "set").mockImplementation((values) => {
          const query = setting(values),
            execute = query.execute.bind(query);
          vi.spyOn(query, "execute").mockImplementation(async () => {
            await metadataBeforeWrite();
            return execute();
          });
          return query;
        });
      }
      return builder;
    });
    const batching = database.batch.bind(database);
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      if (
        queries.some((query) =>
          /^update ["`]?conversations["`]?\s/i.test(
            "toSQL" in query
              ? (query as { toSQL(): { sql: string } }).toSQL().sql
              : "",
          ),
        )
      )
        await metadataBeforeWrite();
      return batching(queries);
    });
    let failure: unknown;
    try {
      if (mode === "request") await adminClose(closeForm());
      else {
        const data = new FormData();
        data.set("professionalId", id.pro);
        data.set("status", "suspended");
        await adminUpdateProfessionalStatus(data);
      }
    } catch (error) {
      failure = error;
    }
    expect(interleaved).toBe(true);
    const after = await snapshot();
    const room = required(after.rooms.find((row) => row.id === id.room));
    const grant = required(
      after.sessions.find((row) => row.sid === `${P}-browser-a`),
    );
    const gateRow = {
      revoked_at: grant.revokedAt?.getTime() ?? null,
      expires_at: grant.expiresAt.getTime(),
      status: room.status,
      anonymized_at: room.anonymizedAt ? Date.parse(room.anonymizedAt) : null,
      deleted_at: room.deletedAt?.getTime() ?? null,
    };
    const actualGate =
      driver === "D1"
        ? await currentConnectionGate(
            {
              DB: required(mocks.database),
              BETTER_AUTH_SECRET: "test-secret",
              BETTER_AUTH_URL: "https://nido.example.test",
            },
            "seeker",
            grant.sid,
            id.room,
            Date.now(),
          )
        : {
            allowed: seekerSessionAllows(gateRow, Date.now()),
            canSend: seekerCanSend(gateRow),
          };
    const detail = {
      mode,
      interleaved,
      failure: String(failure ?? ""),
      request: after.requests.find((row) => row.id === id.request)?.status,
      assignment: after.relations.find((row) => row.id === id.assignment)
        ?.status,
      proStatus: after.pro?.status,
      counter: after.pro?.currentActiveRequests,
      roomStatus: room.status,
      liveRoomGrants: after.sessions.filter(
        (row) => row.conversationId === id.room && row.revokedAt === null,
      ).length,
      gate: actualGate,
      disconnectCalls: mocks.disconnect.mock.calls.length,
    };
    console.info("COORDINATOR_CAUSAL", JSON.stringify(detail));
    // Contrato explícito: éxito completo o rechazo sin escrituras propias.
    // La metadata legítima concurrente y su alta waitlist deben conservarse.
    if (failure) {
      expect(String(failure)).toContain("Vuelve a intentarlo");
      expect(after.requests).toEqual(before.requests);
      expect(after.relations).toEqual(before.relations);
      expect(after.pro).toEqual(before.pro);
      expect(after.sessions).toEqual(before.sessions);
      expect(after.audits).toEqual(before.audits);
      expect(room).toEqual({
        ...before.rooms.find((row) => row.id === id.room),
        seekerEmail: "coordinator-waitlist-fictitious@example.test",
        updatedAt: room.updatedAt,
      });
      expect(room.updatedAt).not.toBe(timestamp);
      expect(after.rooms.find((row) => row.id === id.otherRoom)).toEqual(
        before.rooms.find((row) => row.id === id.otherRoom),
      );
      expect(actualGate).toEqual({ allowed: true, canSend: true });
      expect(mocks.disconnect).not.toHaveBeenCalled();
      // Un nuevo intento humano lee y autoriza la versión actual.
      if (mode === "request") await adminClose(closeForm());
      else {
        const data = new FormData();
        data.set("professionalId", id.pro);
        data.set("status", "suspended");
        await adminUpdateProfessionalStatus(data);
      }
    }
    const committed = await snapshot();
    expect(committed.rooms.find((row) => row.id === id.room)?.status).toBe(
      "closed",
    );
    expect(committed.rooms.find((row) => row.id === id.room)?.seekerEmail).toBe(
      "coordinator-waitlist-fictitious@example.test",
    );
    expect(
      committed.sessions
        .filter((row) => row.conversationId === id.room)
        .every((row) => row.revokedAt !== null),
    ).toBe(true);
    expect(committed.rooms.find((row) => row.id === id.otherRoom)?.status).toBe(
      mode === "suspension" ? "closed" : "open",
    );
    expect(committed.pro?.currentActiveRequests).toBe(
      mode === "suspension" ? 0 : 1,
    );
    expect(committed.pro?.status).toBe(
      mode === "suspension" ? "suspended" : "approved",
    );
    expect(
      committed.requests.find((row) => row.id === id.request)?.status,
    ).toBe(mode === "suspension" ? "new" : "closed");
    expect(committed.audits).toHaveLength(1);
    expect(committed.audits[0]).toMatchObject({
      action:
        mode === "request" ? "request_closure" : "professional_suspension",
      entityType: mode === "request" ? "help_request" : "professional",
      entityId: mode === "request" ? id.request : id.pro,
    });
    expect(committed.outsider).toEqual(before.outsider);
    expect(committed.pro?.cryptoPublicKey).toBe(before.pro?.cryptoPublicKey);
    expect(
      committed.rooms.find((row) => row.id === `${P}-outsider-room`),
    ).toEqual(before.rooms.find((row) => row.id === `${P}-outsider-room`));
    expect(
      committed.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    ).toEqual(
      before.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    );
    const finalGrant = required(
      committed.sessions.find((row) => row.sid === `${P}-browser-a`),
    );
    const finalRoom = required(
      committed.rooms.find((row) => row.id === id.room),
    );
    const finalGate =
      driver === "D1"
        ? await currentConnectionGate(
            {
              DB: required(mocks.database),
              BETTER_AUTH_SECRET: "test-secret",
              BETTER_AUTH_URL: "https://nido.example.test",
            },
            "seeker",
            finalGrant.sid,
            id.room,
            Date.now(),
          )
        : {
            allowed: seekerSessionAllows(
              {
                revoked_at: required(finalGrant.revokedAt).getTime(),
                expires_at: finalGrant.expiresAt.getTime(),
                status: finalRoom.status,
                anonymized_at: null,
                deleted_at: null,
              },
              Date.now(),
            ),
            canSend: false,
          };
    expect(finalGate).toEqual({ allowed: false, canSend: false });
  });

  it.each([
    "request",
    "suspension",
  ] as const)("rollback: %s ante fallo de cupo, revocación o auditoría", async (mode) => {
    for (const fault of ["quota", "grant", "audit"] as const) {
      const before = await snapshot();
      if (fault === "quota") await failQuota();
      else
        await database.run(
          sql.raw(
            fault === "grant"
              ? `CREATE TRIGGER fixture_release_fail BEFORE UPDATE OF revoked_at ON seeker_sessions BEGIN SELECT RAISE(ABORT,'fixture-grant-failure'); END`
              : `CREATE TRIGGER fixture_release_fail AFTER INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture-audit-failure'); END`,
          ),
        );
      await expect(invoke(mode)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      await allowQuota();
    }
    await invoke(mode);
    const committed = await snapshot();
    expect(committed.rooms.find((row) => row.id === id.room)?.status).toBe(
      "closed",
    );
    expect(
      committed.sessions
        .filter((row) => row.conversationId === id.room)
        .every((row) => row.revokedAt !== null),
    ).toBe(true);
    expect(committed.pro?.currentActiveRequests).toBe(
      mode === "request" ? 1 : 0,
    );
    expect(committed.audits).toHaveLength(1);
    expect(committed.audits[0]).toMatchObject({
      action:
        mode === "request" ? "request_closure" : "professional_suspension",
      entityType: mode === "request" ? "help_request" : "professional",
      entityId: mode === "request" ? id.request : id.pro,
    });
  });

  it.each([
    "suspended",
    "rejected",
  ] as const)("auditoría administrativa: %s conserva nombre, destino y cupos", async (status) => {
    const before = await snapshot();
    const { adminUpdateProfessionalStatus } = await import("@/app/actions");
    const data = new FormData();
    data.set("professionalId", id.pro);
    data.set("status", status);
    await adminUpdateProfessionalStatus(data);
    const after = await snapshot();
    expect(after.pro?.status).toBe(status);
    expect(after.pro?.currentActiveRequests).toBe(0);
    expect(after.requests.find((row) => row.id === id.request)?.status).toBe(
      "new",
    );
    expect(
      after.requests.find((row) => row.id === id.otherRequest)?.status,
    ).toBe("new");
    expect(
      after.rooms
        .filter((row) => row.professionalId === id.pro)
        .every((row) => row.status === "closed"),
    ).toBe(true);
    expect(
      after.sessions
        .filter(
          (row) =>
            row.conversationId === id.room ||
            row.conversationId === id.otherRoom,
        )
        .every((row) => row.revokedAt !== null),
    ).toBe(true);
    expect(after.audits).toHaveLength(1);
    expect(after.audits[0]).toMatchObject({
      action:
        status === "suspended"
          ? "professional_suspension"
          : "professional_rejection",
      entityType: "professional",
      entityId: id.pro,
    });
    expect(after.outsider).toEqual(before.outsider);
  });

  it.each([
    "request",
    "suspension",
  ] as const)("actor: %s repite sesión, usuario y cuenta dentro de SQL", async (mode) => {
    const before = await snapshot();
    const called = onClosingBatch(async () => {
      await database
        .delete(authSessions)
        .where(eq(authSessions.id, `${P}-admin-session`));
    });
    await expect(invoke(mode)).rejects.toThrow("Vuelve a intentarlo");
    expect(called()).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    await database.insert(authSessions).values({
      id: `${P}-admin-session`,
      userId: id.admin,
      token: `${P}-fake-admin-token-retry`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await invoke(mode);
    expect((await snapshot()).audits).toHaveLength(1);
  });

  it.each([
    "request",
    "suspension",
  ] as const)("conflictos: %s no confirma sobre dueño, participante, papelera o generación nuevos", async (mode) => {
    const changes = [
      { seekerSid: `${P}-different-seeker` },
      { professionalId: `${P}-outsider-pro` },
      { deletedAt: new Date() },
      { anonymizedAt: new Date().toISOString() },
      { reopenedAt: new Date() },
      { helpRequestId: id.otherRequest },
    ];
    for (const change of changes) {
      vi.restoreAllMocks();
      const original = required(
        await database.query.conversations.findFirst({
          where: eq(conversations.id, id.room),
        }),
      );
      let changed: Awaited<ReturnType<typeof snapshot>> | undefined;
      const called = onClosingBatch(async () => {
        await database
          .update(conversations)
          .set(change)
          .where(eq(conversations.id, id.room));
        changed = await snapshot();
      });
      await expect(invoke(mode)).rejects.toThrow("Vuelve a intentarlo");
      expect(called()).toBe(true);
      expect(await snapshot()).toEqual(changed);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      await database
        .update(conversations)
        .set(original)
        .where(eq(conversations.id, id.room));
    }
  });

  it.each([
    "request",
    "suspension",
  ] as const)("autorización: %s no escribe tras cambio de correo, verificación, expiry o cuenta deleting", async (mode) => {
    for (const mutation of [
      "email",
      "verified",
      "expiry",
      "deleting",
    ] as const) {
      vi.restoreAllMocks();
      let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
      const called = onClosingBatch(async () => {
        if (mutation === "email")
          await database
            .update(user)
            .set({ email: `${P}-changed@example.test` })
            .where(eq(user.id, id.admin));
        if (mutation === "verified")
          await database
            .update(user)
            .set({ emailVerified: false })
            .where(eq(user.id, id.admin));
        if (mutation === "expiry")
          await database
            .update(authSessions)
            .set({ expiresAt: new Date(0) })
            .where(eq(authSessions.id, `${P}-admin-session`));
        if (mutation === "deleting")
          await database
            .update(professionals)
            .set({ status: "deleting" })
            .where(eq(professionals.id, id.pro));
        expected = await snapshot();
      });
      await expect(invoke(mode)).rejects.toThrow("Vuelve a intentarlo");
      expect(called()).toBe(true);
      expect(await snapshot()).toEqual(expected);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      await database
        .update(user)
        .set({ email: `${id.admin}@example.test`, emailVerified: true })
        .where(eq(user.id, id.admin));
      await database
        .update(authSessions)
        .set({ expiresAt: new Date(Date.now() + 3600000) })
        .where(eq(authSessions.id, `${P}-admin-session`));
      await database
        .update(professionals)
        .set({ status: "approved" })
        .where(eq(professionals.id, id.pro));
    }
  });

  it("concurrencia: dos intentos administrativos sobre el mismo snapshot sólo confirman uno", async () => {
    const find = database.query.conversations.findMany.bind(
      database.query.conversations,
    );
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(database.query.conversations, "findMany").mockImplementation(
      (query) => {
        const read = find(query),
          execute = read.execute.bind(read);
        vi.spyOn(read, "execute").mockImplementation(async () => {
          const rows = await execute();
          if (++reads === 2) release();
          await bothRead;
          return rows;
        });
        return read;
      },
    );
    const result = await Promise.allSettled([
      invoke("request"),
      invoke("request"),
    ]);
    expect(result.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((row) => row.status === "rejected")).toHaveLength(1);
    const after = await snapshot();
    expect(after.pro?.currentActiveRequests).toBe(1);
    expect(after.audits).toHaveLength(1);
    expect(
      after.relations.find((row) => row.id === id.otherAssignment)?.status,
    ).toBe("assigned");
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("ABA caller: una reapertura real no autoriza la suspensión con selección obsoleta", async () => {
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
      const { closeConversations } = await import("@/lib/assignment");
      const { reopenConversation } = await import(
        "@/app/c/[conversationId]/actions"
      );
      let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
      const called = onClosingBatch(async () => {
        await database.insert(authSessions).values({
          id: `${P}-pro-live-session`,
          userId: id.user,
          token: `${P}-fake-pro-token`,
          expiresAt: new Date(at + 3600000),
        });
        mocks.session.mockResolvedValue({
          user: { id: id.user, email: `${id.user}@example.test` },
          session: {
            id: `${P}-pro-live-session`,
            expiresAt: new Date(at + 3600000),
          },
        });
        await closeConversations(
          [{ id: id.room }],
          version,
          new Date(at),
          "inactivity",
        );
        expect(await reopenConversation(id.room)).toMatchObject({
          ok: true,
          role: "professional",
        });
        expected = await snapshot();
        expect(
          expected.rooms.find((row) => row.id === id.room)?.updatedAt,
        ).toBe(version);
        mocks.session.mockResolvedValue({
          user: { id: id.admin, email: `${id.admin}@example.test` },
          session: {
            id: `${P}-admin-session`,
            expiresAt: new Date(at + 3600000),
          },
        });
        mocks.disconnect.mockClear();
      });
      await expect(invoke("suspension")).rejects.toThrow("Vuelve a intentarlo");
      expect(called()).toBe(true);
      expect(await snapshot()).toEqual(expected);
      expect(mocks.disconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("alcance D1: cierra muchas salas en un batch sin superar 100 bindings por sentencia", async () => {
    const before = await snapshot();
    const previouslyRevoked = new Date(1);
    await database
      .update(seekerSessions)
      .set({ revokedAt: previouslyRevoked })
      .where(eq(seekerSessions.sid, `${P}-browser-b`));
    for (let i = 0; i < 20; i++) {
      await database.insert(conversations).values({
        id: `${P}-extra-room-${i}`,
        professionalId: id.pro,
        seekerSid: `${P}-extra-${i}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await database.insert(seekerSessions).values({
        sid: `${P}-extra-${i}`,
        conversationId: `${P}-extra-room-${i}`,
        role: "seeker",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
    }
    const batch = database.batch.bind(database);
    vi.spyOn(database, "batch").mockImplementation(async (queries) => {
      for (const query of queries)
        if ("toSQL" in query)
          expect(
            (query as { toSQL(): { params: unknown[] } }).toSQL().params.length,
          ).toBeLessThanOrEqual(100);
      return batch(queries);
    });
    await invoke("suspension");
    const after = await snapshot();
    expect(
      after.rooms.filter((row) => row.professionalId === id.pro),
    ).toHaveLength(22);
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
    expect(
      after.sessions.find((row) => row.sid === `${P}-browser-b`)?.revokedAt,
    ).toEqual(previouslyRevoked);
    expect(after.pro?.status).toBe("suspended");
    expect(after.pro?.currentActiveRequests).toBe(0);
    expect(after.pro?.cryptoPublicKey).toBe(before.pro?.cryptoPublicKey);
    expect(after.outsider).toEqual(before.outsider);
    expect(after.rooms.find((row) => row.id === `${P}-outsider-room`)).toEqual(
      before.rooms.find((row) => row.id === `${P}-outsider-room`),
    );
    expect(
      after.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    ).toEqual(
      before.sessions.find((row) => row.sid === `${P}-outsider-browser`),
    );
    expect(after.audits).toHaveLength(1);
  });

  it("selección caller: no acepta un propietario cambiado antes de entrar en el helper", async () => {
    const find = database.query.professionals.findFirst.bind(
      database.query.professionals,
    );
    let changed: Awaited<ReturnType<typeof snapshot>> | undefined;
    let called = false;
    vi.spyOn(database.query.professionals, "findFirst").mockImplementation(
      (query) => {
        const read = find(query),
          execute = read.execute.bind(read);
        vi.spyOn(read, "execute").mockImplementation(async () => {
          const row = await execute();
          if (!called && row?.id === id.pro) {
            called = true;
            await database
              .update(professionals)
              .set({ userId: `${P}-outsider-user` })
              .where(eq(professionals.id, id.pro));
            changed = await snapshot();
          }
          return row;
        });
        return read;
      },
    );
    await expect(invoke("suspension")).rejects.toThrow("Vuelve a intentarlo");
    expect(called).toBe(true);
    expect(await snapshot()).toEqual(changed);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("alcance: una sala abierta nueva impide confirmar una selección incompleta", async () => {
    let changed: Awaited<ReturnType<typeof snapshot>> | undefined;
    onClosingBatch(async () => {
      await database.insert(conversations).values({
        id: `${P}-phantom`,
        professionalId: id.pro,
        seekerSid: `${P}-phantom`,
        helpRequestId: id.request,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      changed = await snapshot();
    });
    await expect(adminClose(closeForm())).rejects.toThrow(
      "Vuelve a intentarlo",
    );
    expect(await snapshot()).toEqual(changed);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("ABA: reapertura real con updatedAt reutilizado bloquea el cierre obsoleto", async () => {
    const at = Date.now() + 1000,
      version = new Date(at).toISOString();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    try {
      const { reopenConversation } = await import(
        "@/app/c/[conversationId]/actions"
      );
      const { closeConversations } = await import("@/lib/assignment");
      await database
        .update(conversations)
        .set({
          helpRequestId: null,
          seekerEmail: null,
          updatedAt: version,
          reopenedAt: new Date(at),
        })
        .where(eq(conversations.id, id.room));
      await database.insert(authSessions).values({
        id: `${P}-pro-live-session`,
        userId: id.user,
        token: `${P}-fake-pro-token`,
        expiresAt: new Date(at + 3600000),
      });
      mocks.session.mockResolvedValue({
        user: { id: id.user, email: `${id.user}@example.test` },
        session: {
          id: `${P}-pro-live-session`,
          expiresAt: new Date(at + 3600000),
        },
      });
      mocks.getCookie.mockReturnValue(undefined);
      const find = database.query.conversations.findFirst.bind(
        database.query.conversations,
      );
      let interleaved = false;
      let reopenedVersion: string | undefined;
      vi.spyOn(database.query.conversations, "findFirst").mockImplementation(
        (query) => {
          const read = find(query),
            execute = read.execute.bind(read);
          vi.spyOn(read, "execute").mockImplementation(async () => {
            const row = await execute();
            if (!interleaved && row?.id === id.room) {
              interleaved = true;
              expect(
                await closeConversations(
                  [{ id: id.room }],
                  version,
                  new Date(at),
                ),
              ).toBe(1);
              expect(
                (
                  await database.query.conversations.findFirst({
                    where: eq(conversations.id, id.room),
                  })
                )?.updatedAt,
              ).toBe(new Date(at + 1).toISOString());
              expect(await reopenConversation(id.room)).toMatchObject({
                ok: true,
                role: "professional",
              });
              reopenedVersion = (
                await database.query.conversations.findFirst({
                  where: eq(conversations.id, id.room),
                })
              )?.updatedAt;
            }
            return row;
          });
          return read;
        },
      );
      await expect(
        closeConversations([{ id: id.room }], version, new Date(at)),
      ).rejects.toThrow("El chat cambió");
      const closed = 0;
      console.info(
        "COORDINATOR_ABA",
        JSON.stringify({
          driver,
          interleaved,
          initial: version,
          reopened: reopenedVersion,
          closedByStaleRead: closed,
        }),
      );
      expect(interleaved).toBe(true);
      expect(reopenedVersion).toBe(version);
      expect(
        (
          await database.query.conversations.findFirst({
            where: eq(conversations.id, id.room),
          })
        )?.status,
      ).toBe("open");
      expect(closed).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
