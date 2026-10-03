import { eq, like, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import {
  auditLogs,
  conversations,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
  practicePatients,
  professionals,
  responseSamples,
  seekerSessions,
  user,
} from "@/db/schema";

const { purgeDO } = vi.hoisted(() => ({ purgeDO: vi.fn() }));
vi.mock("@/lib/chat-admin", () => ({
  purgeConversationMessagesDetailed: purgeDO,
}));

import { finalizeConversationPurge } from "@/lib/conversation-purge";

const P = "test-purge-explicit";
const createdAt = "2026-01-01T00:00:00.000Z";
const target = {
  id: `${P}-target`,
  professionalId: `${P}-pro`,
  helpRequestId: null,
  quotaReleasedAt: new Date(createdAt),
  deletedByRole: "seeker",
};
let previousForeignKeys = 0;

async function cleanup() {
  await db.run(sql`DROP TRIGGER IF EXISTS test_purge_parent_failure`);
  await db
    .delete(patientSessionRequests)
    .where(like(patientSessionRequests.id, `${P}-%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.conversationId, `${P}-%`));
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}-%`));
  await db.delete(responseSamples).where(like(responseSamples.id, `${P}-%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}-%`));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db
    .delete(patientAccounts)
    .where(like(patientAccounts.userId, `${P}-%`));
  await db.delete(professionals).where(like(professionals.id, `${P}-%`));
  await db.delete(user).where(like(user.id, `${P}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}-%`));
}
async function seed() {
  await db.insert(user).values([
    {
      id: `${P}-patient`,
      name: "Paciente ficticio",
      email: `${P}-patient@test.local`,
    },
    {
      id: `${P}-pro-user`,
      name: "Profesional ficticio",
      email: `${P}-pro@test.local`,
    },
  ]);
  await db.insert(professionals).values({
    id: target.professionalId,
    userId: `${P}-pro-user`,
    email: `${P}-pro@test.local`,
    fullName: "Profesional ficticio",
    languages: '["es"]',
    supportAreas: '["duelo"]',
    currentActiveRequests: 3,
    createdAt,
    updatedAt: createdAt,
  });
  await db.insert(patientAccounts).values({
    userId: `${P}-patient`,
    displayName: "Paciente ficticio",
    createdAt,
    updatedAt: createdAt,
  });
  for (const suffix of ["target", "unrelated"]) {
    const conversationId = `${P}-${suffix}`;
    await db.insert(conversations).values({
      id: conversationId,
      professionalId: target.professionalId,
      seekerSid: `${P}-${suffix}-sid`,
      quotaReleasedAt: target.quotaReleasedAt,
      deletedByRole: "seeker",
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert(patientConversationLinks).values({
      conversationId,
      userId: `${P}-patient`,
      verifiedBy: "email",
      verifiedAt: createdAt,
    });
    await db.insert(patientSessionRequests).values({
      id: `${P}-${suffix}-request`,
      conversationId,
      userId: `${P}-patient`,
      kind: "new",
      timezone: "UTC",
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert(seekerSessions).values({
      sid: `${P}-${suffix}-sid`,
      conversationId,
      issuedAt: new Date(createdAt),
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    await db.insert(responseSamples).values({
      id: `${P}-${suffix}-sample`,
      professionalId: target.professionalId,
      conversationId,
      sampledAt: new Date(createdAt),
    });
    await db.insert(practicePatients).values({
      id: `${P}-${suffix}-record`,
      professionalId: target.professionalId,
      conversationId,
      name: "Ficha ficticia",
      country: "VE",
      consentAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  }
}
async function childCounts(conversationId: string) {
  const [links, requests, sessions, samples] = await Promise.all([
    db
      .select()
      .from(patientConversationLinks)
      .where(eq(patientConversationLinks.conversationId, conversationId)),
    db
      .select()
      .from(patientSessionRequests)
      .where(eq(patientSessionRequests.conversationId, conversationId)),
    db
      .select()
      .from(seekerSessions)
      .where(eq(seekerSessions.conversationId, conversationId)),
    db
      .select()
      .from(responseSamples)
      .where(eq(responseSamples.conversationId, conversationId)),
  ]);
  return [links.length, requests.length, sessions.length, samples.length];
}
describe("purga explícita de conversaciones sin cascadas de SQLite", () => {
  beforeAll(async () => {
    previousForeignKeys = (
      await db.values<[number]>(sql`PRAGMA foreign_keys`)
    )[0][0];
    await db.run(sql`PRAGMA foreign_keys=OFF`);
    expect((await db.values<[number]>(sql`PRAGMA foreign_keys`))[0][0]).toBe(0);
  });
  beforeEach(async () => {
    await cleanup();
    purgeDO.mockReset().mockResolvedValue("purged");
    await seed();
  });
  afterEach(cleanup);
  afterAll(async () => {
    if (previousForeignKeys) await db.run(sql`PRAGMA foreign_keys=ON`);
  });

  it.each([
    "live",
    "gone",
  ])("limpia todos los hijos con padre %s y conserva la ficha compartida", async (state) => {
    if (state === "gone")
      await db.delete(conversations).where(eq(conversations.id, target.id));
    expect(await childCounts(target.id)).toEqual([1, 1, 1, 1]);
    expect(await finalizeConversationPurge(target, null)).toBe(
      state === "live" ? "purged" : "gone",
    );
    expect(await childCounts(target.id)).toEqual([0, 0, 0, 0]);
    expect(await childCounts(`${P}-unrelated`)).toEqual([1, 1, 1, 1]);
    const records = await db
      .select()
      .from(practicePatients)
      .where(like(practicePatients.id, `${P}-%`));
    expect(records).toHaveLength(2);
    expect(
      records.find((record) => record.id === `${P}-target-record`)
        ?.conversationId,
    ).toBeNull();
    expect(
      records.find((record) => record.id === `${P}-unrelated-record`)
        ?.conversationId,
    ).toBe(`${P}-unrelated`);
    expect(await finalizeConversationPurge(target, null)).toBe("gone");
  });

  it("mantiene los punteros cuando el Durable Object falla y permite reintentar", async () => {
    purgeDO.mockResolvedValueOnce("failed");
    expect(await finalizeConversationPurge(target, null)).toBe("do_failed");
    expect(await childCounts(target.id)).toEqual([1, 1, 1, 1]);
    expect(
      await db.query.conversations.findFirst({
        where: eq(conversations.id, target.id),
      }),
    ).toBeDefined();
    expect(await finalizeConversationPurge(target, null)).toBe("purged");
    expect(await childCounts(target.id)).toEqual([0, 0, 0, 0]);
  });

  it("revierte la limpieza de hijos si falla el borrado del padre en el batch", async () => {
    await db
      .update(conversations)
      .set({ quotaReleasedAt: null })
      .where(eq(conversations.id, target.id));
    const unreleased = { ...target, quotaReleasedAt: null };
    await db.run(
      sql`CREATE TRIGGER test_purge_parent_failure BEFORE DELETE ON conversations WHEN OLD.id = 'test-purge-explicit-target' BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END`,
    );
    await expect(finalizeConversationPurge(unreleased, null)).rejects.toThrow();
    expect(await childCounts(target.id)).toEqual([1, 1, 1, 1]);
    expect(
      (
        await db.query.practicePatients.findFirst({
          where: eq(practicePatients.id, `${P}-target-record`),
        })
      )?.conversationId,
    ).toBe(target.id);
    expect(
      (
        await db.query.conversations.findFirst({
          where: eq(conversations.id, target.id),
        })
      )?.quotaReleasedAt,
    ).toBeNull();
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, target.professionalId),
        })
      )?.currentActiveRequests,
    ).toBe(3);
    await db.run(sql`DROP TRIGGER test_purge_parent_failure`);
    expect(await finalizeConversationPurge(unreleased, null)).toBe("purged");
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, target.professionalId),
        })
      )?.currentActiveRequests,
    ).toBe(2);
    expect(await finalizeConversationPurge(unreleased, null)).toBe("gone");
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, target.professionalId),
        })
      )?.currentActiveRequests,
    ).toBe(2);
  });

  it("dos purgas simultáneas de un chat directo solo liberan un cupo", async () => {
    await db
      .update(conversations)
      .set({ quotaReleasedAt: null })
      .where(eq(conversations.id, target.id));
    const unreleased = { ...target, quotaReleasedAt: null };
    const results = await Promise.all([
      finalizeConversationPurge(unreleased, null),
      finalizeConversationPurge(unreleased, null),
    ]);
    expect(results.sort()).toEqual(["gone", "purged"]);
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, target.professionalId),
        })
      )?.currentActiveRequests,
    ).toBe(2);
    expect(await childCounts(`${P}-unrelated`)).toEqual([1, 1, 1, 1]);
  });
});
