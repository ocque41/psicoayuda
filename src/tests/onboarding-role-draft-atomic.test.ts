import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { eq, inArray, like, sql } from "drizzle-orm";
import {
  type AnySQLiteInsert,
  SQLiteInsertBase,
} from "drizzle-orm/sqlite-core/query-builders/insert";
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
  accountOnboardingDrafts,
  accountRolePreferences,
  auditLogs,
  session as authSessions,
  professionals,
  user,
} from "@/db/schema";

const fixture = vi.hoisted(() => ({
  d1: null as D1Database | null,
  session: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: fixture.d1 } }),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: fixture.session }));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: fixture.signOut } } }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (f: unknown) => f,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`fixture-redirect:${path}`);
  },
}));
const url = process.env.DATABASE_URL || "";
if (!url.startsWith("file:") || !url.includes("nido-tests-"))
  throw Error("Requiere test:isolated y su SQLite temporal.");
const local = createClient({ url }),
  require = createRequire(import.meta.url),
  wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
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
  d1Databases: { DB: "onboarding-role-draft-fixture" },
});
const P = "fixture-onboarding-role-draft",
  A = `${P}-a`,
  B = `${P}-b`,
  SID = `${P}-session`,
  old = "2000-01-01T00:00:00.000Z",
  future = "2099-01-01T00:00:00.000Z";
let database: typeof import("@/db").db;
beforeAll(async () => {
  fixture.d1 = await runtime.getD1Database("DB");
  const schema = await local.execute(
    "SELECT sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END",
  );
  for (const row of schema.rows)
    await fixture.d1.prepare(String(row.sql)).run();
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  await runtime.dispose();
  local.close();
});
async function cleanup() {
  await database.run(sql.raw("DROP TRIGGER IF EXISTS fixture_role_failure"));
  await database.run(sql.raw("DROP TRIGGER IF EXISTS fixture_draft_failure"));
  await database
    .delete(accountOnboardingDrafts)
    .where(inArray(accountOnboardingDrafts.userId, [A, B]));
  await database
    .delete(accountRolePreferences)
    .where(inArray(accountRolePreferences.userId, [A, B]));
  await database.delete(authSessions).where(eq(authSessions.id, SID));
  await database.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await database.delete(user).where(inArray(user.id, [A, B]));
}
async function actions() {
  return import("@/app/empezar/actions");
}
async function drafts() {
  return import("@/lib/onboarding/drafts");
}
function form(role: string) {
  const f = new FormData();
  f.set("role", role);
  f.set("userId", B);
  return f;
}
function owner(id = A) {
  fixture.session.mockResolvedValue({
    user: { id, email: `${id}@example.test`, emailVerified: true },
    session: { id: SID, expiresAt: new Date(Date.now() + 3600000) },
  });
}
async function choose(role: "patient" | "pro") {
  await expect(
    (await actions()).chooseAccountRole(null, form(role)),
  ).rejects.toThrow(
    `fixture-redirect:${role === "patient" ? "/empezar/paciente" : "/pro/onboarding"}`,
  );
}
async function rows(id = A) {
  return {
    roles: await database
      .select()
      .from(accountRolePreferences)
      .where(eq(accountRolePreferences.userId, id)),
    drafts: await database
      .select()
      .from(accountOnboardingDrafts)
      .where(eq(accountOnboardingDrafts.userId, id)),
    profiles: await database
      .select()
      .from(professionals)
      .where(eq(professionals.userId, id)),
  };
}
async function deleteSelf() {
  const { deleteMyAccount } = await import("@/app/actions-account");
  await expect(
    deleteMyAccount({ error: null }, new FormData()),
  ).rejects.toThrow("fixture-redirect:/entrar?cuenta=borrada");
  expect(
    await database.query.user.findFirst({ where: eq(user.id, A) }),
  ).toBeUndefined();
  expect(
    await database.query.session.findFirst({ where: eq(authSessions.id, SID) }),
  ).toBeUndefined();
  expect(
    await database
      .select()
      .from(auditLogs)
      .where(
        sql`${auditLogs.entityId}=${A} AND ${auditLogs.action}='account_unprofiled_deletion_completed'`,
      ),
  ).toHaveLength(1);
}
function beforeRole(callback: () => Promise<void>) {
  const real = SQLiteInsertBase.prototype.execute;
  let seen = false;
  vi.spyOn(SQLiteInsertBase.prototype, "execute").mockImplementation(
    async function (this: AnySQLiteInsert, ...args) {
      if (
        !seen &&
        /^insert into "account_role_preferences"\s/i.test(this.toSQL().sql)
      ) {
        seen = true;
        await callback();
      }
      return real.apply(this, args);
    },
  );
  return () => seen;
}
function beforeDraft(callback: () => Promise<void>) {
  const real = database.batch.bind(database);
  let seen = false;
  vi.spyOn(database, "batch").mockImplementation(async (queries) => {
    if (
      !seen &&
      queries.some(
        (q) =>
          "toSQL" in q &&
          /^insert into "account_onboarding_drafts"\s/i.test(
            (q as { toSQL(): { sql: string } }).toSQL().sql,
          ),
      )
    ) {
      seen = true;
      await callback();
    }
    return real(queries);
  });
  return () => seen;
}
async function outcome(call: () => Promise<unknown>) {
  let result: unknown,
    error = "";
  try {
    result = await call();
  } catch (e) {
    const messages: string[] = [];
    let cause: unknown = e;
    for (let depth = 0; cause && depth < 8; depth++) {
      messages.push(String(cause));
      cause =
        typeof cause === "object" && "cause" in cause ? cause.cause : null;
    }
    error = messages.join("\n");
  }
  return { result, error };
}

