import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const previousTarget = process.env.NIDO_DB_TARGET;
  process.env.NIDO_DB_TARGET = "cloudflare";
  return {
    database: null as D1Database | null,
    setCookie: vi.fn(),
    previousTarget,
  };
});
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: mocks.database } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: mocks.setCookie }),
  headers: async () => new Headers({ "cf-connecting-ip": "192.0.2.88" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`fixture-redirect:${path}`);
  },
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => ({
    user: { id: "fixture-d1-user", email: "fixture-d1@example.test" },
    session: {
      id: "fixture-d1-auth",
      expiresAt: new Date(Date.now() + 3600000),
    },
  }),
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: async () => true,
}));
vi.mock("@/lib/notifications", () => ({
  notifyConversationReopened: async () => undefined,
  notifyConversationDeleted: async () => undefined,
  conversationUrl: (id: string) => `https://nido.example/c/${id}`,
}));
vi.mock("@/lib/patient/access", () => ({
  linkPatientConversation: async () => true,
}));

const url = process.env.DATABASE_URL;
if (!url?.includes("nido-tests-"))
  throw new Error("Esta prueba requiere test:isolated.");
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
  d1Databases: { DB: "chat-integrity-fixture" },
});
let database: D1Database;

import { createConversation } from "@/app/actions-chat";
import { reopenConversation } from "@/app/c/[conversationId]/actions";
import { getAuthSecret } from "@/lib/auth-secret";
import { createSeekerAccessLink } from "@/lib/seeker-access";
import { exchangeSeekerAccess } from "@/lib/seeker-access-session";
import { verifySeekerAccessToken } from "@/lib/seeker-token";

