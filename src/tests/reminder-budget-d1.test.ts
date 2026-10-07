import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ database: null as D1Database | null }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { DB: context.database } }),
}));

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
const url = process.env.DATABASE_URL || "";
if (!url.startsWith("file:") || !url.includes("nido-tests-"))
  throw new Error("Requiere test:isolated y su esquema ficticio.");
const local = createClient({ url });
const runtime = new Miniflare({
  modules: true,
  script: "export default {fetch(){return new Response('fixture')}}",
  compatibilityDate: "2026-06-28",
  d1Databases: { DB: "reminder-budget-d1-fixture" },
});
const at = Date.parse("2026-10-07T12:00:00Z");
let database: typeof import("@/db").db;
let run: typeof import("@/lib/practice/reminders").runAppointmentReminderJobs;
let schema: typeof import("@/db/schema");
let native: D1Database;
let maxParameters = 0;

beforeAll(async () => {
  native = await runtime.getD1Database("DB");
  const names = [
    "user",
    "professionals",
    "practice_patients",
    "practice_appointments",
    "appointment_reminder_preferences",
    "appointment_reminder_deliveries",
  ];
  const objects = await local.execute({
    sql: "SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END",
    args: [],
  });
  for (const name of names)
    expect(objects.rows.some((row) => row.name === name)).toBe(true);
  for (const row of objects.rows) await native.prepare(String(row.sql)).run();
  context.database = new Proxy(native, {
    get(target, property) {
      if (property === "prepare")
        return (sql: string) =>
          new Proxy(target.prepare(sql), {
            get(statement, key) {
              if (key === "bind")
                return (...values: unknown[]) => {
                  maxParameters = Math.max(maxParameters, values.length);
                  return statement.bind(...values);
                };
              const value = Reflect.get(statement, key);
              return typeof value === "function"
                ? value.bind(statement)
                : value;
            },
          });
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  vi.stubEnv("NIDO_DB_TARGET", "cloudflare");
  vi.stubEnv("NIDO_PRACTICE_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "fictitious-reminder-key");
  vi.stubEnv("CONTACT_FROM_EMAIL", "Nido <fixture@example.test>");
  vi.resetModules();
  ({ db: database } = await import("@/db"));
  schema = await import("@/db/schema");
  ({ runAppointmentReminderJobs: run } = await import(
    "@/lib/practice/reminders"
  ));
}, 30000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await runtime.dispose();
  local.close();
});

describe("presupuesto de correo con CTE y RETURNING en D1 local real", () => {
  it("agrupa ocho filas con 83 parámetros y reanuda el ledger sin duplicar", async () => {
    for (let index = 0; index < 15; index++) {
      const id = `fixture-reminder-d1-${index}`;
      const iso = new Date(at).toISOString();
      await database.insert(schema.user).values({
        id,
        name: "Cuenta ficticia",
        email: `${id}@example.test`,
        emailVerified: true,
      });
      await database.insert(schema.professionals).values({
        id,
        userId: id,
        fullName: "Profesional ficticio",
        email: `${id}@example.test`,
        languages: '["es"]',
        supportAreas: "[]",
        status: "approved",
        createdAt: iso,
        updatedAt: iso,
      });
      await database.insert(schema.practicePatients).values({
        id,
        professionalId: id,
        name: "Ficha ficticia",
        country: "VE",
        status: "active",
        consentAt: iso,
        createdAt: iso,
        updatedAt: iso,
      });
      await database.insert(schema.practiceAppointments).values({
        id,
        professionalId: id,
        patientId: id,
        startsAt: new Date(at + 7200000).toISOString(),
        endsAt: new Date(at + 10800000).toISOString(),
        timeZone: "UTC",
        createdAt: iso,
        updatedAt: iso,
      });
      await database.insert(schema.appointmentReminderPreferences).values({
        userId: id,
        role: "professional",
        emailEnabled: true,
        offsetsJson: "[120]",
        timeZone: "UTC",
        revision: 1,
        createdAt: new Date(at - 3600000).toISOString(),
        updatedAt: new Date(at - 3600000).toISOString(),
      });
    }
    maxParameters = 0;
    const sender = vi.fn(async () => ({ ok: true as const }));
    const first = await run({ now: () => at, send: sender });
    expect(maxParameters).toBe(83);
    expect(first.enqueued).toBe(15);
    expect(first.complete).toBe(false);
    expect(first.exhausted).toBe(true);
    expect(first.statementsReserved).toBeLessThanOrEqual(40);
    expect(first.writesReserved).toBeLessThanOrEqual(30);
    const second = await run({ now: () => at + 300000, send: sender });
    expect(second.enqueued).toBe(0);
    expect(sender).toHaveBeenCalledTimes(15);
    const rows = await native
      .prepare("SELECT id,status,attempts FROM appointment_reminder_deliveries")
      .all<{ id: string; status: string; attempts: number }>();
    expect(rows.results).toHaveLength(15);
    expect(new Set(rows.results.map((row) => row.id)).size).toBe(15);
    expect(
      rows.results.every((row) => row.status === "sent" && row.attempts === 1),
    ).toBe(true);
  });
});
