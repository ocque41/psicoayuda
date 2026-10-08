import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { eq, inArray, like, sql } from "drizzle-orm";
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
  practiceCredentials,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";

const fixture = vi.hoisted(() => ({
  d1: null as D1Database | null,
  session: vi.fn(),
  fpv: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: fixture.d1 } }),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: fixture.session }));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: fixture.signOut } } }));
vi.mock("@/lib/fpv", () => ({ verifyFpvByCedula: fixture.fpv }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers(),
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
  throw new Error("Requiere la base temporal de test:isolated.");
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
  d1Databases: { DB: "onboarding-new-profile-fixture" },
});
const P = "fixture-onboarding-new-profile";
const id = {
  owner: `${P}-owner`,
  session: `${P}-session`,
  other: `${P}-other`,
  otherPro: `${P}-other-pro`,
};
const stamp = "2000-01-01T00:00:00.000Z";
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
  await database.run(
    sql.raw("DROP TRIGGER IF EXISTS fixture_onboarding_batch_fail"),
  );
  const profiles = await database
    .select({ id: professionals.id })
    .from(professionals)
    .where(inArray(professionals.userId, [id.owner, id.other]));
  for (const p of profiles) {
    await database
      .delete(practiceCredentials)
      .where(eq(practiceCredentials.professionalId, p.id));
    await database
      .delete(practiceSettings)
      .where(eq(practiceSettings.professionalId, p.id));
    await database.delete(professionals).where(eq(professionals.id, p.id));
  }
  await database
    .delete(accountOnboardingDrafts)
    .where(inArray(accountOnboardingDrafts.userId, [id.owner, id.other]));
  await database
    .delete(accountRolePreferences)
    .where(inArray(accountRolePreferences.userId, [id.owner, id.other]));
  await database.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await database.delete(authSessions).where(eq(authSessions.id, id.session));
  await database.delete(user).where(inArray(user.id, [id.owner, id.other]));
}
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [k, v] of Object.entries({
    expectedOwnerId: id.owner,
    fullName: "Auxiliar enteramente ficticio",
    nonClinicalHelper: "on",
    emailPublic: "on",
    supportAreas: "orientacion_general",
    conductFreeService: "on",
    conductNoClientCapture: "on",
    conductConfidentiality: "on",
    conductNoEmergencyGuarantee: "on",
    conductCompetence: "on",
    ...extra,
  }))
    data.set(k, v);
  return data;
}
async function profile() {
  return database.query.professionals.findFirst({
    where: eq(professionals.userId, id.owner),
  });
}
async function memory() {
  return database
    .select()
    .from(accountOnboardingDrafts)
    .where(eq(accountOnboardingDrafts.userId, id.owner));
}
async function otherState() {
  return {
    profile: await database.query.professionals.findFirst({
      where: eq(professionals.id, id.otherPro),
    }),
    settings: await database.query.practiceSettings.findFirst({
      where: eq(practiceSettings.professionalId, id.otherPro),
    }),
    scopes: await database
      .select()
      .from(practiceCredentials)
      .where(eq(practiceCredentials.professionalId, id.otherPro)),
  };
}
async function complete(data: FormData) {
  const { saveProfessionalOnboarding } = await import("@/app/actions");
  await expect(saveProfessionalOnboarding(null, data)).rejects.toThrow(
    "fixture-redirect:/pro/dashboard",
  );
  const p = await profile();
  if (!p) throw new Error("No se admitió el control válido");
  expect(p.status).toBe("pending_verification");
  expect(
    await database
      .select()
      .from(practiceCredentials)
      .where(eq(practiceCredentials.professionalId, p.id)),
  ).toEqual([]);
  expect((await memory()).map((d) => d.role)).toEqual(["patient"]);
  return p;
}
async function deleteSelf() {
  const { deleteMyAccount } = await import("@/app/actions-account");
  await expect(
    deleteMyAccount({ error: null }, new FormData()),
  ).rejects.toThrow("fixture-redirect:/entrar?cuenta=borrada");
}
function beforeNewProfileBatch(callback: () => Promise<void>) {
  const real = database.batch.bind(database);
  let seen = false;
  vi.spyOn(database, "batch").mockImplementation(async (queries) => {
    const statements = queries.map((q) =>
      "toSQL" in q ? (q as { toSQL(): { sql: string } }).toSQL().sql : "",
    );
    if (
      !seen &&
      statements.some((q) => /^insert into "professionals"\s/i.test(q))
    ) {
      seen = true;
      await callback();
    }
    return real(queries);
  });
  return () => seen;
}

