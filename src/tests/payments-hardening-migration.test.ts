import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La migración 0024 solo añade índices (rate limit del checkout y búsqueda de
// pagos por PaymentIntent). Debe ser aditiva.
describe("migración 0024 (índices de pagos y auditoría)", () => {
  const sql = readFileSync("drizzle/0024_great_zemo.sql", "utf8");

  it("no contiene operaciones destructivas", () => {
    expect(sql).not.toMatch(
      /^\s*(DROP|DELETE\s+FROM|UPDATE\s+|TRUNCATE|REPLACE|ALTER)\b/im,
    );
  });

  it("crea los índices esperados", () => {
    expect(sql).toMatch(
      /CREATE INDEX `audit_logs_actor_action_created_idx` ON `audit_logs` \(`actor_email`,`action`,`created_at`\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX `payments_payment_intent_idx` ON `payments` \(`stripe_payment_intent_id`\)/,
    );
  });
});
