import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, waitlistEntries } from "@/db/schema";
import { anonymizeWaitlistEntry } from "@/lib/retention";

if (!process.env.DATABASE_URL?.includes("nido-tests-"))
  throw new Error("Requiere test:isolated.");
it("la retención respeta actualizaciones concurrentes y anonimiza una sola vez", async () => {
  const id = "fixture-waitlist-retention";
  const recent = new Date().toISOString();
  await db.insert(waitlistEntries).values({
    id,
    email: "fixture-retention@example.com",
    title: "Ficticio",
    description: "Ficticio",
    source: "chat",
    conversationId: "fixture-conversation",
    createdAt: "2020-01-01",
    updatedAt: recent,
  });
  expect(await anonymizeWaitlistEntry(id, null, "2021-01-01")).toMatchObject({
    anonymized: false,
  });
  expect(
    (
      await db.query.waitlistEntries.findFirst({
        where: eq(waitlistEntries.id, id),
      })
    )?.email,
  ).toBe("fixture-retention@example.com");
  expect(await anonymizeWaitlistEntry(id, null)).toMatchObject({
    anonymized: true,
  });
  expect(await anonymizeWaitlistEntry(id, null)).toMatchObject({
    anonymized: false,
  });
  const row = await db.query.waitlistEntries.findFirst({
    where: eq(waitlistEntries.id, id),
  });
  expect(row).toMatchObject({
    status: "closed",
    conversationId: null,
    requesterHash: null,
  });
  expect(row?.email).not.toBe("fixture-retention@example.com");
  expect(
    await db.select().from(auditLogs).where(eq(auditLogs.entityId, id)),
  ).toHaveLength(1);
});
