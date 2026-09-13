import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import {
  CHECKOUT_RATE_LIMIT_PER_HOUR,
  isCheckoutRateLimited,
} from "@/lib/payments/limits";

// Rate limit del checkout público respaldado en D1: cuenta intentos por hash de
// IP en la última hora y no depende de la memoria del isolate.

const P = "test-lim";
const hashLimited = `${P}-hash-a`;
const hashOld = `${P}-hash-old`;
const hashFree = `${P}-hash-free`;

const row = (id: string, actor: string, minutesAgo: number) => ({
  id,
  actorEmail: actor,
  action: "payment_checkout_created",
  entityType: "package",
  entityId: `${P}-pkg`,
  createdAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
});

describe("isCheckoutRateLimited", () => {
  beforeAll(async () => {
    await db
      .delete(auditLogs)
      .where(inArray(auditLogs.actorEmail, [hashLimited, hashOld, hashFree]));

    const rows = [];
    for (let i = 0; i < CHECKOUT_RATE_LIMIT_PER_HOUR; i += 1) {
      rows.push(row(`${P}-a-${i}`, hashLimited, 5));
    }
    // Intentos viejos (>1h) no cuentan.
    for (let i = 0; i < CHECKOUT_RATE_LIMIT_PER_HOUR + 5; i += 1) {
      rows.push(row(`${P}-o-${i}`, hashOld, 90));
    }
    // Hash libre: unos pocos intentos recientes.
    rows.push(row(`${P}-f-0`, hashFree, 10));
    await db.insert(auditLogs).values(rows);
  });

  afterAll(async () => {
    await db
      .delete(auditLogs)
      .where(inArray(auditLogs.actorEmail, [hashLimited, hashOld, hashFree]));
  });

  it("bloquea al llegar al límite por hora", async () => {
    expect(await isCheckoutRateLimited(hashLimited)).toBe(true);
  });

  it("no cuenta intentos fuera de la ventana", async () => {
    expect(await isCheckoutRateLimited(hashOld)).toBe(false);
  });

  it("deja pasar a quien está por debajo del límite", async () => {
    expect(await isCheckoutRateLimited(hashFree)).toBe(false);
  });

  it("sin hash (sin IP) no bloquea", async () => {
    expect(await isCheckoutRateLimited(undefined)).toBe(false);
  });
});
