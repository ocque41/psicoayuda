import { eq, inArray, like } from "drizzle-orm";
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
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
  user,
  waitlistEntries,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { mintSeekerToken } from "@/lib/seeker-token";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  getRequesterHash: vi.fn(),
  getServerSession: vi.fn(async () => null),
  notifyAdminWaitlistEntry: vi.fn(async () => undefined),
  notifyWaitlistConfirmation: vi.fn(async () => undefined),
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
vi.mock("@/lib/notifications", () => ({
  conversationUrl: (id: string) => `https://nido.example/c/${id}`,
  notifyConversationDeleted: vi.fn(async () => undefined),
  notifyConversationReopened: vi.fn(async () => undefined),
  notifyAdminWaitlistEntry: mocks.notifyAdminWaitlistEntry,
  notifyWaitlistConfirmation: mocks.notifyWaitlistConfirmation,
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: vi.fn(async () => true),
}));
vi.mock("@/lib/requester-hash", () => ({
  getRequesterHash: mocks.getRequesterHash,
}));

import { joinWaitlistFromChat } from "@/app/c/[conversationId]/actions";

const P = "test-wl-chat";
const ids = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  conv: `${P}-conv`,
  convDirect: `${P}-conv-direct`,
  convAnon: `${P}-conv-anon`,
  convTrash: `${P}-conv-trash`,
  sid: `${P}-sid`,
  sidDirect: `${P}-sid-direct`,
  sidAnon: `${P}-sid-anon`,
  sidTrash: `${P}-sid-trash`,
  help: `${P}-help`,
  email: `${P}-persona@example.com`,
};

const TEST_CONVERSATIONS = [
  ids.conv,
  ids.convDirect,
  ids.convAnon,
  ids.convTrash,
];

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

function joinForm(input: {
  conversationId: string;
  email?: string;
  asPersona?: boolean;
}) {
  const data = new FormData();
  data.set("conversationId", input.conversationId);
  data.set("email", input.email ?? ids.email);
  if (input.asPersona) data.set("asPersona", "1");
  return data;
}

async function cleanupWaitlist() {
  await db
    .delete(waitlistEntries)
    .where(inArray(waitlistEntries.conversationId, TEST_CONVERSATIONS));
}

async function cleanupAll() {
  await cleanupWaitlist();
  await db
    .delete(seekerSessions)
    .where(inArray(seekerSessions.conversationId, TEST_CONVERSATIONS));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(helpRequests).where(eq(helpRequests.id, ids.help));
  await db.delete(professionals).where(eq(professionals.id, ids.pro));
  await db.delete(user).where(eq(user.id, ids.user));
}

const timestamp = () => new Date().toISOString();

