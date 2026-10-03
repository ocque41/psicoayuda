import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
import {
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  SEEKER_COOKIE,
  verifySeekerToken,
} from "@/lib/seeker-token";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  getSession: vi.fn(),
  link: vi.fn(),
  disconnect: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.getCookie, set: mocks.setCookie }),
  headers: async () => new Headers({ "cf-connecting-ip": "192.0.2.77" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`fixture-redirect:${path}`);
  },
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.getSession }));
vi.mock("@/lib/patient/access", () => ({
  linkPatientConversation: mocks.link,
}));
vi.mock("@/lib/chat-admin", () => ({
  disconnectConversationSockets: mocks.disconnect,
}));
vi.mock("@/lib/notifications", () => ({
  notifyConversationReopened: mocks.notify,
  notifyConversationDeleted: mocks.notify,
  conversationUrl: (id: string) => `https://nido.example/c/${id}`,
}));
vi.mock("@/lib/seeker-access", () => ({
  SEEKER_SESSION_TTL_MS: 90 * 86400000,
  createSeekerAccessLink: async () => ({
    url: "https://nido.example/acceso/fixture",
  }),
}));

import { createConversation } from "@/app/actions-chat";
import {
  deleteConversation,
  ensureProChatToken,
  markProfessionalChatRead,
  renewSeekerChatToken,
  reopenConversation,
  restoreConversation,
} from "@/app/c/[conversationId]/actions";
import { loadChatView } from "@/lib/chat-view";

const prefix = "test-chat-integrity";
const ids = {
  user: `${prefix}-user`,
  pro: `${prefix}-pro`,
  foreignUser: `${prefix}-foreign-user`,
  foreign: `${prefix}-foreign`,
  conv: `${prefix}-conv`,
  sid: `${prefix}-sid`,
  help: `${prefix}-help`,
  assignment: `${prefix}-assignment`,
};
const url = process.env.DATABASE_URL;
if (!url?.includes("nido-tests-"))
  throw new Error("Esta prueba requiere test:isolated.");