describe.each([
  { driver: "libSQL", foreignKeys: 0 },
  { driver: "libSQL", foreignKeys: 1 },
  { driver: "D1", foreignKeys: 1 },
] as const)("alta profesional nueva con $driver FK$foreignKeys", ({
  driver,
  foreignKeys,
}) => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.stubEnv("NIDO_DB_TARGET", driver === "D1" ? "cloudflare" : "");
    vi.stubEnv("ADMIN_EMAILS", "");
    ({ db: database } = await import("@/db"));
    await database.run(sql.raw(`PRAGMA foreign_keys=${foreignKeys}`));
    expect(await database.values(sql`PRAGMA foreign_keys`)).toEqual([
      [foreignKeys],
    ]);
    await cleanup();
    fixture.fpv.mockReset();
    fixture.signOut.mockClear();
    await database.insert(user).values([
      {
        id: id.owner,
        name: "Persona ficticia",
        email: `${id.owner}@example.test`,
        emailVerified: true,
      },
      {
        id: id.other,
        name: "Otra persona ficticia",
        email: `${id.other}@example.test`,
      },
    ]);
    await database.insert(authSessions).values({
      id: id.session,
      userId: id.owner,
      token: `${P}-token-ficticio`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    fixture.session.mockResolvedValue({
      user: {
        id: id.owner,
        email: `${id.owner}@example.test`,
        emailVerified: true,
      },
      session: { id: id.session, expiresAt: new Date(Date.now() + 3600000) },
    });
    await database.insert(accountOnboardingDrafts).values(
      ["pro", "patient"].map((role) => ({
        userId: id.owner,
        role,
        answersJson: JSON.stringify({
          displayName: `Memoria ficticia ${role}`,
        }),
        createdAt: stamp,
        updatedAt: stamp,
        expiresAt: "2099-01-01T00:00:00.000Z",
      })),
    );
    await database
      .insert(accountRolePreferences)
      .values({ userId: id.owner, role: "patient", updatedAt: stamp });
    await database.insert(professionals).values({
      id: id.otherPro,
      userId: id.other,
      email: `${id.other}@example.test`,
      fullName: "Profesional ajeno ficticio",
      languages: '["es"]',
      supportAreas: '["orientacion_general"]',
      status: "approved",
      createdAt: stamp,
      updatedAt: stamp,
    });
    await database.insert(practiceSettings).values({
      professionalId: id.otherPro,
      timeZone: "Europe/Madrid",
      workStart: 8,
      workEnd: 17,
      updatedAt: stamp,
    });
    await database.insert(practiceCredentials).values({
      id: `${P}-scope`,
      professionalId: id.otherPro,
      patientCountry: "España",
      registryReference: "Referencia ficticia ajena",
      reviewedBy: "revisor-ficticio@example.test",
      reviewedAt: stamp,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
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

  it("conserva defaults, ausencia de permisos, el otro recorrido y datos ajenos", async () => {
    const before = await otherState();
    const p = await complete(form());
    expect(p).toMatchObject({
      email: `${id.owner}@example.test`,
      nonClinicalHelper: true,
      emailPublic: true,
      remoteAvailable: false,
      inPersonAvailable: false,
      crisisExperience: false,
      offersPaidServices: false,
      acceptingRequests: false,
      maxActiveRequests: 3,
      currentActiveRequests: 0,
      credentialConfirmed: false,
      fpvVerified: false,
      fpvVerifiedAt: null,
      fpvSnapshot: null,
      responseSampleSize: 0,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      photo: null,
      registrationProofDoc: null,
      cryptoPublicKey: null,
      languages: '["es"]',
      supportAreas: '["orientacion_general"]',
    });
    expect(p.createdAt).toBe(p.updatedAt);
    expect(p.conductAcceptedAt).toBe(p.updatedAt);
    expect(
      await database.query.practiceSettings.findFirst({
        where: eq(practiceSettings.professionalId, p.id),
      }),
    ).toBeUndefined();
    expect(
      await database.query.accountRolePreferences.findFirst({
        where: eq(accountRolePreferences.userId, id.owner),
      }),
    ).toMatchObject({ role: "patient", updatedAt: stamp });
    expect(await otherState()).toEqual(before);
    expect(fixture.fpv).not.toHaveBeenCalled();
  });
  if (driver === "D1") {
    it("D1 mantiene FK1 al solicitar OFF en su transacción implícita", async () => {
      await database.run(sql`PRAGMA foreign_keys=OFF`);
      const observed = await database.values(sql`PRAGMA foreign_keys`);
      console.info("onboarding-d1-fk-off-control", { requested: 0, observed });
      expect(observed).toEqual([[1]]);
    });
  }
  if (foreignKeys === 0) {
    it("un alta rechazada no limpia borradores remanentes con FK0", async () => {
      let remnant: Awaited<ReturnType<typeof memory>> = [];
      beforeNewProfileBatch(async () => {
        await deleteSelf();
        // Estado corrupto ficticio permitido por FK0, no una capacidad de UI.
        await database.insert(accountOnboardingDrafts).values(
          ["pro", "patient"].map((role) => ({
            userId: id.owner,
            role,
            answersJson: '{"displayName":"Remanente ficticio"}',
            createdAt: stamp,
            updatedAt: stamp,
            expiresAt: "2099-01-01T00:00:00.000Z",
          })),
        );
        remnant = await memory();
      });
      const { saveProfessionalOnboarding } = await import("@/app/actions");
      expect(await saveProfessionalOnboarding(null, form())).toMatchObject({
        ok: false,
      });
      expect(await profile()).toBeUndefined();
      expect(await memory()).toEqual(remnant);
    });
  }
  it("conserva comprobante, valores de contacto y horario al admitir el registro", async () => {
    const proof = "data:application/pdf;base64,UEZERklDVElDSU8=";
    const p = await complete(
      form({
        nonClinicalHelper: "",
        country: "Canadá",
        city: "Ciudad ficticia",
        university: "Universidad ficticia",
        registrationType: "colegio_psicologos",
        registrationDetail: "Referencia enteramente ficticia",
        registrationProofDoc: proof,
        timezone: "America/Toronto",
        displayName: "Alias ficticio",
        contactEmail: "coordinacion-ficticia@example.test",
        shortBio: "Presentación enteramente ficticia",
        remoteAvailable: "on",
        acceptingRequests: "on",
        maxActiveRequests: "5",
      }),
    );
    expect(p).toMatchObject({
      nonClinicalHelper: false,
      country: "Canadá",
      city: "Ciudad ficticia",
      displayName: "Alias ficticio",
      registrationType: "colegio_psicologos",
      registrationDetail: "Referencia enteramente ficticia",
      registrationProofDoc: proof,
      contactEmail: "coordinacion-ficticia@example.test",
      shortBio: "Presentación enteramente ficticia",
      remoteAvailable: true,
      acceptingRequests: true,
      maxActiveRequests: 5,
    });
    expect(
      await database.query.practiceSettings.findFirst({
        where: eq(practiceSettings.professionalId, p.id),
      }),
    ).toMatchObject({
      timeZone: "America/Toronto",
      workStart: 9,
      workEnd: 18,
      updatedAt: p.updatedAt,
    });
  });
  it.each([
    false,
    true,
  ])("conserva tipos FPV simulados match=%s sin aprobación automática", async (match) => {
    const result = { match, source: "fixture-local", number: "FPV-FICTICIA" };
    fixture.fpv.mockResolvedValue(result);
    const p = await complete(
      form({
        nonClinicalHelper: "",
        country: "Venezuela",
        university: "Universidad ficticia",
        fpvNumber: "FPV-FICTICIA",
        cedula: "V-99999999",
        timezone: "America/Caracas",
      }),
    );
    expect(fixture.fpv).toHaveBeenCalledOnce();
    expect(p.fpvVerified).toBe(match);
    expect(JSON.parse(p.fpvSnapshot || "null")).toEqual(result);
    if (match) expect(p.fpvVerifiedAt).toBeInstanceOf(Date);
    else expect(p.fpvVerifiedAt).toBeNull();
    expect(p.credentialConfirmed).toBe(false);
  });
  it("rechaza amablemente el INSERT retenido después de una baja real completa", async () => {
    const other = await otherState();
    const wasPaused = beforeNewProfileBatch(async () => {
      expect(await profile()).toBeUndefined();
      await deleteSelf();
      expect(
        await database.query.user.findFirst({ where: eq(user.id, id.owner) }),
      ).toBeUndefined();
      expect(
        await database
          .select()
          .from(auditLogs)
          .where(
            sql`${auditLogs.entityId}=${id.owner} AND ${auditLogs.action}='account_unprofiled_deletion_completed'`,
          ),
      ).toHaveLength(1);
    });
    const { saveProfessionalOnboarding } = await import("@/app/actions");
    let result: unknown,
      error = "";
    try {
      result = await saveProfessionalOnboarding(
        null,
        form({ timezone: "America/Toronto" }),
      );
    } catch (e) {
      error = String(e);
    }
    const p = await profile();
    const settings = await database
      .select()
      .from(practiceSettings)
      .where(sql`${practiceSettings.professionalId}!=${id.otherPro}`);
    console.info("onboarding-postbatch-causal", {
      driver,
      foreignKeys,
      paused: wasPaused(),
      result,
      error,
      userAbsent: !(await database.query.user.findFirst({
        where: eq(user.id, id.owner),
      })),
      profileAbsent: !p,
      settingsRows: settings.length,
    });
    expect(wasPaused()).toBe(true);
    expect(error).toBe("");
    expect(result).toMatchObject({ ok: false, message: expect.any(String) });
    expect(p).toBeUndefined();
    expect(settings).toEqual([]);
    expect(await memory()).toEqual([]);
    expect(await otherState()).toEqual(other);
    expect(fixture.signOut).toHaveBeenCalledOnce();
  });
  it("revierte perfil y horario si falla la limpieza final del borrador, y permite reintentar", async () => {
    const drafts = await memory(),
      other = await otherState();
    await database.run(
      sql.raw(
        `CREATE TRIGGER fixture_onboarding_batch_fail BEFORE DELETE ON account_onboarding_drafts WHEN OLD.user_id='${id.owner}' AND OLD.role='pro' BEGIN SELECT RAISE(ABORT,'fixture-onboarding-rollback'); END`,
      ),
    );
    const { saveProfessionalOnboarding } = await import("@/app/actions");
    await expect(
      saveProfessionalOnboarding(null, form({ timezone: "America/Toronto" })),
    ).rejects.toThrow(/fixture-onboarding-rollback/);
    expect(await profile()).toBeUndefined();
    expect(await memory()).toEqual(drafts);
    expect(await otherState()).toEqual(other);
    expect(
      await database
        .select()
        .from(practiceSettings)
        .where(sql`${practiceSettings.professionalId}!=${id.otherPro}`),
    ).toEqual([]);
    await database.run(sql.raw("DROP TRIGGER fixture_onboarding_batch_fail"));
    await complete(form({ timezone: "America/Toronto" }));
  });
});
