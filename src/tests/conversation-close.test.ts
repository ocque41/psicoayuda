import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { and, eq, like, sql } from "drizzle-orm";
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
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  database: null as D1Database | null,
  disconnect: vi.fn(async () => true),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: mocks.database } }),
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: mocks.disconnect,
}));
const url = process.env.DATABASE_URL || "";
if (!url.startsWith("file:") || !url.includes("nido-tests-"))
  throw new Error("Requiere test:isolated.");
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
  d1Databases: { DB: "conversation-close-fixture" },
});
const P = "fixture-close";
const created = "2000-01-01T00:00:00.000Z";
const timestamp = "2026-10-07T09:00:00.000Z";
const later = "2026-10-07T09:01:00.000Z";
const revokedAt = new Date(timestamp);
const roomId = `${P}-room-a`;
let database: typeof import("@/db").db;
let close: typeof import("@/lib/assignment").closeConversations;

beforeAll(async () => {
  mocks.database = await runtime.getD1Database("DB");
  const names = [
    "user",
    "professionals",
    "help_requests",
    "audit_logs",
    "conversations",
    "seeker_sessions",
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
async function cleanup() {
  await database.run(sql.raw("DROP TRIGGER IF EXISTS fixture_close_fail"));
  await database
    .delete(seekerSessions)
    .where(like(seekerSessions.sid, `${P}%`));
  for (const table of [conversations, professionals, user])
    await database.delete(table).where(like(table.id, `${P}%`));
}
async function snapshot() {
  return {
    rooms: await database
      .select()
      .from(conversations)
      .where(like(conversations.id, `${P}%`)),
    sessions: await database
      .select()
      .from(seekerSessions)
      .where(like(seekerSessions.sid, `${P}%`)),
    pros: await database
      .select()
      .from(professionals)
      .where(like(professionals.id, `${P}%`)),
  };
}
async function openSelection() {
  return database
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.professionalId, `${P}-pro-a`),
        eq(conversations.status, "open"),
      ),
    );
}
async function failRevocation() {
  await database.run(
    sql.raw(
      `CREATE TRIGGER fixture_close_fail BEFORE UPDATE OF revoked_at ON seeker_sessions WHEN NEW.conversation_id='${roomId}' BEGIN SELECT RAISE(ABORT,'fixture-revocation-failure'); END`,
    ),
  );
}
async function assertClosed(before: Awaited<ReturnType<typeof snapshot>>) {
  const after = await snapshot();
  expect(after.rooms.find((row) => row.id === roomId)).toMatchObject({
    status: "closed",
    closedReason: "case_closed",
    closedAt: timestamp,
    updatedAt: timestamp,
  });
  expect(after.rooms.find((row) => row.id !== roomId)).toEqual(
    before.rooms.find((row) => row.id !== roomId),
  );
  expect(after.pros).toEqual(before.pros);
  expect(after.sessions).toHaveLength(before.sessions.length);
  for (const prior of before.sessions) {
    const expected =
      prior.conversationId === roomId && !prior.revokedAt
        ? revokedAt
        : prior.revokedAt;
    expect(after.sessions.find((row) => row.sid === prior.sid)).toEqual({
      ...prior,
      revokedAt: expected,
    });
  }
}

