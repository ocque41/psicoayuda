import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

describe("0034 preserva datos y añade Calendar sin scopes del login", () => {
  it("conserva históricos y usa FK/índices/defaults opt-in", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      await client.executeMultiple(
        "PRAGMA foreign_keys=ON; CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE practice_appointments(id TEXT PRIMARY KEY, professional_id TEXT); CREATE TABLE historical_receipts(id TEXT PRIMARY KEY, amount INTEGER); INSERT INTO user VALUES('fixture-account'); INSERT INTO historical_receipts VALUES('fixture-history',3500);",
      );
      const before = (await client.execute("SELECT * FROM historical_receipts"))
        .rows;
      const migration = await readFile(
        new URL("../../drizzle/0034_google_calendar.sql", import.meta.url),
        "utf8",
      );
      expect(migration).not.toMatch(
        /\b(?:DROP|DELETE|UPDATE|ALTER)\s+(?:TABLE|FROM|user|practice_appointments)/i,
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await client.execute(statement);
      expect(
        (await client.execute("SELECT * FROM historical_receipts")).rows,
      ).toEqual(before);
      await client.execute(
        "INSERT INTO google_calendar_connections(id,user_id,audience,token_envelope,created_at,updated_at) VALUES('fixture-connection','fixture-account','patient','v1.ficticio.cifrado','2026-10-03','2026-10-03')",
      );
      expect(
        (
          await client.execute(
            "SELECT auto_sync,google_reminders,preferences_revision FROM google_calendar_connections",
          )
        ).rows[0],
      ).toMatchObject({
        auto_sync: 0,
        google_reminders: 0,
        preferences_revision: 0,
      });
      await expect(
        client.execute(
          "INSERT INTO google_calendar_connections(id,user_id,audience,token_envelope,created_at,updated_at) VALUES('foreign','missing-account','patient','v1.ficticio.cifrado','2026-10-03','2026-10-03')",
        ),
      ).rejects.toThrow();
      await client.execute("DELETE FROM user WHERE id='fixture-account'");
      expect(
        (await client.execute("SELECT * FROM google_calendar_connections"))
          .rows,
      ).toHaveLength(0);
    } finally {
      client.close();
    }
  });
});