const timestamp = new Date().toISOString();
async function aggregate() {
  return (await database
    .prepare(
      "SELECT (SELECT count(*) FROM conversations) AS threads,(SELECT count(*) FROM seeker_sessions) AS sessions,(SELECT current_active_requests FROM professionals WHERE id='fixture-d1-pro') AS quota,(SELECT count(*) FROM audit_logs) AS audits",
    )
    .first()) as {
    threads: number;
    sessions: number;
    quota: number;
    audits: number;
  };
}
function form() {
  const data = new FormData();
  data.set("professionalId", "fixture-d1-pro");
  return data;
}
describe("chat: driver D1 del proyecto con SQLite real en workerd", () => {
  beforeAll(async () => {
    database = await runtime.getD1Database("DB");
    mocks.database = database;
    const names = [
      "user",
      "session",
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
      await database.prepare(String(row.sql)).run();
    await database.batch([
      database
        .prepare(
          "INSERT INTO user(id,name,email,created_at,updated_at) VALUES ('fixture-d1-user','Cuenta ficticia','fixture-d1@example.test',?,?)",
        )
        .bind(Date.now(), Date.now()),
      database
        .prepare(
          "INSERT INTO professionals(id,user_id,email,full_name,languages,support_areas,status,max_active_requests,accepting_requests,remote_available,created_at,updated_at) VALUES ('fixture-d1-pro','fixture-d1-user','fixture-d1@example.test','Profesional ficticio','[]','[]','approved',10,1,1,?,?)",
        )
        .bind(timestamp, timestamp),
      database
        .prepare(
          "INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES ('fixture-d1-auth','fixture-d1-user','fixture-d1-token',?,?,?)",
        )
        .bind(Date.now() + 3600000, Date.now(), Date.now()),
    ]);
  }, 30000);
  afterAll(async () => {
    if (mocks.previousTarget === undefined)
      delete (process.env as Record<string, string | undefined>).NIDO_DB_TARGET;
    else process.env.NIDO_DB_TARGET = mocks.previousTarget;
    await runtime.dispose();
    local.close();
  });
  it("batch de acción directa revierte fallo en última sentencia y reintenta sin huérfanos", async () => {
    await database
      .prepare(
        "CREATE TRIGGER fixture_d1_fail_session BEFORE INSERT ON seeker_sessions BEGIN SELECT RAISE(ABORT,'fixture'); END",
      )
      .run();
    await expect(createConversation(form())).rejects.toThrow();
    expect(await aggregate()).toEqual({
      threads: 0,
      sessions: 0,
      quota: 0,
      audits: 0,
    });
    expect(mocks.setCookie).not.toHaveBeenCalled();
    await database.prepare("DROP TRIGGER fixture_d1_fail_session").run();
    await expect(createConversation(form())).rejects.toThrow(
      "fixture-redirect:/c/",
    );
    expect(await aggregate()).toEqual({
      threads: 1,
      sessions: 1,
      quota: 1,
      audits: 0,
    });
    expect(mocks.setCookie).toHaveBeenCalledTimes(1);
  }, 30000);
  it("reapertura D1 revierte también escrituras anteriores ante fallo de audit; retry confirma una sola vez", async () => {
    await database.batch([
      database
        .prepare(
          "INSERT INTO conversations(id,professional_id,seeker_sid,status,closed_at,created_at,updated_at) VALUES ('fixture-d1-closed','fixture-d1-pro','fixture-d1-sid','closed',?,?,?)",
        )
        .bind(timestamp, timestamp, timestamp),
      database.prepare(
        "CREATE TRIGGER fixture_d1_fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture'); END",
      ),
    ]);
    expect(await reopenConversation("fixture-d1-closed")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect((await aggregate()).quota).toBe(1);
    expect(
      await database
        .prepare(
          "SELECT status FROM conversations WHERE id='fixture-d1-closed'",
        )
        .first("status"),
    ).toBe("closed");
    await database.prepare("DROP TRIGGER fixture_d1_fail_audit").run();
    expect(await reopenConversation("fixture-d1-closed")).toEqual({
      ok: true,
      role: "professional",
    });
    expect((await aggregate()).quota).toBe(2);
    expect((await aggregate()).audits).toBe(1);
    expect(await reopenConversation("fixture-d1-closed")).toEqual({
      ok: false,
      reason: "not_closed",
    });
    expect((await aggregate()).quota).toBe(2);
  }, 30000);
  it("intercambio aditivo del enlace registra sólo SIDs propios en driver D1 real", async () => {
    const room = "fixture-d1-access";
    await database
      .prepare(
        "INSERT INTO conversations(id,professional_id,seeker_sid,status,created_at,updated_at) VALUES (?, 'fixture-d1-pro', 'fixture-origin', 'open', ?, ?)",
      )
      .bind(room, timestamp, timestamp)
      .run();
    const link = await createSeekerAccessLink({ conversationId: room });
    const payload = verifySeekerAccessToken(
      link.token,
      getAuthSecret(),
      Date.now(),
    );
    if (!payload) throw new Error("Sin enlace ficticio");
    const a = await exchangeSeekerAccess(payload, null),
      b = await exchangeSeekerAccess(payload, null);
    expect(a?.sid).not.toBe(b?.sid);
    expect(a?.sid).not.toBe(link.sid);
    expect(a?.purpose).toBe("browser");
    if (!a || !b) throw new Error("Sin navegadores ficticios");
    await database
      .prepare("UPDATE seeker_sessions SET revoked_at=? WHERE sid=?")
      .bind(Date.now(), a.sid)
      .run();
    expect(await exchangeSeekerAccess(payload, a)).toBeNull();
    expect((await exchangeSeekerAccess(payload, b))?.sid).toBe(b.sid);
    const source = await database
      .prepare("SELECT role,revoked_at FROM seeker_sessions WHERE sid=?")
      .bind(link.sid)
      .first();
    expect(source?.role).toBe("access-link");
    expect(source?.revoked_at).toBeNull();
    await database
      .prepare("UPDATE seeker_sessions SET revoked_at=? WHERE sid=?")
      .bind(Date.now(), link.sid)
      .run();
    expect(await exchangeSeekerAccess(payload, null)).toBeNull();
    expect(await exchangeSeekerAccess(payload, b)).toBeNull();
    // Revocar el enlace sólo impide nuevos intercambios; el navegador existente
    // mantiene su propio permiso hasta salir/caducar, sin UPDATE sobre su fila.
    const survivor = await database
      .prepare("SELECT role,revoked_at FROM seeker_sessions WHERE sid=?")
      .bind(b.sid)
      .first();
    expect(survivor?.role).toBe("seeker");
    expect(survivor?.revoked_at).toBeNull();
  });
});
