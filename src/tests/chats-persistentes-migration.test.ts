import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migración de chats persistentes", () => {
  it("es aditiva y no modifica ni elimina datos existentes", () => {
    const sql = readFileSync(
      new URL("../../drizzle/0022_chats_persistentes.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE `access_requests`/);
    expect(sql).toMatch(
      /ALTER TABLE `conversations` ADD `last_message_at` integer/,
    );
    expect(sql).toMatch(
      /ALTER TABLE `conversations` ADD `last_message_role` text/,
    );
    expect(sql).toMatch(
      /ALTER TABLE `conversations` ADD `pro_last_read_at` integer/,
    );
    expect(sql).toMatch(/ALTER TABLE `conversations` ADD `seeker_email` text/);
    expect(sql).toMatch(
      /CREATE INDEX `conversations_professional_activity_idx`/,
    );
    expect(sql).not.toMatch(
      /^\s*(DROP|DELETE\s+FROM|UPDATE\s+|TRUNCATE|REPLACE)\b/im,
    );
  });
});
