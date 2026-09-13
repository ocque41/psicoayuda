import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La migración 0023 (pagos y chats eternos) debe ser ADITIVA: nada de DROP,
// DELETE, UPDATE ni ALTER destructivo. Además deja el cupo liberable y la
// etiqueta de servicios pagos.
describe("migración 0023 (pagos y chats eternos)", () => {
  const sql = readFileSync(
    "drizzle/0023_remarkable_silver_samurai.sql",
    "utf8",
  );

  it("no contiene operaciones destructivas", () => {
    expect(sql).not.toMatch(
      /^\s*(DROP|DELETE\s+FROM|UPDATE\s+|TRUNCATE|REPLACE)\b/im,
    );
  });

  it("crea las tablas del módulo de pagos", () => {
    expect(sql).toMatch(/CREATE TABLE `session_packages`/);
    expect(sql).toMatch(/CREATE TABLE `payments`/);
    expect(sql).toMatch(/CREATE TABLE `stripe_events`/);
  });

  it("añade columnas aditivas a conversations y professionals", () => {
    expect(sql).toMatch(
      /ALTER TABLE `conversations` ADD `quota_released_at` integer/,
    );
    expect(sql).toMatch(
      /ALTER TABLE `professionals` ADD `offers_paid_services`/,
    );
    expect(sql).toMatch(/ALTER TABLE `professionals` ADD `stripe_account_id`/);
    expect(sql).toMatch(
      /ALTER TABLE `professionals` ADD `stripe_charges_enabled`/,
    );
  });
});