const client = createClient({ url });
const proSession = { user: { id: ids.user, email: `${prefix}@example.test` } };
function seekerToken() {
  const now = Date.now();
  return mintSeekerToken(
    {
      sid: ids.sid,
      conversationId: ids.conv,
      role: "seeker",
      iat: now,
      exp: now + 3600000,
    },
    getAuthSecret(),
  );
}
function proToken() {
  const now = Date.now();
  return mintProfessionalToken(
    {
      professionalId: ids.pro,
      conversationId: ids.conv,
      role: "professional",
      iat: now,
      exp: now + 3600000,
    },
    getAuthSecret(),
  );
}
async function clearThreads() {
  await db.run(
    sql`DELETE FROM seeker_sessions WHERE conversation_id IN (SELECT id FROM conversations WHERE professional_id IN (${ids.pro},${ids.foreign}))`,
  );
  await db.run(
    sql`DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM conversations WHERE professional_id IN (${ids.pro},${ids.foreign}))`,
  );
  await db.delete(assignments).where(eq(assignments.helpRequestId, ids.help));
  await db.run(
    sql`DELETE FROM conversations WHERE professional_id IN (${ids.pro},${ids.foreign})`,
  );
  await db.delete(helpRequests).where(eq(helpRequests.id, ids.help));
}
async function count(table: string) {
  const result = await client.execute(`SELECT count(*) AS n FROM ${table}`);
  return Number(result.rows[0].n);
}
async function thread(withHelp = false) {
  const timestamp = new Date().toISOString();
  if (withHelp) {
    await db.insert(helpRequests).values({
      id: ids.help,
      email: "fixture@example.test",
      needCategory: "other",
      urgency: "media",
      status: "closed",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(assignments).values({
      id: ids.assignment,
      helpRequestId: ids.help,
      professionalId: ids.pro,
      status: "closed",
      source: "seeker",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  await db.insert(conversations).values({
    id: ids.conv,
    professionalId: ids.pro,
    seekerSid: ids.sid,
    helpRequestId: withHelp ? ids.help : null,
    status: "closed",
    closedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(seekerSessions).values({
    sid: ids.sid,
    conversationId: ids.conv,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
  });
}
function directForm() {
  const form = new FormData();
  form.set("professionalId", ids.pro);
  form.set("helpRequestId", "unverified-foreign-request");
  return form;
}
async function conversation() {
  return db.query.conversations.findFirst({
    where: eq(conversations.id, ids.conv),
  });
}
async function professional() {
  return db.query.professionals.findFirst({
    where: eq(professionals.id, ids.pro),
  });
}

describe("chat: transacciones, permisos actuales y lectura auténtica", () => {
  beforeAll(async () => {
    const timestamp = new Date().toISOString();
    await db.insert(user).values([
      {
        id: ids.user,
        name: "Cuenta ficticia",
        email: `${prefix}@example.test`,
      },
      {
        id: ids.foreignUser,
        name: "Cuenta ajena ficticia",
        email: `${prefix}-foreign@example.test`,
      },
    ]);
    await db.insert(professionals).values(
      [
        { id: ids.pro, userId: ids.user },
        { id: ids.foreign, userId: ids.foreignUser },
      ].map((actor) => ({
        ...actor,
        email: `${actor.id}@example.test`,
        fullName: "Profesional ficticio",
        status: "approved",
        acceptingRequests: true,
        remoteAvailable: true,
        maxActiveRequests: 10,
        languages: '["es"]',
        supportAreas: "[]",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    mocks.getCookie.mockReset();
    mocks.setCookie.mockClear();
    mocks.getSession.mockReset().mockResolvedValue(proSession);
    mocks.link.mockReset().mockResolvedValue(true);
    mocks.disconnect.mockReset().mockResolvedValue(true);
    mocks.notify.mockReset().mockResolvedValue(undefined);
    await clearThreads();
    await db
      .update(professionals)
      .set({
        status: "approved",
        currentActiveRequests: 0,
        maxActiveRequests: 10,
      })
      .where(eq(professionals.id, ids.pro));
  });
  afterAll(async () => {
    await clearThreads();
    await db
      .delete(professionals)
      .where(sql`${professionals.id} IN (${ids.pro},${ids.foreign})`);
    await db
      .delete(user)
      .where(sql`${user.id} IN (${ids.user},${ids.foreignUser})`);
    client.close();
  });
  it("fallo al guardar sesión revierte también hilo y cupo; el reintento crea uno", async () => {
    const totalBefore = await count("conversations");
    await client.execute(
      `CREATE TRIGGER chat_fixture_session_failure BEFORE INSERT ON seeker_sessions BEGIN SELECT RAISE(ABORT,'fixture'); END`,
    );
    try {
      await expect(createConversation(directForm())).rejects.toThrow();
      expect(await count("conversations")).toBe(totalBefore);
      expect((await professional())?.currentActiveRequests).toBe(0);
      expect(mocks.setCookie).not.toHaveBeenCalled();
    } finally {
      await client.execute("DROP TRIGGER chat_fixture_session_failure");
    }
    await expect(createConversation(directForm())).rejects.toThrow(
      "fixture-redirect:/c/",
    );
    const [created] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.professionalId, ids.pro));
    expect(created.helpRequestId).toBeNull();
    expect((await professional())?.currentActiveRequests).toBe(1);
    const token = verifySeekerToken(
      mocks.setCookie.mock.calls[0][1],
      getAuthSecret(),
      Date.now(),
    );
    expect(token?.helpRequestId).toBeUndefined();
    expect(token?.conversationId).toBe(created.id);
  });
  it("último cupo y límite de tres solicitudes por IP se deciden dentro del batch", async () => {
    mocks.getSession.mockResolvedValue(null);
    await db
      .update(professionals)
      .set({ maxActiveRequests: 1 })
      .where(eq(professionals.id, ids.pro));
    const attempts = await Promise.allSettled([
      createConversation(directForm()),
      createConversation(directForm()),
    ]);
    expect(
      attempts.filter(
        (entry) =>
          entry.status === "rejected" &&
          String(entry.reason).includes("fixture-redirect:/c/"),
      ),
    ).toHaveLength(1);
    expect((await professional())?.currentActiveRequests).toBe(1);
    await clearThreads();
    await db
      .update(professionals)
      .set({ currentActiveRequests: 0, maxActiveRequests: 10 })
      .where(eq(professionals.id, ids.pro));
    for (let i = 0; i < 3; i++)
      await expect(createConversation(directForm())).rejects.toThrow(
        "fixture-redirect:/c/",
      );
    await expect(createConversation(directForm())).rejects.toThrow(
      "fixture-redirect:/profesionales",
    );
    expect((await professional())?.currentActiveRequests).toBe(3);
  });
  it("fallo de vinculación opcional conserva el chat creado y su cookie", async () => {
    mocks.link.mockRejectedValue(new Error("Fallo de vínculo ficticio"));
    await expect(createConversation(directForm())).rejects.toThrow(
      "fixture-redirect:/c/",
    );
    expect(mocks.setCookie).toHaveBeenCalledTimes(1);
    expect((await professional())?.currentActiveRequests).toBe(1);
  });
  it("fallo tardío de reapertura revierte hilo, caso, asignación y cupo", async () => {
    await thread(true);
    await client.execute(
      `CREATE TRIGGER chat_fixture_assignment_failure BEFORE UPDATE ON assignments BEGIN SELECT RAISE(ABORT,'fixture'); END`,
    );
    try {
      expect(await reopenConversation(ids.conv)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect((await conversation())?.status).toBe("closed");
      expect((await professional())?.currentActiveRequests).toBe(0);
      expect(
        (
          await db.query.helpRequests.findFirst({
            where: eq(helpRequests.id, ids.help),
          })
        )?.status,
      ).toBe("closed");
      expect(
        (
          await db.query.assignments.findFirst({
            where: eq(assignments.id, ids.assignment),
          })
        )?.status,
      ).toBe("closed");
      expect(
        await db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityId, ids.conv)),
      ).toHaveLength(0);
      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    } finally {
      await client.execute("DROP TRIGGER chat_fixture_assignment_failure");
    }
    expect(await reopenConversation(ids.conv)).toEqual({
      ok: true,
      role: "professional",
    });
    expect((await professional())?.currentActiveRequests).toBe(1);
    expect((await conversation())?.status).toBe("open");
  });
  it("reaperturas concurrentes no duplican cupo ni auditoría", async () => {
    await thread();
    const results = await Promise.all([
      reopenConversation(ids.conv),
      reopenConversation(ids.conv),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await professional())?.currentActiveRequests).toBe(1);
    expect(
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, ids.conv)),
    ).toHaveLength(1);
  });
  it("revocación durante espera impide reapertura y no reserva cupo", async () => {
    await thread();
    mocks.getSession.mockResolvedValue(null);
    mocks.getCookie.mockImplementation((name) =>
      name === SEEKER_COOKIE ? { value: seekerToken() } : undefined,
    );
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(seekerSessions)
        .set({ revokedAt: new Date() })
        .where(eq(seekerSessions.sid, ids.sid));
      return original(queries);
    });
    expect(await reopenConversation(ids.conv)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
    expect((await conversation())?.status).toBe("closed");
    expect((await professional())?.currentActiveRequests).toBe(0);
  });
  it.each([
    "pending",
    "deleting",
    "suspended",
    "rejected",
  ])("estado %s bloquea vista, token y acciones profesionales incluso con HMAC", async (status) => {
    await thread();
    await db
      .update(professionals)
      .set({ status })
      .where(eq(professionals.id, ids.pro));
    mocks.getCookie.mockImplementation((name) =>
      name === PRO_COOKIE ? { value: proToken() } : undefined,
    );
    expect(await loadChatView(ids.conv)).toBeNull();
    expect(await ensureProChatToken(ids.conv)).toEqual({ ok: false });
    expect(await reopenConversation(ids.conv)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
    expect((await deleteConversation(ids.conv)).ok).toBe(false);
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("revocación después de leer la sesión impide renovar la cookie", async () => {
    await thread();
    mocks.getSession.mockResolvedValue(null);
    mocks.getCookie.mockImplementation((name) =>
      name === SEEKER_COOKIE ? { value: seekerToken() } : undefined,
    );
    const original = db.query.seekerSessions.findFirst.bind(
      db.query.seekerSessions,
    );
    // El consumidor sólo espera el resultado. Esta barrera de prueba devuelve
    // una Promise para intercalar la revocación; no emula el builder de Drizzle.
    const readThenRevoke = async (query: Parameters<typeof original>[0]) => {
      const snapshot = await original(query);
      await db
        .update(seekerSessions)
        .set({ revokedAt: new Date() })
        .where(eq(seekerSessions.sid, ids.sid));
      return snapshot;
    };
    vi.spyOn(db.query.seekerSessions, "findFirst").mockImplementationOnce(
      readThenRevoke as unknown as typeof db.query.seekerSessions.findFirst,
    );
    expect(await renewSeekerChatToken(ids.conv)).toEqual({ ok: false });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("borrar corta sockets después de persistir papelera y puede restaurar con audit único", async () => {
    await thread();
    expect((await deleteConversation(ids.conv)).ok).toBe(true);
    expect((await conversation())?.deletedAt).toBeTruthy();
    expect(mocks.disconnect).toHaveBeenCalledWith(ids.conv);
    expect(await reopenConversation(ids.conv)).toEqual({
      ok: false,
      reason: "not_closed",
    });
    expect(await renewSeekerChatToken(ids.conv)).toEqual({ ok: false });
    expect((await restoreConversation(ids.conv)).ok).toBe(true);
    expect((await conversation())?.deletedAt).toBeNull();
    expect(
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, ids.conv)),
    ).toHaveLength(2);
  });
  it("suspensión después del precheck impide borrar, auditar o desconectar", async () => {
    await thread();
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(professionals)
        .set({ status: "deleting" })
        .where(eq(professionals.id, ids.pro));
      return original(queries);
    });
    expect((await deleteConversation(ids.conv)).ok).toBe(false);
    expect((await conversation())?.deletedAt).toBeNull();
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, ids.conv)),
    ).toHaveLength(0);
  });
  it("abrir token no marca leído; acknowledgment monótono no consume mensajes más nuevos", async () => {
    await thread();
    const now = Date.now(),
      first = now - 2000,
      second = now - 1000;
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(first), lastMessageRole: "seeker" })
      .where(eq(conversations.id, ids.conv));
    expect(await ensureProChatToken(ids.conv)).toEqual({ ok: true });
    expect((await conversation())?.proLastReadAt).toBeNull();
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(second) })
      .where(eq(conversations.id, ids.conv));
    expect(await markProfessionalChatRead(ids.conv, first)).toEqual({
      ok: true,
    });
    expect((await conversation())?.proLastReadAt?.getTime()).toBe(first);
    expect((await conversation())?.lastMessageAt?.getTime()).toBe(second);
    expect(await markProfessionalChatRead(ids.conv, first - 1000)).toEqual({
      ok: true,
    });
    expect((await conversation())?.proLastReadAt?.getTime()).toBe(first);
    expect(await markProfessionalChatRead(ids.conv, now + 60000)).toEqual({
      ok: false,
    });
    mocks.getSession.mockResolvedValue({
      user: { id: ids.foreignUser, email: "foreign@example.test" },
    });
    expect(await markProfessionalChatRead(ids.conv, second)).toEqual({
      ok: false,
    });
    expect((await conversation())?.proLastReadAt?.getTime()).toBe(first);
  });
});
