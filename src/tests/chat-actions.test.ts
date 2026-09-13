import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { SEEKER_SESSION_TTL_MS } from "@/lib/seeker-access";
import { mintSeekerToken } from "@/lib/seeker-token";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mocks.getCookie(name),
    set: (name: string, value: string, options: unknown) =>
      mocks.setCookie(name, value, options),
  }),
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: vi.fn(async () => null),
}));

import { renewSeekerChatToken } from "@/app/c/[conversationId]/actions";

const P = "test-renew";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  conversation: `${P}-conv`,
  sid: `${P}-sid`,
  revokedSid: `${P}-sid-rev`,
  anonConversation: `${P}-conv-anon`,
  anonSid: `${P}-sid-anon`,
};

function tokenFor(sid: string, conversationId: string, ttlMs = 3600_000) {
  const now = Date.now();
  return mintSeekerToken(
    {
      sid,
      conversationId,
      role: "seeker",
      iat: now,
      exp: now + ttlMs,
    },
    getAuthSecret(),
  );
}

async function cleanup() {
  await db
    .delete(seekerSessions)
    .where(eq(seekerSessions.conversationId, id.conversation));
  await db
    .delete(seekerSessions)
    .where(eq(seekerSessions.conversationId, id.anonConversation));
  await db.delete(conversations).where(eq(conversations.id, id.conversation));
  await db
    .delete(conversations)
    .where(eq(conversations.id, id.anonConversation));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

describe("renewSeekerChatToken (sesión deslizante)", () => {
  beforeAll(async () => {
    await cleanup();
    const iso = new Date().toISOString();
    await db.insert(user).values({
      id: id.user,
      name: "Pro Renovación",
      email: `${id.user}@test.local`,
    });
    await db.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.pro}@test.local`,
      fullName: "Pro Renovación",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values([
      {
        id: id.conversation,
        professionalId: id.pro,
        seekerSid: id.sid,
        status: "open",
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.anonConversation,
        professionalId: id.pro,
        seekerSid: id.anonSid,
        status: "closed",
        anonymizedAt: iso,
        createdAt: iso,
        updatedAt: iso,
      },
    ]);
    await db.insert(seekerSessions).values([
      {
        sid: id.sid,
        conversationId: id.conversation,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      },
      {
        sid: id.revokedSid,
        conversationId: id.conversation,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
        revokedAt: new Date(),
      },
      {
        sid: id.anonSid,
        conversationId: id.anonConversation,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    ]);
  });

  afterAll(cleanup);

  it("extiende la sesión y re-mintea la cookie (hasta 90 días)", async () => {
    mocks.setCookie.mockClear();
    mocks.getCookie.mockReturnValue({
      value: tokenFor(id.sid, id.conversation),
    });

    const before = Date.now();
    const result = await renewSeekerChatToken(id.conversation);
    expect(result.ok).toBe(true);

    const session = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, id.sid),
    });
    expect(session?.expiresAt.getTime()).toBeGreaterThan(
      before + SEEKER_SESSION_TTL_MS - 60_000,
    );
    expect(session?.lastSeenAt).toBeTruthy();

    expect(mocks.setCookie).toHaveBeenCalledTimes(1);
    const [name, , options] = mocks.setCookie.mock.calls[0] as [
      string,
      string,
      { maxAge?: number; httpOnly?: boolean },
    ];
    expect(name).toBe("nido_seeker");
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBe(SEEKER_SESSION_TTL_MS / 1000);
  });

  it("no renueva una sesión revocada", async () => {
    mocks.setCookie.mockClear();
    mocks.getCookie.mockReturnValue({
      value: tokenFor(id.revokedSid, id.conversation),
    });

    const result = await renewSeekerChatToken(id.conversation);
    expect(result.ok).toBe(false);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("no renueva una conversación anonimizada", async () => {
    mocks.setCookie.mockClear();
    mocks.getCookie.mockReturnValue({
      value: tokenFor(id.anonSid, id.anonConversation),
    });

    const result = await renewSeekerChatToken(id.anonConversation);
    expect(result.ok).toBe(false);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
