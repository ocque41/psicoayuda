import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { mintSeekerToken } from "@/lib/seeker-token";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  getServerSession: vi.fn(async () => null),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mocks.getCookie(name),
    set: () => undefined,
  }),
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: vi.fn(async () => true),
}));
vi.mock("@/lib/notifications", () => ({
  conversationUrl: (id: string) => `https://nido.example/c/${id}`,
  notifyConversationDeleted: vi.fn(async () => undefined),
  notifyConversationReopened: vi.fn(async () => undefined),
  notifyAdminWaitlistEntry: vi.fn(async () => undefined),
  notifyWaitlistConfirmation: vi.fn(async () => undefined),
}));

import { restoreConversation } from "@/app/c/[conversationId]/actions";
import { conversationExists, loadChatView } from "@/lib/chat-view";

const P = "test-chat-access";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  conv: `${P}-conv`,
  otherConv: `${P}-conv-otra`,
  origSid: `${P}-sid-original`,
  magicSid: `${P}-sid-magic`,
  revokedSid: `${P}-sid-revoked`,
  otherSid: `${P}-sid-otra`,
  convTrash: `${P}-conv-papelera`,
  trashSid: `${P}-sid-papelera`,
};

const CONVERSATIONS = [id.conv, id.otherConv, id.convTrash];

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
  await db
    .delete(seekerSessions)
    .where(inArray(seekerSessions.conversationId, CONVERSATIONS));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

const timestamp = () => new Date().toISOString();

async function seed() {
  await cleanup();
  const iso = timestamp();
  await db.insert(user).values({
    id: id.user,
    name: "Pro Acceso",
    email: `${P}-pro@example.com`,
  });
  await db.insert(professionals).values({
    id: id.pro,
    userId: id.user,
    email: `${P}-pro@example.com`,
    fullName: "Pro Acceso",
    displayName: "Pro Acceso",
    languages: JSON.stringify(["es"]),
    supportAreas: JSON.stringify(["duelo"]),
    status: "approved",
    createdAt: iso,
    updatedAt: iso,
  });
  await db.insert(conversations).values([
    {
      id: id.conv,
      professionalId: id.pro,
      seekerSid: id.origSid,
      status: "open",
      createdAt: iso,
      updatedAt: iso,
    },
    {
      id: id.otherConv,
      professionalId: id.pro,
      seekerSid: id.otherSid,
      status: "open",
      createdAt: iso,
      updatedAt: iso,
    },
    {
      id: id.convTrash,
      professionalId: id.pro,
      seekerSid: id.trashSid,
      status: "open",
      deletedAt: new Date(),
      purgeAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: iso,
      updatedAt: iso,
    },
  ]);
  await db.insert(seekerSessions).values([
    {
      sid: id.origSid,
      conversationId: id.conv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    // Sesión creada por un enlace de acceso (/acceso): sid NUEVO, misma sala.
    {
      sid: id.magicSid,
      conversationId: id.conv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    {
      sid: id.revokedSid,
      conversationId: id.conv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: new Date(),
    },
    {
      sid: id.otherSid,
      conversationId: id.otherConv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  ]);
}

function withSeekerCookie(sid: string, conversationId: string) {
  mocks.getCookie.mockImplementation((name: string) =>
    name === "nido_seeker"
      ? { value: seekerToken(sid, conversationId) }
      : undefined,
  );
}

beforeEach(async () => {
  await seed();
  mocks.getCookie.mockReturnValue(undefined);
  mocks.getServerSession.mockResolvedValue(null);
});

afterAll(cleanup);

describe("acceso a la conversación desde otro navegador", () => {
  it("la sesión original entra a su sala", async () => {
    withSeekerCookie(id.origSid, id.conv);
    const view = await loadChatView(id.conv);
    expect(view?.role).toBe("seeker");
    expect(view?.otherName).toBe("Pro Acceso");
  });

  it("la sesión del enlace mágico (sid nuevo) TAMBIÉN entra a su sala", async () => {
    withSeekerCookie(id.magicSid, id.conv);
    const view = await loadChatView(id.conv);
    expect(view?.role).toBe("seeker");
  });

  it("las server actions autorizan con la sesión del enlace mágico", async () => {
    withSeekerCookie(id.magicSid, id.conv);
    const result = await restoreConversation(id.conv);
    expect(result).toMatchObject({ ok: true, role: "seeker" });
  });

  it("rechaza una sesión revocada", async () => {
    withSeekerCookie(id.revokedSid, id.conv);
    expect(await loadChatView(id.conv)).toBeNull();
    const result = await restoreConversation(id.conv);
    expect(result).toMatchObject({ ok: false });
  });

  it("rechaza una sesión de OTRA conversación", async () => {
    withSeekerCookie(id.otherSid, id.otherConv);
    expect(await loadChatView(id.conv)).toBeNull();
  });

  it("sin cookie no hay vista (pantalla de acceso privado)", async () => {
    expect(await loadChatView(id.conv)).toBeNull();
    expect(await conversationExists(id.conv)).toBe(true);
    expect(await conversationExists(`${P}-no-existe`)).toBe(false);
  });

  it("una conversación en la papelera sigue autorizando la vista (con aviso)", async () => {
    await db
      .insert(seekerSessions)
      .values({
        sid: `${P}-sid-papelera-nueva`,
        conversationId: id.convTrash,
        role: "seeker",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .onConflictDoNothing();
    withSeekerCookie(`${P}-sid-papelera-nueva`, id.convTrash);
    const view = await loadChatView(id.convTrash);
    expect(view?.deleted).toBe(true);
  });
});
