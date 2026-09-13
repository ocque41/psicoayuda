import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  notifyProfessionalNewMessage: vi.fn(async () => undefined),
  notifySeekerNewMessage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications", () => mocks);

import { POST } from "@/app/api/internal/chat-event/route";

const P = "test-cev";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  help: `${P}-help`,
  conversation: `${P}-conv`,
  anonConversation: `${P}-conv-anon`,
  sid: `${P}-sid`,
  anonSid: `${P}-sid-anon`,
};

const SECRET = "test-internal-secret";
const NOW = new Date();

async function cleanup() {
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}-%`));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

function post(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers["x-nido-internal"] = secret;
  return POST(
    new Request("https://nido.example/api/internal/chat-event", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("chat-event interno (metadatos y aviso al seeker)", () => {
  beforeAll(async () => {
    process.env.INTERNAL_NOTIFY_SECRET = SECRET;
    await cleanup();

    await db.insert(user).values({
      id: id.user,
      name: "Pro Evento",
      email: `${id.user}@test.local`,
    });
    await db.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.pro}@test.local`,
      fullName: "Pro Evento",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    await db.insert(helpRequests).values({
      id: id.help,
      email: "cev-seeker@test.local",
      needCategory: "duelo",
      urgency: "media",
      status: "assigned",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    await db.insert(conversations).values([
      {
        id: id.conversation,
        helpRequestId: id.help,
        professionalId: id.pro,
        seekerSid: id.sid,
        status: "open",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      {
        id: id.anonConversation,
        professionalId: id.pro,
        seekerSid: id.anonSid,
        status: "closed",
        anonymizedAt: NOW.toISOString(),
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    delete process.env.INTERNAL_NOTIFY_SECRET;
  });

  it("rechaza peticiones sin el secreto interno", async () => {
    const res = await post({ kind: "message-meta" }, null);
    expect(res.status).toBe(401);
  });

  it("message-meta espeja timestamp y rol sin contenido", async () => {
    const ts = NOW.getTime();
    const res = await post({
      kind: "message-meta",
      conversationId: id.conversation,
      lastMessageAt: ts,
      lastMessageRole: "seeker",
    });
    expect(res.status).toBe(200);

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id.conversation),
    });
    expect(conv?.lastMessageAt?.getTime()).toBe(ts);
    expect(conv?.lastMessageRole).toBe("seeker");
  });

  it("notify-seeker crea sesión nueva y envía el enlace de acceso", async () => {
    mocks.notifySeekerNewMessage.mockClear();
    const res = await post({
      kind: "notify-seeker",
      conversationId: id.conversation,
    });
    expect(res.status).toBe(200);

    expect(mocks.notifySeekerNewMessage).toHaveBeenCalledTimes(1);
    const call = mocks.notifySeekerNewMessage.mock.calls[0]?.[0] as {
      seekerEmail: string;
      accessUrl: string;
    };
    expect(call.seekerEmail).toBe("cev-seeker@test.local");
    expect(call.accessUrl).toMatch(/\/acceso\//);

    const sessions = await db
      .select({ sid: seekerSessions.sid })
      .from(seekerSessions)
      .where(eq(seekerSessions.conversationId, id.conversation));
    expect(sessions.length).toBeGreaterThan(0);
  });

  it("no avisa en conversaciones anonimizadas", async () => {
    mocks.notifySeekerNewMessage.mockClear();
    const res = await post({
      kind: "notify-seeker",
      conversationId: id.anonConversation,
    });
    expect(res.status).toBe(200);
    expect(mocks.notifySeekerNewMessage).not.toHaveBeenCalled();

    const sessions = await db
      .select({ sid: seekerSessions.sid })
      .from(seekerSessions)
      .where(eq(seekerSessions.conversationId, id.anonConversation));
    expect(sessions.length).toBe(0);
  });
});
