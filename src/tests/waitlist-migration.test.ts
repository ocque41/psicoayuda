import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

describe("migración de la lista de espera", () => {
  it("es aditiva y no modifica ni elimina datos existentes", () => {
    const sql = readFileSync(
      new URL("../../drizzle/0037_waitlist_entries.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `waitlist_entries`/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS `waitlist_entries_email_unique`/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS `waitlist_entries_status_created_idx`/,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS `waitlist_entries_requester_created_idx`/,
    );
    expect(sql).not.toMatch(
      /^\s*(DROP|DELETE\s+FROM|UPDATE\s+|TRUNCATE|REPLACE)\b/im,
    );
  });

  it("la tarjeta del chat añade el vínculo a la conversación sin tocar datos", () => {
    const sql = readFileSync(
      new URL("../../drizzle/0038_waitlist_chat.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(
      /ALTER TABLE `waitlist_entries` ADD `conversation_id` text/,
    );
    expect(sql).toMatch(
      /CREATE INDEX `waitlist_entries_conversation_idx` ON `waitlist_entries` \(`conversation_id`\)/,
    );
    expect(sql).not.toMatch(
      /^\s*(DROP|DELETE\s+FROM|UPDATE\s+|TRUNCATE|REPLACE)\b/im,
    );
  });
});

it("aplica 0037/0038 sobre todas las migraciones CRM previas y conserva sus datos", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    const directory = new URL("../../drizzle/", import.meta.url);
    const files = readdirSync(directory)
      .filter((name) => /^\d{4}_.*\.sql$/.test(name))
      .sort();
    for (const file of files.filter((name) => name < "0037")) {
      const source = readFileSync(new URL(file, directory), "utf8");
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await client.execute(statement);
    }
    await client.execute(
      "INSERT INTO user (id,name,email,updated_at) VALUES ('fixture-user','Ficticio','fixture-user@example.com',0)",
    );
    await client.execute(
      "INSERT INTO professionals (id,user_id,email,full_name,languages,support_areas,created_at,updated_at) VALUES ('fixture-pro','fixture-user','fixture@example.com','Ficticio','[]','[]','2026-10-04','2026-10-04')",
    );
    await client.execute(
      "INSERT INTO practice_patients (id,professional_id,name,country,consent_at,created_at,updated_at) VALUES ('fixture-patient','fixture-pro','Ficticio','VE','2026-10-04','2026-10-04','2026-10-04')",
    );
    const tables = (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
    ).rows.map((row) => String(row.name));
    const before = await Promise.all(
      tables.map((table) =>
        client.execute(`SELECT * FROM "${table}" ORDER BY rowid`),
      ),
    );
    for (const file of [
      "0037_waitlist_entries.sql",
      "0038_waitlist_chat.sql",
    ]) {
      for (const statement of readFileSync(
        new URL(file, directory),
        "utf8",
      ).split("--> statement-breakpoint"))
        if (statement.trim()) await client.execute(statement);
    }
    for (let index = 0; index < tables.length; index++) {
      expect(
        (
          await client.execute(
            `SELECT * FROM "${tables[index]}" ORDER BY rowid`,
          )
        ).rows,
      ).toEqual(before[index].rows);
    }
    await client.execute(
      "INSERT INTO waitlist_entries (id,email,title,description,source,created_at,updated_at,conversation_id) VALUES ('fixture-wait','wait@example.com','Ficticio','Ficticio','chat','2026-10-04','2026-10-04','fixture-chat')",
    );
    expect(
      (await client.execute("SELECT conversation_id FROM waitlist_entries"))
        .rows[0]?.conversation_id,
    ).toBe("fixture-chat");
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  } finally {
    client.close();
  }
});
