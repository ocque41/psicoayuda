import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migración de la lista de espera", () => {
  it("es aditiva y no modifica ni elimina datos existentes", () => {
    const sql = readFileSync(
      new URL("../../drizzle/0027_waitlist_entries.sql", import.meta.url),
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
      new URL("../../drizzle/0028_waitlist_chat.sql", import.meta.url),
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