describe.each([
  "libSQL",
  "D1",
] as const)("cierre de conversación con %s real", (driver) => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv("NIDO_DB_TARGET", driver === "D1" ? "cloudflare" : "");
    ({ db: database } = await import("@/db"));
    ({ closeConversations: close } = await import("@/lib/assignment"));
    await cleanup();
    mocks.disconnect.mockClear();
    for (const suffix of ["a", "b"]) {
      await database.insert(user).values({
        id: `${P}-user-${suffix}`,
        name: "Profesional ficticio",
        email: `${P}-${suffix}@example.test`,
      });
      await database.insert(professionals).values({
        id: `${P}-pro-${suffix}`,
        userId: `${P}-user-${suffix}`,
        email: `${P}-${suffix}@example.test`,
        fullName: "Profesional ficticio",
        languages: "[]",
        supportAreas: "[]",
        status: "approved",
        currentActiveRequests: 1,
        cryptoPublicKey: "fixture-public-key",
        createdAt: created,
        updatedAt: created,
      });
      await database.insert(conversations).values({
        id: `${P}-room-${suffix}`,
        professionalId: `${P}-pro-${suffix}`,
        seekerSid: `${P}-browser-${suffix}`,
        createdAt: created,
        updatedAt: created,
      });
    }
    await database.insert(seekerSessions).values([
      ...["browser-a", "second-browser", "link", "previously-revoked"].map(
        (suffix) => ({
          sid: `${P}-${suffix}`,
          conversationId: roomId,
          role: suffix === "link" ? "access-link" : "seeker",
          issuedAt: new Date(created),
          expiresAt: new Date(Date.now() + 3600000),
          revokedAt: suffix === "previously-revoked" ? new Date(created) : null,
        }),
      ),
      {
        sid: `${P}-browser-b`,
        conversationId: `${P}-room-b`,
        role: "seeker",
        issuedAt: new Date(created),
        expiresAt: new Date(Date.now() + 3600000),
      },
    ]);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("un fallo de revocación no deja cerrado el chat con grants vivos", async () => {
    const before = await snapshot();
    await failRevocation();
    await expect(
      close(await openSelection(), timestamp, revokedAt),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("la selección abierta del caller puede reintentar después del fallo", async () => {
    const before = await snapshot();
    await failRevocation();
    await expect(
      close(await openSelection(), timestamp, revokedAt),
    ).rejects.toThrow();
    await database.run(sql.raw("DROP TRIGGER fixture_close_fail"));
    expect(await close(await openSelection(), timestamp, revokedAt)).toBe(1);
    await assertClosed(before);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("repetir un cierre conserva motivo, versión y revocaciones previas", async () => {
    const before = await snapshot();
    expect(await close([{ id: roomId }], timestamp, revokedAt)).toBe(1);
    await assertClosed(before);
    const first = await snapshot();
    expect(await close([{ id: roomId }], later, new Date(later), "admin")).toBe(
      0,
    );
    expect(await snapshot()).toEqual(first);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("una selección obsoleta no convierte un cierre por inactividad en otro cierre", async () => {
    const selected = await openSelection();
    await database
      .update(conversations)
      .set({
        status: "closed",
        closedReason: "inactivity",
        closedAt: later,
        updatedAt: later,
      })
      .where(eq(conversations.id, roomId));
    const before = await snapshot();
    expect(await close(selected, timestamp, revokedAt)).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("cuenta una sola transición para IDs repetidos o inexistentes", async () => {
    const before = await snapshot();
    expect(
      await close(
        [{ id: roomId }, { id: roomId }, { id: `${P}-missing` }],
        timestamp,
        revokedAt,
      ),
    ).toBe(1);
    await assertClosed(before);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("la inactividad conserva permisos y claves publicadas de ambos participantes", async () => {
    const before = await snapshot();
    expect(
      await close([{ id: roomId }], timestamp, revokedAt, "inactivity"),
    ).toBe(1);
    const after = await snapshot();
    expect(after.sessions).toEqual(before.sessions);
    expect(after.pros).toEqual(before.pros);
    expect(after.rooms.find((row) => row.id === roomId)).toMatchObject({
      status: "closed",
      closedReason: "inactivity",
    });
  });

  it("límite del contrato: el ID no distingue una reapertura anterior a la entrada", async () => {
    const selectionBefore = await openSelection();
    await database
      .update(conversations)
      .set({
        status: "closed",
        closedReason: "inactivity",
        closedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(conversations.id, roomId));
    await database
      .update(conversations)
      .set({
        status: "open",
        closedReason: null,
        closedAt: null,
        reopenedAt: new Date(later),
        updatedAt: later,
      })
      .where(eq(conversations.id, roomId));
    // Ambos argumentos son idénticos: el helper no recibe la versión histórica
    // ni el actor del caller. Este caso documenta el límite, no su resolución.
    expect(selectionBefore).toEqual(await openSelection());
    expect(await close(selectionBefore, timestamp, revokedAt)).toBe(1);
    const row = (await snapshot()).rooms.find((room) => room.id === roomId);
    expect(row).toMatchObject({
      status: "closed",
      closedReason: "case_closed",
      reopenedAt: new Date(later),
    });
    expect(Date.parse(row?.updatedAt || "")).toBe(Date.parse(later) + 1);
  });

  it("el cierre avanza la versión aunque el timestamp del caller sea anterior", async () => {
    await database
      .update(conversations)
      .set({ updatedAt: later })
      .where(eq(conversations.id, roomId));
    expect(await close([{ id: roomId }], timestamp, revokedAt)).toBe(1);
    const row = (await snapshot()).rooms.find((room) => room.id === roomId);
    expect(Date.parse(row?.updatedAt || "")).toBe(Date.parse(later) + 1);
    expect(row?.closedAt).toBe(row?.updatedAt);
  });

  it.each([
    "version",
    "professional",
    "seeker",
    "trash",
  ] as const)("un cambio de $0 tras leer no cierra ni revoca el estado nuevo", async (change) => {
    const find = database.query.conversations.findFirst.bind(
      database.query.conversations,
    );
    let changed = false;
    let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
    vi.spyOn(database.query.conversations, "findFirst").mockImplementation(
      (query) => {
        const read = find(query),
          execute = read.execute.bind(read);
        vi.spyOn(read, "execute").mockImplementation(async () => {
          const row = await execute();
          if (!changed && row?.id === roomId) {
            changed = true;
            const values =
              change === "version"
                ? { updatedAt: later }
                : change === "professional"
                  ? { professionalId: `${P}-pro-b` }
                  : change === "seeker"
                    ? { seekerSid: `${P}-new-participant` }
                    : { deletedAt: new Date(later) };
            await database
              .update(conversations)
              .set(values)
              .where(eq(conversations.id, roomId));
            expected = await snapshot();
          }
          return row;
        });
        return read;
      },
    );
    await expect(close([{ id: roomId }], timestamp, revokedAt)).rejects.toThrow(
      "El chat cambió",
    );
    expect(changed).toBe(true);
    expect(expected).toBeDefined();
    expect(await snapshot()).toEqual(expected);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("un cierre ganador durante la lectura conserva su motivo y no se revoca dos veces", async () => {
    const find = database.query.conversations.findFirst.bind(
      database.query.conversations,
    );
    let changed = false;
    let expected: Awaited<ReturnType<typeof snapshot>> | undefined;
    vi.spyOn(database.query.conversations, "findFirst").mockImplementation(
      (query) => {
        const read = find(query),
          execute = read.execute.bind(read);
        vi.spyOn(read, "execute").mockImplementation(async () => {
          const row = await execute();
          if (!changed && row?.id === roomId) {
            changed = true;
            await database.batch([
              database
                .update(conversations)
                .set({
                  status: "closed",
                  closedReason: "seeker",
                  closedAt: later,
                  updatedAt: later,
                })
                .where(eq(conversations.id, roomId)),
              database
                .update(seekerSessions)
                .set({ revokedAt: new Date(later) })
                .where(
                  and(
                    eq(seekerSessions.conversationId, roomId),
                    sql`${seekerSessions.revokedAt} IS NULL`,
                  ),
                ),
            ]);
            expected = await snapshot();
          }
          return row;
        });
        return read;
      },
    );
    expect(await close([{ id: roomId }], timestamp, revokedAt)).toBe(0);
    expect(changed).toBe(true);
    expect(expected).toBeDefined();
    expect(await snapshot()).toEqual(expected);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it("dos cierres que leyeron la misma versión tienen un solo ganador", async () => {
    const find = database.query.conversations.findFirst.bind(
      database.query.conversations,
    );
    let reads = 0;
    let unblock!: () => void;
    const both = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    vi.spyOn(database.query.conversations, "findFirst").mockImplementation(
      (query) => {
        const read = find(query),
          execute = read.execute.bind(read);
        vi.spyOn(read, "execute").mockImplementation(async () => {
          const row = await execute();
          if (++reads === 2) unblock();
          if (reads <= 2) await both;
          return row;
        });
        return read;
      },
    );
    const counts = await Promise.all([
      close([{ id: roomId }], timestamp, revokedAt),
      close([{ id: roomId }], later, new Date(later), "admin"),
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    const row = (await snapshot()).rooms.find((room) => room.id === roomId);
    expect(row?.closedReason).toBe(counts[0] ? "case_closed" : "admin");
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