describe.each([
  { driver: "libSQL", fk: 0 },
  { driver: "libSQL", fk: 1 },
  { driver: "D1", fk: 1 },
] as const)("rol/borrador con $driver FK$fk", ({ driver, fk }) => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv("NIDO_DB_TARGET", driver === "D1" ? "cloudflare" : "");
    vi.stubEnv("ADMIN_EMAILS", "");
    ({ db: database } = await import("@/db"));
    await database.run(sql.raw(`PRAGMA foreign_keys=${fk}`));
    expect(await database.values(sql`PRAGMA foreign_keys`)).toEqual([[fk]]);
    await cleanup();
    fixture.signOut.mockClear();
    await database.insert(user).values(
      [A, B].map((id) => ({
        id,
        name: "Cuenta enteramente ficticia",
        email: `${id}@example.test`,
        emailVerified: true,
      })),
    );
    await database.insert(authSessions).values({
      id: SID,
      userId: A,
      token: `${P}-token-ficticio`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    owner();
    await choose("patient");
    for (const id of [A, B])
      for (const role of ["patient", "pro"] as const)
        await (await drafts()).persistOnboardingDraft(id, role, {
          displayName: `Memoria ficticia ${id} ${role}`,
          fullName: "Nombre ficticio",
        });
    await database
      .insert(accountRolePreferences)
      .values({ userId: B, role: "pro", updatedAt: old });
    expect(
      await database.values(
        sql`SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name='practice_appointments_calendar_revision'`,
      ),
    ).toEqual([[1]]);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
    await database.run(sql`PRAGMA foreign_keys=ON`);
  });
  it("inserta/upserta ambos roles sin conceder perfiles y sin tocar otra cuenta", async () => {
    const b = await rows(B),
      memory = (await rows()).drafts;
    await database
      .delete(accountRolePreferences)
      .where(eq(accountRolePreferences.userId, A));
    for (const role of ["pro", "patient"] as const) {
      const before = Date.now();
      await choose(role);
      const r = (await rows()).roles;
      expect(r).toHaveLength(1);
      expect(r[0].role).toBe(role);
      expect(Date.parse(r[0].updatedAt)).toBeGreaterThanOrEqual(before);
    }
    expect((await rows()).profiles).toEqual([]);
    expect((await rows()).drafts).toEqual(memory);
    expect(await rows(B)).toEqual(b);
  });
  it.each([
    "patient",
    "pro",
  ] as const)("%s: guarda sólo campos permitidos con TTL7d y preserva el otro recorrido", async (role) => {
    const b = await rows(B),
      other = (await rows()).drafts.filter((x) => x.role !== role);
    await database
      .delete(accountOnboardingDrafts)
      .where(
        sql`${accountOnboardingDrafts.userId}=${A} AND ${accountOnboardingDrafts.role}=${role}`,
      );
    const before = Date.now(),
      input = {
        userId: B,
        displayName: "Nombre ficticio",
        fullName: "Profesional ficticio",
        country: role === "patient" ? "CA" : "Canadá",
        timezone: "America/Toronto",
        step: 4,
        privacyAccepted: true,
        conductFreeService: true,
        licenseNumber: "NO_GUARDAR",
        cedula: "NO_GUARDAR",
        email: "ficticio@example.test",
        phone: "NO_GUARDAR",
        university: "NO_GUARDAR",
        photo: "NO_GUARDAR",
        registrationProofDoc: "NO_GUARDAR",
      };
    expect(
      await (await actions()).saveOnboardingDraft(role, input, A),
    ).toMatchObject({ ok: true });
    const after = Date.now(),
      r = (await rows()).drafts.find((x) => x.role === role);
    expect(r).toBeDefined();
    if (!r) throw Error("Fixture incompleta");
    expect(r.version).toBe(1);
    expect(r.createdAt).toBe(r.updatedAt);
    expect(Date.parse(r.expiresAt)).toBeGreaterThanOrEqual(
      before + 7 * 24 * 3600000,
    );
    expect(Date.parse(r.expiresAt)).toBeLessThanOrEqual(
      after + 7 * 24 * 3600000,
    );
    expect(JSON.parse(r.answersJson)).toEqual({
      displayName: "Nombre ficticio",
      ...(role === "pro" ? { fullName: "Profesional ficticio" } : {}),
      country: input.country,
      timezone: input.timezone,
      step: 4,
    });
    expect((await rows()).drafts.filter((x) => x.role !== role)).toEqual(other);
    expect(await rows(B)).toEqual(b);
  });
  it("el upsert vigente conserva createdAt/version y renueva updatedAt/TTL", async () => {
    await database
      .update(accountOnboardingDrafts)
      .set({ createdAt: old, updatedAt: old, version: 4, expiresAt: future })
      .where(
        sql`${accountOnboardingDrafts.userId}=${A} AND ${accountOnboardingDrafts.role}='patient'`,
      );
    expect(
      await (await actions()).saveOnboardingDraft(
        "patient",
        { displayName: "Respuesta ficticia actualizada" },
        A,
      ),
    ).toMatchObject({ ok: true });
    const r = (await rows()).drafts.find((x) => x.role === "patient");
    expect(r).toMatchObject({
      createdAt: old,
      version: 4,
      answersJson: '{"displayName":"Respuesta ficticia actualizada"}',
    });
    expect(r?.updatedAt).not.toBe(old);
    expect(r?.expiresAt).not.toBe(future);
  });
  it("reemplaza sólo el propio recorrido vencido sin limpiar el otro", async () => {
    await database
      .update(accountOnboardingDrafts)
      .set({ createdAt: old, updatedAt: old, version: 4, expiresAt: old })
      .where(eq(accountOnboardingDrafts.userId, A));
    const other = (await rows()).drafts.find((x) => x.role === "pro"),
      b = await rows(B);
    expect(
      await (await actions()).saveOnboardingDraft(
        "patient",
        { displayName: "Reintento ficticio" },
        A,
      ),
    ).toMatchObject({ ok: true });
    const r = (await rows()).drafts.find((x) => x.role === "patient");
    expect(r?.version).toBe(1);
    expect(r?.createdAt).not.toBe(old);
    expect(r?.createdAt).toBe(r?.updatedAt);
    expect((await rows()).drafts.find((x) => x.role === "pro")).toEqual(other);
    expect(await (await drafts()).readOnboardingDraft(A, "pro")).toEqual({});
    expect(await rows(B)).toEqual(b);
  });
  it.each([
    "patient",
    "pro",
  ] as const)("rol %s retenido tras baja real devuelve rechazo sin huérfanos", async (role) => {
    const b = await rows(B),
      held = beforeRole(deleteSelf),
      a = await actions(),
      late = await outcome(() => a.chooseAccountRole(null, form(role))),
      after = await rows();
    console.info("role-postbatch-causal", {
      driver,
      fk,
      role,
      held: held(),
      ...late,
      roles: after.roles.length,
      drafts: after.drafts.length,
    });
    expect(held()).toBe(true);
    expect(late.error).toBe("");
    expect(late.result).toMatchObject({
      ok: false,
      message: expect.any(String),
    });
    expect(after).toEqual({ roles: [], drafts: [], profiles: [] });
    expect(await rows(B)).toEqual(b);
  });
  it.each([
    "patient",
    "pro",
  ] as const)("draft %s retenido tras baja real no devuelve un éxito ficticio", async (role) => {
    const b = await rows(B),
      held = beforeDraft(deleteSelf),
      a = await actions(),
      late = await outcome(() =>
        a.saveOnboardingDraft(
          role,
          { displayName: "Respuesta tardía ficticia" },
          A,
        ),
      ),
      after = await rows();
    console.info("draft-postbatch-causal", {
      driver,
      fk,
      role,
      held: held(),
      ...late,
      roles: after.roles.length,
      drafts: after.drafts.length,
    });
    expect(held()).toBe(true);
    expect(late.error).toBe("");
    expect(late.result).toMatchObject({
      ok: false,
      message: expect.any(String),
    });
    expect(after).toEqual({ roles: [], drafts: [], profiles: [] });
    expect(await rows(B)).toEqual(b);
  });
  it("el helper rechaza directamente cero admisión tras la baja", async () => {
    beforeDraft(deleteSelf);
    const d = await drafts(),
      late = await outcome(() =>
        d.persistOnboardingDraft(A, "patient", {
          displayName: "Directo ficticio",
        }),
      );
    console.info("draft-helper-postbatch-causal", { driver, fk, ...late });
    expect(late.error).toBe("");
    expect(late.result).toBe(false);
    expect((await rows()).drafts).toEqual([]);
  });
  it("rechaza una cola A con sesión fresca B, y payload IDs no adoptan B", async () => {
    const b = await rows(B),
      a = await rows();
    owner(B);
    expect(
      await (await actions()).saveOnboardingDraft(
        "patient",
        { userId: A, displayName: "A tardío" },
        A,
      ),
    ).toMatchObject({ ok: false });
    expect(await rows(B)).toEqual(b);
    expect(await rows()).toEqual(a);
  });
  it("rollback del rol conserva preferencia y permite reintentar", async () => {
    const a = await rows(),
      b = await rows(B);
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_role_failure BEFORE UPDATE ON account_role_preferences WHEN NEW.user_id='${A}' BEGIN SELECT RAISE(ABORT,'fixture-role-rollback'); END`,
      ),
    );
    const aAction = await actions();
    const failed = await outcome(() =>
      aAction.chooseAccountRole(null, form("pro")),
    );
    expect(failed.error).toMatch(/fixture-role-rollback/);
    expect(await rows()).toEqual(a);
    expect(await rows(B)).toEqual(b);
    await database.run(sql.raw("DROP TRIGGER fixture_role_failure"));
    await choose("pro");
  });
  it("rollback de draft revierte cleanup y permite reintentar", async () => {
    await database
      .update(accountOnboardingDrafts)
      .set({ expiresAt: old })
      .where(
        sql`${accountOnboardingDrafts.userId}=${A} AND ${accountOnboardingDrafts.role}='patient'`,
      );
    const a = await rows(),
      b = await rows(B);
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_draft_failure BEFORE INSERT ON account_onboarding_drafts WHEN NEW.user_id='${A}' BEGIN SELECT RAISE(ABORT,'fixture-draft-rollback'); END`,
      ),
    );
    expect(
      await (await actions()).saveOnboardingDraft(
        "patient",
        { displayName: "Reintento ficticio" },
        A,
      ),
    ).toMatchObject({ ok: false });
    expect(await rows()).toEqual(a);
    expect(await rows(B)).toEqual(b);
    await database.run(sql.raw("DROP TRIGGER fixture_draft_failure"));
    expect(
      await (await actions()).saveOnboardingDraft(
        "patient",
        { displayName: "Reintento ficticio" },
        A,
      ),
    ).toMatchObject({ ok: true });
  });
  it("sin sesión o con entradas inválidas no escribe preferencias ni borradores", async () => {
    const a = await rows();
    fixture.session.mockResolvedValue(null);
    expect(
      await (await actions()).chooseAccountRole(null, form("pro")),
    ).toMatchObject({ ok: false });
    expect(
      await (await actions()).saveOnboardingDraft("patient", {}, A),
    ).toMatchObject({ ok: false });
    owner();
    expect(
      await (await actions()).chooseAccountRole(null, form("admin")),
    ).toMatchObject({ ok: false });
    expect(
      await (await actions()).saveOnboardingDraft(
        "invalid" as "patient",
        {},
        A,
      ),
    ).toMatchObject({ ok: false });
    expect(await rows()).toEqual(a);
  });
  if (driver === "D1")
    it("solicitar OFF mantiene FK1 real en D1", async () => {
      await database.run(sql`PRAGMA foreign_keys=OFF`);
      const observed = await database.values(sql`PRAGMA foreign_keys`);
      console.info("role-draft-d1-fk-off", { requested: 0, observed });
      expect(observed).toEqual([[1]]);
    });
  if (fk === 0)
    it("cero admisión conserva ambos borradores remanentes vencidos", async () => {
      let remnants: Awaited<ReturnType<typeof rows>>["drafts"] = [];
      beforeDraft(async () => {
        await deleteSelf();
        await database.insert(accountOnboardingDrafts).values(
          ["patient", "pro"].map((role) => ({
            userId: A,
            role,
            answersJson: '{"displayName":"Remanente ficticio vencido"}',
            createdAt: old,
            updatedAt: old,
            expiresAt: old,
          })),
        );
        remnants = (await rows()).drafts;
      });
      const a = await actions(),
        late = await outcome(() =>
          a.saveOnboardingDraft(
            "patient",
            { displayName: "Tardío ficticio" },
            A,
          ),
        ),
        after = (await rows()).drafts;
      console.info("draft-zero-cleanup-causal", {
        driver,
        fk,
        ...late,
        remnants: remnants.length,
        after: after.length,
      });
      expect(late.error).toBe("");
      expect(late.result).toMatchObject({ ok: false });
      expect(after).toEqual(remnants);
    });
});
