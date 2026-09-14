import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  accessRequests,
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  payments,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

// El DO no existe en vitest: solo se mockea el corte de sockets (lo usa el
// cierre de asignaciones). La purga ya NO la llama la retención: los chats son
// eternos y solo se borran con la acción explícita del profesional o la persona.
vi.mock("@/lib/chat-admin", () => ({
  purgeConversationMessages: vi.fn(async () => true),
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
  convClose: `${P}-conv-close`,
  sidActive: `${P}-sid-active`,
  sidOld: `${P}-sid-old`,
  sidClose: `${P}-sid-close`,
  directStale: `${P}-direct-stale`,
  directFresh: `${P}-direct-fresh`,
  directOld: `${P}-direct-old`,
  accessOld: `${P}-access-old`,
  accessNew: `${P}-access-new`,
  assignmentOld: `${P}-asg-old`,
  assignmentNew: `${P}-asg-new`,
  paymentPendingOld: `${P}-pay-pending-old`,
  paymentPendingFresh: `${P}-pay-pending-fresh`,
  paymentPaidOld: `${P}-pay-paid-old`,
};

async function cleanup() {
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}-%`));
  await db.delete(assignments).where(like(assignments.id, `${P}-%`));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}-%`));
  await db.delete(payments).where(like(payments.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
  await db.delete(accessRequests).where(like(accessRequests.id, `${P}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}-%`));
}

describe("runRetention (solicitudes 90/180 y chats eternos)", () => {
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
      // Cupo simulado: 3 casos activos (vieja asignación + chats directos).
      currentActiveRequests: 3,
      createdAt: daysAgo(400),
      updatedAt: daysAgo(400),
    });

    await db.insert(helpRequests).values([
      {
        id: id.oldClose,
        email: `${id.oldClose}@test.local`,
        needCategory: "duelo",
        urgency: "media",
        status: "assigned",
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

    await db.insert(assignments).values([
      {
        id: id.assignmentOld,
        helpRequestId: id.oldClose,
        professionalId: id.pro,
        status: "assigned",
        source: "admin",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(100),
      },
      {
        id: id.assignmentNew,
        helpRequestId: id.oldAnon,
        professionalId: id.pro,
        status: "accepted",
        source: "seeker",
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
        seekerEmail: "alguien@test.local",
        status: "open",
        lastMessageAt: new Date(NOW - 200 * DAY),
        lastMessageRole: "professional",
        createdAt: daysAgo(220),
        updatedAt: daysAgo(200),
      },
      {
        id: id.convClose,
        helpRequestId: id.oldClose,
        professionalId: id.pro,
        seekerSid: id.sidClose,
        status: "open",
        lastMessageAt: new Date(NOW - 100 * DAY),
        lastMessageRole: "seeker",
        createdAt: daysAgo(120),
        updatedAt: daysAgo(100),
      },
      {
        id: id.directStale,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct-stale`,
        seekerEmail: "directa-vieja@test.local",
        status: "open",
        lastMessageAt: new Date(NOW - 40 * DAY),
        lastMessageRole: "seeker",
        createdAt: daysAgo(60),
        updatedAt: daysAgo(40),
      },
      {
        id: id.directFresh,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct-fresh`,
        status: "open",
        lastMessageAt: new Date(NOW - 5 * DAY),
        createdAt: daysAgo(10),
        updatedAt: daysAgo(5),
      },
      {
        id: id.directOld,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct-old`,
        seekerName: "Alguien eterno",
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
        sid: id.sidClose,
        conversationId: id.convClose,
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

    await db.insert(payments).values([
      {
        id: id.paymentPendingOld,
        professionalId: id.pro,
        packageTitle: "Paquete viejo",
        amountCents: 2500,
        applicationFeeCents: 500,
        currency: "eur",
        status: "pending",
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
      },
      {
        id: id.paymentPendingFresh,
        professionalId: id.pro,
        packageTitle: "Paquete reciente",
        amountCents: 2500,
        applicationFeeCents: 500,
        currency: "eur",
        status: "pending",
        createdAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: id.paymentPaidOld,
        professionalId: id.pro,
        packageTitle: "Paquete pagado",
        amountCents: 2500,
        applicationFeeCents: 500,
        currency: "eur",
        status: "paid",
        paidAt: daysAgo(3),
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("cierra solicitudes a los 90 días (la actividad del chat lo evita)", async () => {
    const result = await runRetention(NOW);
    expect(result.closed).toBeGreaterThanOrEqual(1);

    const closed = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.oldClose),
    });
    expect(closed?.status).toBe("closed");

    const active = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.recentChat),
    });
    expect(active?.status).toBe("new");
  });

  it("el cierre de la solicitud NO cierra el chat (es eterno)", async () => {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.convClose),
    });
    expect(conv?.status).toBe("open");
    expect(conv?.closedReason).toBeNull();

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, id.assignmentOld),
    });
    expect(assignment?.status).toBe("closed");
  });

  it("anonimiza la solicitud a los 180 días sin tocar la conversación", async () => {
    const request = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.oldAnon),
    });
    expect(request?.anonymizedAt).toBeTruthy();
    expect(request?.email.startsWith("anon-")).toBe(true);

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.convOld),
    });
    expect(conv?.anonymizedAt).toBeNull();
    expect(conv?.status).toBe("open");
    expect(conv?.seekerName).toBe("Alguien");
    expect(conv?.seekerEmail).toBe("alguien@test.local");

    const session = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, id.sidOld),
    });
    expect(session?.revokedAt).toBeNull();
  });

  it("libera cupo de chats directos inactivos >30 días sin cerrarlos", async () => {
    const stale = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.directStale),
    });
    expect(stale?.status).toBe("open");
    expect(stale?.quotaReleasedAt).toBeTruthy();

    const old = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.directOld),
    });
    expect(old?.status).toBe("open");
    expect(old?.quotaReleasedAt).toBeTruthy();
    expect(old?.seekerName).toBe("Alguien eterno");

    const fresh = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.directFresh),
    });
    expect(fresh?.quotaReleasedAt).toBeNull();
  });

  it("descuenta el cupo una sola vez (idempotente entre pasadas)", async () => {
    const after = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    });
    // 3 iniciales: -1 por la asignación cerrada, -2 por los chats directos
    // inactivos (directStale y directOld). directFresh no cuenta.
    expect(after?.currentActiveRequests).toBe(0);

    const second = await runRetention(NOW);
    expect(second.quotaReleased).toBe(0);
    expect(second.paymentsExpired).toBe(0);

    const afterSecond = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    });
    expect(afterSecond?.currentActiveRequests).toBe(0);
  });

  it("expira pagos pendientes > 48h y respeta los recientes y los pagados", async () => {
    const old = await db.query.payments.findFirst({
      where: eq(payments.id, id.paymentPendingOld),
    });
    expect(old?.status).toBe("expired");

    const fresh = await db.query.payments.findFirst({
      where: eq(payments.id, id.paymentPendingFresh),
    });
    expect(fresh?.status).toBe("pending");

    const paid = await db.query.payments.findFirst({
      where: eq(payments.id, id.paymentPaidOld),
    });
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).toBeTruthy();
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

  it("no llama a la purga del DO: nada borra un chat eterno", async () => {
    const { purgeConversationMessages } = await import("@/lib/chat-admin");
    expect(vi.mocked(purgeConversationMessages)).not.toHaveBeenCalled();
  });
});
