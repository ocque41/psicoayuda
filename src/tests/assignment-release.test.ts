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
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  database: null as D1Database | null,
  session: vi.fn(),
  disconnect: vi.fn(async () => true),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: mocks.database } }),
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: mocks.disconnect,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
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
  d1Databases: { DB: "assignment-release-fixture" },
});
const P = "fixture-release";
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
let release: typeof import("@/lib/assignment").releaseAssignmentsForRequest;
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
  ];
  const schema = await local.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name IN (${names.map(() => "?").join(",")})`,
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

async function snapshot() {
  return {
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

async function assertReleased() {
  const state = await snapshot();
  expect(state.relations.find((row) => row.id === id.assignment)?.status).toBe(
    "closed",
  );
  expect(
    state.relations.find((row) => row.id === id.otherAssignment)?.status,
  ).toBe("assigned");
  expect(state.pro?.currentActiveRequests).toBe(1);
  expect(state.rooms.find((row) => row.id === id.room)).toMatchObject({
    status: "closed",
    closedReason: "case_closed",
  });
  expect(state.rooms.find((row) => row.id === id.otherRoom)).toMatchObject({
    status: "open",
    closedReason: null,
  });
  expect(
    state.sessions
      .filter((row) => row.conversationId === id.room)
      .every((row) => row.revokedAt !== null),
  ).toBe(true);
  expect(
    state.sessions.find((row) => row.conversationId === id.otherRoom)
      ?.revokedAt,
  ).toBeNull();
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
    ({ releaseAssignmentsForRequest: release } = await import(
      "@/lib/assignment"
    ));
    ({ adminUpdateHelpRequestStatus: adminClose } = await import(
      "@/app/actions"
    ));
    await cleanup();
    mocks.disconnect.mockClear();
    mocks.session.mockResolvedValue({
      user: { id: id.admin, email: `${id.admin}@example.test` },
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
  });

  it.each([
    "assigned",
    "accepted",
  ])("revierte relación %s y cupo juntos cuando falla el descuento, incluso en solicitud cerrada", async (status) => {
    await database
      .update(assignments)
      .set({ status })
      .where(eq(assignments.id, id.assignment));
    await database
      .update(helpRequests)
      .set({ status: "closed" })
      .where(eq(helpRequests.id, id.request));
    const before = await snapshot();
    await failQuota();
    await expect(release(id.request)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(mocks.disconnect).not.toHaveBeenCalled();
    await allowQuota();
    expect(await release(id.request)).toBe(1);
    expect(await release(id.request)).toBe(0);
    await assertReleased();
  });

  it("el reintento recupera el cupo después de un fallo sin descontar otro caso", async () => {
    await failQuota();
    await expect(release(id.request)).rejects.toThrow();
    await allowQuota();
    const released = await release(id.request);
    await assertReleased();
    expect(released).toBe(1);
  });

  it("reintenta el cierre administrativo que guardó closed antes del fallo sin perder el cupo", async () => {
    await failQuota();
    await expect(adminClose(closeForm())).rejects.toThrow();
    const failed = await snapshot();
    expect(failed.requests.find((row) => row.id === id.request)?.status).toBe(
      "closed",
    );
    expect(
      failed.relations.find((row) => row.id === id.assignment)?.status,
    ).toBe("assigned");
    expect(failed.pro?.currentActiveRequests).toBe(2);
    expect(failed.rooms.find((row) => row.id === id.room)?.status).toBe("open");
    expect(failed.sessions.every((row) => row.revokedAt === null)).toBe(true);
    await allowQuota();
    await adminClose(closeForm());
    await adminClose(closeForm());
    await assertReleased();
  });

  it("dos liberaciones que leyeron la misma relación descuentan y cuentan una sola vez", async () => {
    const find = database.query.assignments.findMany.bind(
      database.query.assignments,
    );
    let reads = 0;
    let unblock!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    vi.spyOn(database.query.assignments, "findMany").mockImplementation(
      (query) => {
        const read = find(query);
        const execute = read.execute.bind(read);
        // Conserva el query real de Drizzle y frena sólo su resolución: ambas
        // llamadas deben haber leído la relación antes de competir por el CAS.
        vi.spyOn(read, "execute").mockImplementation(async () => {
          const rows = await execute();
          if (++reads === 2) unblock();
          await bothRead;
          return rows;
        });
        return read;
      },
    );
    const result = await Promise.all([
      release(id.request),
      release(id.request),
    ]);
    expect(result.reduce((sum, count) => sum + count, 0)).toBe(1);
    await assertReleased();
  });

  it("la liberación sin cierre conserva sala, permisos y claves para ambas partes", async () => {
    const before = await snapshot();
    expect(
      await release(id.request, "inactivity", { closeConversations: false }),
    ).toBe(1);
    expect(
      await release(id.request, "inactivity", { closeConversations: false }),
    ).toBe(0);
    const after = await snapshot();
    expect(after.rooms).toEqual(before.rooms);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.requests).toEqual(before.requests);
    expect(after.pro?.cryptoPublicKey).toBe(before.pro?.cryptoPublicKey);
    expect(after.pro?.currentActiveRequests).toBe(1);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    "sin-sesion",
    "sin-verificar",
    "sin-permiso",
  ])("el cierre administrativo no escribe con actor %s", async (actor) => {
    if (actor === "sin-sesion") mocks.session.mockResolvedValue(null);
    else if (actor === "sin-verificar")
      await database
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, id.admin));
    else vi.stubEnv("ADMIN_EMAILS", "otro-admin@example.test");
    const before = await snapshot();
    await expect(adminClose(closeForm())).rejects.toThrow(
      "fixture-redirect:/pro",
    );
    expect(await snapshot()).toEqual(before);
  });
});
