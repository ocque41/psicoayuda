import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migración de contactos", () => {
  it("es aditiva y no modifica ni elimina datos existentes", () => {
    const sql = readFileSync(
      new URL("../../drizzle/0020_add_contact_messages.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/CREATE TABLE `contact_messages`/);
    expect(sql).toMatch(/CREATE INDEX `contact_messages_status_created_idx`/);
    expect(sql).not.toMatch(
      /^\s*(DROP|DELETE\s+FROM|UPDATE\s+|ALTER|TRUNCATE|REPLACE)\b/im,
    );
  });
});
