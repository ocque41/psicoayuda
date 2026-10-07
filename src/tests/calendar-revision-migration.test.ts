import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

type Statement = { sql: string; args?: (string | number | null)[] };
type Fixture = {
  run: (
    sql: string,
    args?: Statement["args"],
  ) => Promise<Record<string, unknown>[]>;
  batch: (statements: Statement[]) => Promise<unknown>;
  close: () => Promise<void>;
};
async function fixture(engine: "libsql" | "d1"): Promise<Fixture> {
  if (engine === "libsql") {
    const client = createClient({ url: ":memory:" });
    return {
      run: async (sql, args = []) => (await client.execute({ sql, args })).rows,
      batch: (statements) => client.batch(statements, "write"),
      close: async () => client.close(),
    };
  }
  const require = createRequire(import.meta.url);
  const { Miniflare } = createRequire(require.resolve("wrangler/package.json"))(
    "miniflare",
  );
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: "2026-06-28",
    d1Databases: { DB: "calendar-legacy-fixture" },
  });
  const database: D1Database = await runtime.getD1Database("DB");
  return {
    run: async (sql, args = []) =>
      (
        await database
          .prepare(sql)
          .bind(...args)
          .all()
      ).results,
    batch: (statements) =>
      database.batch(
        statements.map((s) => database.prepare(s.sql).bind(...(s.args || []))),
      ),
    close: () => runtime.dispose(),
  };
}
describe("0042: migración aditiva Calendar con libSQL y D1 temporales", () => {
  it.each([
    "libsql",
    "d1",
  ] as const)("%s conserva legacy y revisiones dentro del batch", async (engine) => {
    const db = await fixture(engine);
    try {
      for (const sql of [
        "CREATE TABLE owners(id TEXT PRIMARY KEY)",
        "INSERT INTO owners VALUES('fixture-owner')",
        "CREATE TABLE practice_appointments(id TEXT PRIMARY KEY, professional_id TEXT NOT NULL REFERENCES owners(id), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, time_zone TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, daily_room TEXT)",
        "CREATE INDEX fixture_legacy_date ON practice_appointments(starts_at)",
        "CREATE TABLE historical_receipts(id TEXT PRIMARY KEY, amount INTEGER NOT NULL)",
        "INSERT INTO historical_receipts VALUES('fixture-receipt',3500)",
      ])
        await db.run(sql);
      for (const [index, status] of [
        "scheduled",
        "completed",
        "cancelled",
      ].entries())
        await db.run(
          "INSERT INTO practice_appointments VALUES(?, 'fixture-owner', ?, ?, 'America/Caracas', ?, 'fixture-snapshot', NULL)",
          [
            `fixture-${index}`,
            `2027-10-${index + 10}T14:00:00.000Z`,
            `2027-10-${index + 10}T14:50:00.000Z`,
            status,
          ],
        );
      const before = await db.run(
        "SELECT * FROM practice_appointments ORDER BY id",
      );
      const receipts = await db.run("SELECT * FROM historical_receipts");
      const migration = await readFile(
        new URL("../../drizzle/0042_calendar_revision.sql", import.meta.url),
        "utf8",
      );
      expect(migration).not.toMatch(/\b(DROP|DELETE|REPLACE)\b/i);
      const statements = migration
        .split("--> statement-breakpoint")
        .map((sql) => ({ sql }));
      // A failing final DDL must not leave the new column half installed.
      await db.run(
        "CREATE TRIGGER practice_appointments_calendar_revision AFTER UPDATE OF starts_at ON practice_appointments BEGIN SELECT 1; END",
      );
      await expect(db.batch(statements)).rejects.toThrow();
      expect(
        (await db.run("PRAGMA table_info(practice_appointments)")).some(
          (r) => r.name === "calendar_revision",
        ),
      ).toBe(false);
      expect(
        await db.run("SELECT * FROM practice_appointments ORDER BY id"),
      ).toEqual(before);
      await db.run("DROP TRIGGER practice_appointments_calendar_revision");
      await db.batch(statements);
      const after = await db.run(
        "SELECT * FROM practice_appointments ORDER BY id",
      );
      expect(after.map(({ calendar_revision, ...old }) => old)).toEqual(before);
      expect(after.map((r) => r.calendar_revision)).toEqual([0, 0, 0]);
      expect(await db.run("SELECT * FROM historical_receipts")).toEqual(
        receipts,
      );
      expect(
        await db.run(
          "SELECT name FROM sqlite_master WHERE name='fixture_legacy_date'",
        ),
      ).toHaveLength(1);
      const row = async () =>
        (
          await db.run(
            "SELECT * FROM practice_appointments WHERE id='fixture-0'",
          )
        )[0];
      await db.run(
        "UPDATE practice_appointments SET daily_room='fixture-only', updated_at='next-snapshot' WHERE id='fixture-0'",
      );
      expect((await row()).calendar_revision).toBe(0);
      await db.run(
        "UPDATE practice_appointments SET starts_at=starts_at, status=status WHERE id='fixture-0'",
      );
      expect((await row()).calendar_revision).toBe(0);
      await db.run(
        "UPDATE practice_appointments SET starts_at='2027-10-20T14:00:00.000Z', ends_at='2027-10-20T14:50:00.000Z' WHERE id='fixture-0'",
      );
      expect((await row()).calendar_revision).toBe(1);
      const baseline = await row();
      await expect(
        db.batch([
          {
            sql: "UPDATE practice_appointments SET status='cancelled' WHERE id='fixture-0'",
          },
          {
            sql: "INSERT INTO historical_receipts VALUES('fixture-receipt',9999)",
          },
        ]),
      ).rejects.toThrow();
      expect(await row()).toEqual(baseline);
      // changes() must remain the outer UPDATE count, not the inner trigger's.
      await db.batch([
        {
          sql: "UPDATE practice_appointments SET status='cancelled' WHERE id='fixture-0'",
        },
        {
          sql: "INSERT INTO historical_receipts SELECT 'fixture-confirmed',100 WHERE changes()=1",
        },
      ]);
      expect((await row()).calendar_revision).toBe(2);
      expect(
        await db.run(
          "SELECT * FROM historical_receipts WHERE id='fixture-confirmed'",
        ),
      ).toHaveLength(1);
      await db.run(
        "UPDATE practice_appointments SET calendar_revision=2147483647 WHERE id='fixture-0'",
      );
      const max = await row();
      await expect(
        db.run(
          "UPDATE practice_appointments SET status='scheduled' WHERE id='fixture-0'",
        ),
      ).rejects.toThrow();
      expect(await row()).toEqual(max);
      for (const invalid of [-1, 2147483648, 0.5, null, "fixture-invalid"])
        await expect(
          db.run(
            "UPDATE practice_appointments SET calendar_revision=? WHERE id='fixture-0'",
            [invalid],
          ),
        ).rejects.toThrow();
      expect(await row()).toEqual(max);
      await db.run(
        "INSERT INTO practice_appointments(id,professional_id,starts_at,ends_at,time_zone,status,updated_at) VALUES('fixture-new','fixture-owner','2027-10-25T14:00:00.000Z','2027-10-25T14:50:00.000Z','UTC','scheduled','fixture-snapshot')",
      );
      expect(
        (
          await db.run(
            "SELECT calendar_revision FROM practice_appointments WHERE id='fixture-new'",
          )
        )[0].calendar_revision,
      ).toBe(0);
      const race = await Promise.all([
        db.run(
          "UPDATE practice_appointments SET starts_at='2027-10-26T14:00:00.000Z',updated_at='race-a' WHERE id='fixture-new' AND updated_at='fixture-snapshot' RETURNING id",
        ),
        db.run(
          "UPDATE practice_appointments SET starts_at='2027-10-27T14:00:00.000Z',updated_at='race-b' WHERE id='fixture-new' AND updated_at='fixture-snapshot' RETURNING id",
        ),
      ]);
      expect(race.flat()).toHaveLength(1);
      expect(
        (
          await db.run(
            "SELECT calendar_revision FROM practice_appointments WHERE id='fixture-new'",
          )
        )[0].calendar_revision,
      ).toBe(1);
      expect(await db.run("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      await db.close();
    }
  }, 30000);
});
