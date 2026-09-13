import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  accessRequests,
  auditLogs,
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

// La purga real vive en el Durable Object (no disponible en vitest): se mockea
// para poder probar el ciclo 90/180 completo, incluido el camino de fallo.
vi.mock("@/lib/chat-admin", () => ({
  purgeConversationMessages: vi.fn(
    async (conversationId: string) =>
      conversationId !== "test-ret-direct-purgefail",
  ),
  disconnectConversationSockets: vi.fn(async () => true),
}));

import { runRetention } from "@/lib/retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

const P = "test-ret";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  oldClose: `${P}-old-close`,
  recentChat: `${P}-recent-chat`,
  oldAnon: `${P}-old-anon`,
  convActive: `${P}-conv-active`,
  convOld: `${P}-conv-old`,
  sidActive: `${P}-sid-active`,
  sidOld: `${P}-sid-old`,
  directClose: `${P}-direct-close`,
  directAnon: `${P}-direct-anon`,
  directFail: `${P}-direct-purgefail`,
  sidDirectAnon: `${P}-sid-direct-anon`,
  accessOld: `${P}-access-old`,
  accessNew: `${P}-access-new`,
};

async function cleanup() {
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}-%`));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
  await db.delete(accessRequests).where(like(accessRequests.id, `${P}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}-%`));
}

describe("runRetention (90/180 con actividad de chat)", () => {
  beforeAll(async () => {
    await cleanup();

    await db.insert(user).values({
      id: id.user,
      name: "Pro Retención",
      email: `${id.user}@test.local`,
    });
    await db.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.pro}@test.local`,
      fullName: "Pro Retención",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      createdAt: daysAgo(400),
      updatedAt: daysAgo(400),
    });

    await db.insert(helpRequests).values([
      {
        id: id.oldClose,
        email: `${id.oldClose}@test.local`,
        needCategory: "duelo",
        urgency: "media",
        status: "new",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(100),
      },
      {
        id: id.recentChat,
        email: `${id.recentChat}@test.local`,
        needCategory: "duelo",
        urgency: "media",
        status: "new",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(100),
      },
      {
        id: id.oldAnon,
        email: `${id.oldAnon}@test.local`,
        needCategory: "ansiedad",
        urgency: "alta",
        status: "assigned",
        createdAt: daysAgo(220),
        updatedAt: daysAgo(200),
      },
    ]);

    await db.insert(conversations).values([
      {
        id: id.convActive,
        helpRequestId: id.recentChat,
        professionalId: id.pro,
        seekerSid: id.sidActive,
        status: "open",
        lastMessageAt: new Date(NOW - 10 * DAY),
        lastMessageRole: "seeker",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(100),
      },
      {
        id: id.convOld,
        helpRequestId: id.oldAnon,
        professionalId: id.pro,
        seekerSid: id.sidOld,
        seekerName: "Alguien",
        status: "open",
        lastMessageAt: new Date(NOW - 200 * DAY),
        lastMessageRole: "professional",
        createdAt: daysAgo(220),
        updatedAt: daysAgo(200),
      },
      {
        id: id.directClose,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct-close`,
        status: "open",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(100),
      },
      {
        id: id.directAnon,
        professionalId: id.pro,
        seekerSid: id.sidDirectAnon,
        seekerEmail: "directa@test.local",
        seekerName: "Alguien directo",
        status: "open",
        createdAt: daysAgo(220),
        updatedAt: daysAgo(200),
      },
      {
        id: id.directFail,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct-fail`,
        seekerEmail: "fallo@test.local",
        status: "open",
        createdAt: daysAgo(220),
        updatedAt: daysAgo(200),
      },
    ]);

    await db.insert(seekerSessions).values([
      {
        sid: id.sidActive,
        conversationId: id.convActive,
        issuedAt: new Date(NOW - DAY),
        expiresAt: new Date(NOW + DAY),
      },
      {
        sid: id.sidOld,
        conversationId: id.convOld,
        issuedAt: new Date(NOW - DAY),
        expiresAt: new Date(NOW + DAY),
      },
      {
        sid: id.sidDirectAnon,
        conversationId: id.directAnon,
        issuedAt: new Date(NOW - DAY),
        expiresAt: new Date(NOW + DAY),
      },
    ]);

    await db.insert(accessRequests).values([
      {
        id: id.accessOld,
        emailHash: "hash-old",
        createdAt: new Date(NOW - 8 * DAY),
      },
      { id: id.accessNew, emailHash: "hash-new", createdAt: new Date(NOW) },
    ]);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("cierra a los 90 días, pero la actividad reciente del chat lo evita", async () => {
    await runRetention(NOW);

    const closed = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.oldClose),
    });
    expect(closed?.status).toBe("closed");

    const active = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.recentChat),
    });
    expect(active?.status).toBe("new");
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.convActive),
    });
    expect(conv?.status).toBe("open");
  });

  it("anonimiza a los 180 días y purga el transcript del DO", async () => {
    const request = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.oldAnon),
    });
    expect(request?.anonymizedAt).toBeTruthy();
    expect(request?.email.startsWith("anon-")).toBe(true);

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.convOld),
    });
    expect(conv?.anonymizedAt).toBeTruthy();
    expect(conv?.seekerName).toBeNull();
  });

  it("cierra chats directos inactivos con razón 'inactivity'", async () => {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.directClose),
    });
    expect(conv?.status).toBe("closed");
    expect(conv?.closedReason).toBe("inactivity");
  });

  it("anonimiza chats directos viejos y revoca la sesión del seeker", async () => {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.directAnon),
    });
    expect(conv?.anonymizedAt).toBeTruthy();
    expect(conv?.seekerEmail).toBeNull();
    expect(conv?.seekerName).toBeNull();

    const session = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, id.sidDirectAnon),
    });
    expect(session?.revokedAt).toBeTruthy();
  });

  it("si la purga falla, NO marca anonimizado y deja rastro", async () => {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.directFail),
    });
    expect(conv?.anonymizedAt).toBeNull();
    expect(conv?.seekerEmail).toBe("fallo@test.local");

    const logs = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id.directFail),
          eq(auditLogs.action, "conversation_anonymization_failed"),
        ),
      );
    expect(logs.length).toBeGreaterThan(0);
  });

  it("purga la tabla desechable del enlace mágico (>7 días)", async () => {
    const old = await db.query.accessRequests.findFirst({
      where: eq(accessRequests.id, id.accessOld),
    });
    const fresh = await db.query.accessRequests.findFirst({
      where: eq(accessRequests.id, id.accessNew),
    });
    expect(old).toBeUndefined();
    expect(fresh?.id).toBe(id.accessNew);
  });
});
