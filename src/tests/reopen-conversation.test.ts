import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { mintSeekerToken } from "@/lib/seeker-token";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  getServerSession: vi.fn(async () => null),
  notifyConversationReopened: vi.fn(async () => undefined),
  disconnectConversationSockets: vi.fn(async () => true),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mocks.getCookie(name),
    set: (name: string, value: string, options: unknown) =>
      mocks.setCookie(name, value, options),
  }),
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/notifications", () => ({
  notifyConversationReopened: mocks.notifyConversationReopened,
  conversationUrl: (id: string) => `https://nido.example/c/${id}`,
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: mocks.disconnectConversationSockets,
}));

import { reopenConversation } from "@/app/c/[conversationId]/actions";

const P = "test-reopen";
const id = {
  user: `${P}-user`,
  capacityUser: `${P}-capacity-user`,
  pro: `${P}-pro`,
  help: `${P}-help`,
  assignment: `${P}-assignment`,
  conv: `${P}-conv`,
  sid: `${P}-sid`,
  direct: `${P}-direct`,
  anon: `${P}-anon`,
  noCap: `${P}-nocap`,
  capacity: `${P}-capacity`,
  taken: `${P}-taken`,
  helpTaken: `${P}-help-taken`,
};

function seekerToken(sid: string, conversationId: string) {
  const now = Date.now();
  return mintSeekerToken(
    {
      sid,
      conversationId,
      role: "seeker",
      iat: now,
      exp: now + 3_600_000,
    },
    getAuthSecret(),
  );
}

async function cleanup() {
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}-%`));
  await db.delete(assignments).where(like(assignments.id, `${P}-%`));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}-%`));
  await db.delete(professionals).where(like(professionals.id, `${P}-%`));
  await db.delete(user).where(like(user.id, `${P}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}-%`));
}

