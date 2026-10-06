import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { session as authSessions, professionals, user } from "@/db/schema";
import { generateIdentityKeyPair, toConversationIdentity } from "@/shared/e2ee";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));

import {
  publishProIdentityKey,
  verifyProfessionalE2eeActor,
} from "@/app/actions-e2ee";

const prefix = "test-key-publication";
if (!process.env.DATABASE_URL?.includes("nido-tests-"))
  throw new Error("Requiere test:isolated.");
beforeAll(async () => {
  await db.insert(user).values({
    id: prefix,
    name: "Cuenta ficticia",
    email: `${prefix}@example.com`,
  });
  await db.insert(authSessions).values({
    id: `${prefix}-auth`,
    userId: prefix,
    token: `${prefix}-token`,
    expiresAt: new Date(Date.now() + 3600000),
  });
  const timestamp = new Date().toISOString();
  await db.insert(professionals).values({
    id: prefix,
    userId: prefix,
    email: `${prefix}@example.com`,
    fullName: "Profesional ficticio",
    languages: "[]",
    supportAreas: "[]",
    status: "approved",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  mocks.session.mockResolvedValue({
    user: { id: prefix },
    session: {
      id: `${prefix}-auth`,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
});
afterAll(async () => {
  await db.delete(professionals).where(eq(professionals.id, prefix));
  await db.delete(user).where(eq(user.id, prefix));
});
describe("publicación de claves entre dispositivos", () => {
  it("autoriza sólo el profesional aprobado de la sesión actual y viva", async () => {
    mocks.session.mockResolvedValue({
      user: { id: prefix },
      session: {
        id: `${prefix}-auth`,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect((await verifyProfessionalE2eeActor(prefix)).ok).toBe(true);
    expect(await verifyProfessionalE2eeActor("otra-cuenta-ficticia")).toEqual({
      ok: false,
    });
    const key = (await toConversationIdentity(await generateIdentityKeyPair()))
      .publicKey;
    expect(
      await publishProIdentityKey(key, undefined, "otra-cuenta-ficticia"),
    ).toEqual({ ok: false });
    mocks.session.mockResolvedValue({
      user: { id: "otro-actor-ficticio" },
      session: {
        id: `${prefix}-auth`,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(await verifyProfessionalE2eeActor(prefix)).toEqual({ ok: false });
    mocks.session.mockResolvedValue({
      user: { id: prefix },
      session: { id: `${prefix}-auth`, expiresAt: new Date(Date.now() - 1) },
    });
    expect(await verifyProfessionalE2eeActor(prefix)).toEqual({ ok: false });
    mocks.session.mockResolvedValue(null);
    expect(await verifyProfessionalE2eeActor(prefix)).toEqual({ ok: false });
    mocks.session.mockResolvedValue({
      user: { id: prefix },
      session: {
        id: `${prefix}-auth`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  });
  it("dos inicializaciones concurrentes no sobrescriben la identidad ganadora", async () => {
    const keys = await Promise.all(
      [generateIdentityKeyPair(), generateIdentityKeyPair()].map(
        async (pair) => (await toConversationIdentity(await pair)).publicKey,
      ),
    );
    const results = await Promise.all(
      keys.map((key) => publishProIdentityKey(key)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const winner = keys[results.findIndex((result) => result.ok)];
    const loser = keys.find((key) => key !== winner) ?? "";
    expect(await publishProIdentityKey(winner)).toEqual({ ok: true });
    expect(await publishProIdentityKey(loser)).toEqual({ ok: false });
    expect(await publishProIdentityKey(loser, loser)).toEqual({ ok: false });
    expect(await publishProIdentityKey(loser, winner)).toEqual({ ok: true });
    expect(await publishProIdentityKey(winner, winner)).toEqual({ ok: false });
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, prefix),
        })
      )?.cryptoPublicKey,
    ).toBe(loser);
    await db
      .update(professionals)
      .set({ status: "pending" })
      .where(eq(professionals.id, prefix));
    expect(await publishProIdentityKey(loser)).toEqual({ ok: false });
  });
});
