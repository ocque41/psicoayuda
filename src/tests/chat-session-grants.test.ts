import { createHmac } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  session as authSessions,
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import {
  mintSeekerToken,
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
  verifyProfessionalInboxToken,
  verifyProfessionalToken,
} from "@/lib/seeker-token";
import { makeOnBeforeConnect } from "@/server/auth-gate";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  current: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.current }));
vi.mock("@/lib/notifications", () => ({
  notifyConversationDeleted: vi.fn(),
  notifyConversationReopened: vi.fn(),
  notifyAdminWaitlistEntry: vi.fn(),
  notifyWaitlistConfirmation: vi.fn(),
  conversationUrl: () => "https://nido.example",
}));
vi.mock("@/lib/chat-admin", () => ({ disconnectConversationSockets: vi.fn() }));

import { clearChatSessionCookies } from "@/app/actions-chat-session";
import {
  ensureProChatToken,
  ensureProInboxToken,
  markProfessionalChatRead,
  renewSeekerChatToken,
  verifyConversationE2eeActor,
} from "@/app/c/[conversationId]/actions";
import { loadChatView } from "@/lib/chat-view";

const url = process.env.DATABASE_URL;
if (!url?.includes("nido-tests-")) throw new Error("Requiere test:isolated.");
const client = createClient({ url });
const P = "test-session-grants";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  conv: `${P}-conv`,
  auth: `${P}-auth`,
  sid: `${P}-sid`,
  otherSid: `${P}-sid-other`,
};
const secret = getAuthSecret();
const transport = {
  prepare: (sql: string) => ({
    bind: (...args: (string | number)[]) => ({
      first: async () => (await client.execute({ sql, args })).rows[0] ?? null,
    }),
  }),
} as unknown as D1Database;
const env = {
  DB: transport,
  get BETTER_AUTH_SECRET() {
    return secret;
  },
  BETTER_AUTH_URL: "https://nido.example",
};
const store = { get: mocks.get, set: mocks.set, delete: mocks.remove };
const current = () => ({
  user: { id: id.user },
  session: { id: id.auth, expiresAt: new Date(Date.now() + 3600000) },
});
function seekCookie(sid = id.sid) {
  const now = Date.now();
  return mintSeekerToken(
    {
      sid,
      conversationId: id.conv,
      role: "seeker",
      iat: now,
      exp: now + 3600000,
    },
    secret,
  );
}
function signed(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
async function socketGate(name: string, token: string) {
  return makeOnBeforeConnect(env)(
    new Request(
      `https://nido.example/parties/conversation/${id.conv}${name === PRO_INBOX_COOKIE ? "?avisos=1" : ""}`,
      { headers: { Cookie: `${name}=${token}` } },
    ),
    { party: "conversation", name: id.conv },
  );
}
async function cleanup() {
  await db
    .delete(seekerSessions)
    .where(eq(seekerSessions.conversationId, id.conv));
  await db.delete(conversations).where(eq(conversations.id, id.conv));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}
beforeEach(async () => {
  vi.restoreAllMocks();
  mocks.get.mockReset();
  mocks.set.mockReset();
  mocks.remove.mockReset();
  mocks.cookies.mockReset().mockResolvedValue(store);
  mocks.current.mockReset().mockImplementation(current);
  await cleanup();
  await db.insert(user).values({
    id: id.user,
    name: "Cuenta ficticia",
    email: `${P}@example.test`,
  });
  await db.insert(authSessions).values({
    id: id.auth,
    userId: id.user,
    token: `${P}-token`,
    expiresAt: new Date(Date.now() + 3600000),
  });
  const now = new Date().toISOString();
  await db.insert(professionals).values({
    id: id.pro,
    userId: id.user,
    email: `${P}@example.test`,
    fullName: "Profesional ficticio",
    status: "approved",
    languages: "[]",
    supportAreas: "[]",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(conversations).values({
    id: id.conv,
    professionalId: id.pro,
    seekerSid: id.sid,
    status: "open",
    lastMessageAt: new Date(Date.now() - 1000),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(seekerSessions).values(
    [id.sid, id.otherSid].map((sid) => ({
      sid,
      conversationId: id.conv,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    })),
  );
});
afterAll(async () => {
  await cleanup();
  client.close();
});

describe("grants chat ligados a una sesión revocable", () => {
  it("revelación/restauración de sala exige el actor y rol frescos, incluido seeker de otro dispositivo", async () => {
    expect(
      (await verifyConversationE2eeActor(id.conv, "professional", id.pro)).ok,
    ).toBe(true);
    expect(
      await verifyConversationE2eeActor(
        id.conv,
        "professional",
        "otro-profesional",
      ),
    ).toEqual({ ok: false });
    mocks.current.mockResolvedValue(null);
    expect(
      await verifyConversationE2eeActor(id.conv, "professional", id.pro),
    ).toEqual({ ok: false });
    mocks.get.mockImplementation((name) =>
      name === SEEKER_COOKIE ? { value: seekCookie(id.otherSid) } : undefined,
    );
    expect((await verifyConversationE2eeActor(id.conv, "seeker")).ok).toBe(
      true,
    );
    await db
      .update(seekerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(seekerSessions.sid, id.otherSid));
    expect(await verifyConversationE2eeActor(id.conv, "seeker")).toEqual({
      ok: false,
    });
  });
  it.each([
    "sala",
    "inbox",
  ])("Set-Cookie tardío de %s después de logout no autoriza WS", async (kind) => {
    let release!: () => void;
    let waiting!: () => void;
    const reached = new Promise<void>((resolve) => {
      waiting = resolve;
    });
    mocks.cookies.mockImplementationOnce(() => {
      waiting();
      return new Promise<typeof store>((resolve) => {
        release = () => resolve(store);
      });
    });
    const pending =
      kind === "sala" ? ensureProChatToken(id.conv) : ensureProInboxToken();
    await reached;
    await clearChatSessionCookies();
    // BetterAuth confirma logout eliminando ESTA fila. La autorización leída
    // antes por la renovación ya no puede conceder un acceso vivo.
    await db.delete(authSessions).where(eq(authSessions.id, id.auth));
    release();
    expect(await pending).toEqual({ ok: true });
    const name = kind === "sala" ? PRO_COOKIE : PRO_INBOX_COOKIE;
    const token = mocks.set.mock.calls.find((call) => call[0] === name)?.[1];
    expect(typeof token).toBe("string");
    const payload =
      kind === "sala"
        ? verifyProfessionalToken(token, secret, Date.now())
        : verifyProfessionalInboxToken(token, secret, Date.now());
    expect(payload?.authSessionId).toBe(id.auth);
    expect(payload?.userId).toBe(id.user);
    const rejected = await socketGate(name, token);
    expect(rejected).toBeInstanceOf(Response);
    expect((rejected as Response).status).toBe(403);
    mocks.current.mockResolvedValue(null);
    mocks.get.mockReturnValue({ value: token });
    expect(await loadChatView(id.conv)).toBeNull();
    expect(await markProfessionalChatRead(id.conv, Date.now() - 1000)).toEqual({
      ok: false,
    });
  });
  it("salida revoca sesión actual aunque signOut del proveedor oculte fallo; otra sesión permanece", async () => {
    const otherAuth = `${P}-auth-other`;
    await db.insert(authSessions).values({
      id: otherAuth,
      userId: id.user,
      token: `${P}-other-token`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(await ensureProInboxToken()).toEqual({ ok: true });
    const token = mocks.set.mock.calls[0][1];
    await clearChatSessionCookies();
    expect(
      await db.query.session.findFirst({ where: eq(authSessions.id, id.auth) }),
    ).toBeUndefined();
    expect(
      await db.query.session.findFirst({
        where: eq(authSessions.id, otherAuth),
      }),
    ).toBeDefined();
    expect(
      ((await socketGate(PRO_INBOX_COOKIE, token)) as Response).status,
    ).toBe(403);
  });
  it("expiración real de BetterAuth rechaza ambos canales aunque HMAC no expire", async () => {
    expect(await ensureProChatToken(id.conv)).toEqual({ ok: true });
    expect(await ensureProInboxToken()).toEqual({ ok: true });
    const grants = mocks.set.mock.calls.map(
      ([name, token]) => [name, token] as const,
    );
    for (const [name, token] of grants)
      expect(await socketGate(name, token)).toBeInstanceOf(Request);
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(authSessions.id, id.auth));
    for (const [name, token] of grants)
      expect(((await socketGate(name, token)) as Response).status).toBe(403);
    expect(await ensureProChatToken(id.conv)).toEqual({ ok: false });
    expect(await ensureProInboxToken()).toEqual({ ok: false });
    expect(await loadChatView(id.conv)).toBeNull();
  });
  it("no acepta cookie pro legada sin binding; login vivo permite renovarla", async () => {
    const now = Date.now();
    const legacy = signed({
      professionalId: id.pro,
      conversationId: id.conv,
      role: "professional",
      iat: now,
      exp: now + 3600000,
    });
    expect(verifyProfessionalToken(legacy, secret, now)).toBeNull();
    expect(((await socketGate(PRO_COOKIE, legacy)) as Response).status).toBe(
      403,
    );
    mocks.get.mockImplementation((name) =>
      name === PRO_COOKIE ? { value: legacy } : undefined,
    );
    mocks.current.mockResolvedValue(null);
    expect(await loadChatView(id.conv)).toBeNull();
    expect(await ensureProChatToken(id.conv)).toEqual({ ok: false });
    mocks.current.mockImplementation(current);
    expect((await loadChatView(id.conv))?.role).toBe("professional");
    expect(await ensureProChatToken(id.conv)).toEqual({ ok: true });
  });
  it("binding user/sesión/propietario debe coincidir; headers externos no lo sustituyen", async () => {
    const now = Date.now();
    for (const patch of [
      { userId: "otro-usuario" },
      { authSessionId: "otra-sesion" },
      { professionalId: "otro-pro" },
    ]) {
      const token = signed({
        professionalId: id.pro,
        authSessionId: id.auth,
        userId: id.user,
        conversationId: id.conv,
        role: "professional",
        iat: now,
        exp: now + 3600000,
        ...patch,
      });
      expect(((await socketGate(PRO_COOKIE, token)) as Response).status).toBe(
        403,
      );
    }
    const legacy = signed({
      professionalId: id.pro,
      conversationId: id.conv,
      role: "professional",
      iat: now,
      exp: now + 3600000,
    });
    const forged = await makeOnBeforeConnect(env)(
      new Request(`https://nido.example/parties/conversation/${id.conv}`, {
        headers: {
          Cookie: `${PRO_COOKIE}=${legacy}`,
          "x-nido-auth-session-id": id.auth,
          "x-nido-user-id": id.user,
        },
      }),
      { party: "conversation", name: id.conv },
    );
    expect((forged as Response).status).toBe(403);
  });
  it("revocar BetterAuth después de leer el actor impide marcar lectura dentro del SQL", async () => {
    const original = db.all.bind(db);
    vi.spyOn(db, "all").mockImplementationOnce((query) => {
      const pending = (async () => {
        await db.delete(authSessions).where(eq(authSessions.id, id.auth));
        return original(query);
      })();
      return pending as unknown as ReturnType<typeof db.all>;
    });
    expect(await markProfessionalChatRead(id.conv, Date.now() - 2000)).toEqual({
      ok: false,
    });
    expect(
      (
        await db.query.conversations.findFirst({
          where: eq(conversations.id, id.conv),
        })
      )?.proLastReadAt,
    ).toBeNull();
  });
  it("logout seeker revoca sólo sid actual; renovación leída antes no lo reactiva", async () => {
    const raw = seekCookie();
    mocks.get.mockImplementation((name) =>
      name === SEEKER_COOKIE ? { value: raw } : undefined,
    );
    const original = db.query.seekerSessions.findFirst.bind(
      db.query.seekerSessions,
    );
    let release!: () => void;
    let reached!: () => void;
    const waiting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    vi.spyOn(db.query.seekerSessions, "findFirst").mockImplementationOnce(
      (options) => {
        const pending = (async () => {
          const row = await original(options);
          reached();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return row;
        })();
        return pending as unknown as ReturnType<typeof original>;
      },
    );
    const pending = renewSeekerChatToken(id.conv);
    await waiting;
    await clearChatSessionCookies();
    release();
    expect(await pending).toEqual({ ok: false });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(((await socketGate(SEEKER_COOKIE, raw)) as Response).status).toBe(
      403,
    );
    const other = seekCookie(id.otherSid);
    expect(await socketGate(SEEKER_COOKIE, other)).toBeInstanceOf(Request);
    expect(
      (
        await db.query.seekerSessions.findFirst({
          where: eq(seekerSessions.sid, id.otherSid),
        })
      )?.revokedAt,
    ).toBeNull();
  });
});