describe("reopenConversation (mismo hilo, con cupo)", () => {
  beforeAll(async () => {
    await cleanup();
    const iso = new Date().toISOString();
    await db.insert(user).values([
      { id: id.user, name: "Pro Reapertura", email: `${id.user}@test.local` },
      {
        id: id.capacityUser,
        name: "Pro Lleno",
        email: `${id.capacityUser}@test.local`,
      },
    ]);
    await db.insert(professionals).values([
      {
        id: id.pro,
        userId: id.user,
        email: `${id.pro}@test.local`,
        fullName: "Pro Reapertura",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        status: "approved",
        maxActiveRequests: 3,
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.capacity,
        userId: id.capacityUser,
        email: `${id.capacity}@test.local`,
        fullName: "Pro Lleno",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        status: "approved",
        maxActiveRequests: 1,
        currentActiveRequests: 1,
        createdAt: iso,
        updatedAt: iso,
      },
    ]);
    await db.insert(helpRequests).values({
      id: id.help,
      email: "reopen-seeker@test.local",
      needCategory: "duelo",
      urgency: "media",
      status: "closed",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(helpRequests).values({
      id: id.helpTaken,
      email: "reopen-tomada@test.local",
      needCategory: "duelo",
      urgency: "media",
      // Otra persona ya la está atendiendo: no es reclamable.
      status: "assigned",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(assignments).values({
      id: id.assignment,
      helpRequestId: id.help,
      professionalId: id.pro,
      status: "closed",
      source: "seeker",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values([
      {
        id: id.conv,
        helpRequestId: id.help,
        professionalId: id.pro,
        seekerSid: id.sid,
        status: "closed",
        closedAt: iso,
        closedReason: "case_closed",
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.direct,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct`,
        seekerEmail: "directa-reopen@test.local",
        status: "closed",
        closedAt: iso,
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.anon,
        professionalId: id.pro,
        seekerSid: `${P}-sid-anon`,
        status: "closed",
        anonymizedAt: iso,
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.noCap,
        professionalId: id.pro,
        seekerSid: `${P}-sid-nocap`,
        status: "closed",
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.taken,
        helpRequestId: id.helpTaken,
        professionalId: id.pro,
        seekerSid: `${P}-sid-taken`,
        status: "closed",
        createdAt: iso,
        updatedAt: iso,
      },
    ]);
    await db.insert(seekerSessions).values({
      sid: id.sid,
      conversationId: id.conv,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
  });

  afterAll(cleanup);

  it("la persona reabre su conversación de solicitud (cupo + caso rearmado)", async () => {
    mocks.getCookie.mockReturnValue({
      value: seekerToken(id.sid, id.conv),
    });
    mocks.getServerSession.mockResolvedValue(null);

    const result = await reopenConversation(id.conv);
    expect(result).toEqual({ ok: true, role: "seeker" });

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.conv),
    });
    expect(conv?.status).toBe("open");
    expect(conv?.closedAt).toBeNull();
    expect(conv?.reopenedAt).toBeTruthy();

    const request = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, id.help),
    });
    expect(request?.status).toBe("assigned");

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, id.assignment),
    });
    expect(assignment?.status).toBe("accepted");

    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    });
    expect(pro?.currentActiveRequests).toBe(1);

    const logs = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id.conv));
    expect(logs.length).toBeGreaterThan(0);
    expect(mocks.disconnectConversationSockets).toHaveBeenCalledWith(id.conv);
  });

  it("el profesional reabre un chat directo y se avisa a la persona", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    mocks.getServerSession.mockResolvedValue({
      user: { id: id.user, email: `${id.user}@test.local` },
    });
    mocks.notifyConversationReopened.mockClear();

    const result = await reopenConversation(id.direct);
    expect(result).toEqual({ ok: true, role: "professional" });

    expect(mocks.notifyConversationReopened).toHaveBeenCalledTimes(1);
    const call = mocks.notifyConversationReopened.mock.calls[0]?.[0] as {
      audience: string;
      url: string;
    };
    expect(call.audience).toBe("seeker");
    expect(call.url).toMatch(/\/acceso\//);
  });

  it("no reabre sin cupo disponible", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    mocks.getServerSession.mockResolvedValue({
      user: { id: id.user, email: `${id.user}@test.local` },
    });
    // El profesional queda a tope de cupo (2 activos de 2).
    await db
      .update(professionals)
      .set({ maxActiveRequests: 2 })
      .where(eq(professionals.id, id.pro));

    const result = await reopenConversation(id.noCap);
    expect(result).toEqual({ ok: false, reason: "no_capacity" });

    await db
      .update(professionals)
      .set({ maxActiveRequests: 3 })
      .where(eq(professionals.id, id.pro));
  });

  it("no reabre si otra persona ya tomó el caso (reclamo atómico)", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    mocks.getServerSession.mockResolvedValue({
      user: { id: id.user, email: `${id.user}@test.local` },
    });

    const result = await reopenConversation(id.taken);
    expect(result).toEqual({ ok: false, reason: "unavailable" });

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.taken),
    });
    expect(conv?.status).toBe("closed");

    // El cupo reservado se compensa (2 activos: seeker + directo reabiertos).
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    });
    expect(pro?.currentActiveRequests).toBe(2);
  });

  it("no reabre una conversación anonimizada", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    mocks.getServerSession.mockResolvedValue({
      user: { id: id.user, email: `${id.user}@test.local` },
    });
    const result = await reopenConversation(id.anon);
    expect(result).toEqual({ ok: false, reason: "anonymized" });
  });

  it("no autoriza a quien no es parte de la conversación", async () => {
    mocks.getCookie.mockReturnValue(undefined);
    mocks.getServerSession.mockResolvedValue(null);
    // noCap sigue cerrada: el motivo correcto es la autorización, no el estado.
    const result = await reopenConversation(id.noCap);
    expect(result).toEqual({ ok: false, reason: "not_authorized" });
  });
});