beforeAll(async () => {
  await cleanupAll();
  await db.insert(user).values({
    id: ids.user,
    name: "Profesional del chat",
    email: `${P}-pro@example.com`,
  });
  await db.insert(professionals).values({
    id: ids.pro,
    userId: ids.user,
    email: `${P}-pro@example.com`,
    fullName: "Profesional del chat",
    displayName: "Profesional del chat",
    languages: JSON.stringify(["es"]),
    supportAreas: JSON.stringify(["ansiedad_depresion"]),
    status: "approved",
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  await db.insert(helpRequests).values({
    id: ids.help,
    email: `${P}-solicitud@example.com`,
    needCategory: "ansiedad_depresion",
    urgency: "media",
    status: "assigned",
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  await db.insert(conversations).values([
    {
      id: ids.conv,
      helpRequestId: ids.help,
      professionalId: ids.pro,
      seekerSid: ids.sid,
      status: "open",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    },
    {
      id: ids.convDirect,
      professionalId: ids.pro,
      seekerSid: ids.sidDirect,
      status: "open",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    },
    {
      id: ids.convAnon,
      professionalId: ids.pro,
      seekerSid: ids.sidAnon,
      status: "closed",
      anonymizedAt: timestamp(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    },
    {
      id: ids.convTrash,
      professionalId: ids.pro,
      seekerSid: ids.sidTrash,
      status: "open",
      deletedAt: new Date(),
      purgeAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: timestamp(),
      updatedAt: timestamp(),
    },
  ]);
  await db.insert(seekerSessions).values(
    [
      [ids.sid, ids.conv],
      [ids.sidDirect, ids.convDirect],
      [ids.sidAnon, ids.convAnon],
      [ids.sidTrash, ids.convTrash],
    ].map(([sid, conversationId]) => ({
      sid,
      conversationId,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    })),
  );
});

beforeEach(() => {
  mocks.getRequesterHash.mockResolvedValue(`${P}-hash`);
  mocks.getServerSession.mockResolvedValue(null);
  mocks.getCookie.mockImplementation((name: string) =>
    name === "nido_seeker"
      ? { value: seekerToken(ids.sid, ids.conv) }
      : undefined,
  );
});

afterEach(async () => {
  await cleanupWaitlist();
  vi.clearAllMocks();
});

afterAll(cleanupAll);

describe("lista de espera desde el chat", () => {
  it("anota el correo con contexto del caso (área y profesional)", async () => {
    const state = await joinWaitlistFromChat(
      null,
      joinForm({
        conversationId: ids.conv,
        email: `  ${ids.email.toUpperCase()}  `,
      }),
    );

    expect(state).toEqual({ ok: true, email: ids.email });
    const row = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.email, ids.email),
    });
    expect(row).toMatchObject({
      title: "Ansiedad y depresión",
      source: "chat",
      conversationId: ids.conv,
      status: "waiting",
    });
    expect(row?.description).toContain("Profesional del chat");
    expect(mocks.notifyAdminWaitlistEntry).toHaveBeenCalledOnce();
    expect(mocks.notifyWaitlistConfirmation).toHaveBeenCalledWith({
      email: ids.email,
    });

    // La persona acaba de dar su correo: queda también en la conversación para
    // los avisos y el enlace mágico de re-entrada.
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, ids.conv),
    });
    expect(conversation?.seekerEmail).toBe(ids.email);
  });

  it("en un chat directo sin correo, lo guarda para avisos y acceso", async () => {
    mocks.getCookie.mockImplementation((name: string) =>
      name === "nido_seeker"
        ? { value: seekerToken(ids.sidDirect, ids.convDirect) }
        : undefined,
    );

    const state = await joinWaitlistFromChat(
      null,
      joinForm({
        conversationId: ids.convDirect,
        email: `${P}-directo@example.com`,
      }),
    );

    expect(state).toMatchObject({ ok: true });
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, ids.convDirect),
    });
    expect(conversation?.seekerEmail).toBe(`${P}-directo@example.com`);
    const row = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.email, `${P}-directo@example.com`),
    });
    expect(row?.title).toBe("Apoyo psicológico (desde el chat)");
  });

  it("no sobreescribe un correo ya guardado en la conversación", async () => {
    mocks.getCookie.mockImplementation((name: string) =>
      name === "nido_seeker"
        ? { value: seekerToken(ids.sidDirect, ids.convDirect) }
        : undefined,
    );
    await db
      .update(conversations)
      .set({ seekerEmail: `${P}-original@example.com` })
      .where(eq(conversations.id, ids.convDirect));

    const state = await joinWaitlistFromChat(
      null,
      joinForm({
        conversationId: ids.convDirect,
        email: `${P}-nuevo-correo@example.com`,
      }),
    );

    expect(state).toMatchObject({ ok: true });
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, ids.convDirect),
    });
    expect(conversation?.seekerEmail).toBe(`${P}-original@example.com`);
  });

  it("actualiza la anotación si la persona ya estaba, sin reavisar", async () => {
    const first = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.conv, email: ids.email }),
    );
    expect(first).toMatchObject({ ok: true });

    const second = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.conv, email: ids.email }),
    );

    expect(second).toMatchObject({ ok: true });
    const rows = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, ids.email));
    expect(rows).toHaveLength(1);
    expect(mocks.notifyAdminWaitlistEntry).toHaveBeenCalledOnce();
    expect(mocks.notifyWaitlistConfirmation).toHaveBeenCalledOnce();
  });

  it("rechaza el correo inválido sin guardar", async () => {
    const state = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.conv, email: "no-es-un-correo" }),
    );

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok) expect(state.message).toContain("correo válido");
    await expect(
      db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.conversationId, ids.conv)),
    ).resolves.toHaveLength(0);
  });

  it("rechaza sin credencial de la persona en la sala", async () => {
    mocks.getCookie.mockReturnValue(undefined);

    const state = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.conv }),
    );

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok) expect(state.message).toContain("Solo la persona");
    await expect(
      db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.conversationId, ids.conv)),
    ).resolves.toHaveLength(0);
  });

  it("rechaza conversaciones anonimizadas o en la papelera", async () => {
    const anonymized = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.convAnon }),
    );
    expect(anonymized).toMatchObject({ ok: false });

    const trashed = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.convTrash }),
    );
    expect(trashed).toMatchObject({ ok: false });
  });

  it("respeta el límite antiabuso de anotaciones nuevas", async () => {
    for (let index = 0; index < 3; index += 1) {
      const now = timestamp();
      await db.insert(waitlistEntries).values({
        id: `${P}-previa-${index}`,
        email: `${P}-previa-${index}@example.com`,
        title: "Previa",
        description: "Anotación previa dentro de la ventana de una hora.",
        source: "chat",
        requesterHash: `${P}-hash`,
        createdAt: now,
        updatedAt: now,
      });
    }

    const state = await joinWaitlistFromChat(
      null,
      joinForm({ conversationId: ids.conv, email: `${P}-nueva@example.com` }),
    );

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok) expect(state.message).toContain("hace poco");
    await expect(
      db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.email, `${P}-nueva@example.com`)),
    ).resolves.toHaveLength(0);
    await db
      .delete(waitlistEntries)
      .where(like(waitlistEntries.id, `${P}-previa-%`));
  });
});
