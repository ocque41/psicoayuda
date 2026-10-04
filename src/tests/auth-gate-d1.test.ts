import { createClient } from "@libsql/client";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  session as authSessions,
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import {
  mintProfessionalInboxToken,
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
import { makeOnBeforeConnect } from "@/server/auth-gate";

const prefix = "test-chat-gate-d1";
const secret = "test-secret";
const url = process.env.DATABASE_URL;
if (!url?.includes("nido-tests-"))
  throw new Error("Esta prueba requiere test:isolated.");
const client = createClient({ url });
const fixtureDb = {
  prepare: (statement: string) => ({
    bind: (...args: (string | number)[]) => ({
      first: async () =>
        (await client.execute({ sql: statement, args })).rows[0] ?? null,
    }),
  }),
} as unknown as D1Database;
const env = {
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "https://nido.example",
  DB: fixtureDb,
};
function request(role: "seeker" | "professional", pro = `${prefix}-pro`) {
  const now = Date.now();
  const cookie =
    role === "professional"
      ? `${PRO_COOKIE}=${mintProfessionalToken({ professionalId: pro, authSessionId: `${prefix}-auth`, userId: `${prefix}-user`, conversationId: `${prefix}-conv`, role, iat: now, exp: now + 3600000 }, secret)}`
      : `${SEEKER_COOKIE}=${mintSeekerToken({ sid: `${prefix}-sid`, conversationId: `${prefix}-conv`, role, iat: now, exp: now + 3600000 }, secret)}`;
  return new Request("https://nido.example/parties/conversation/fixture", {
    headers: {
      Cookie: cookie,
      Origin: "https://nido.example",
      Upgrade: "websocket",
    },
  });
}
const lobby = { party: "conversation", name: `${prefix}-conv` };
async function cleanup() {
  await db
    .delete(seekerSessions)
    .where(like(seekerSessions.conversationId, `${prefix}-%`));
  await db.delete(conversations).where(like(conversations.id, `${prefix}-%`));
  await db.delete(professionals).where(like(professionals.id, `${prefix}-%`));
  await db.delete(user).where(like(user.id, `${prefix}-%`));
}
describe("chat: autorización D1 fail-closed y pertenencia actual", () => {
  beforeAll(async () => {
    await cleanup();
    const timestamp = new Date().toISOString();
    await db.insert(user).values([
      {
        id: `${prefix}-user`,
        name: "Cuenta ficticia",
        email: `${prefix}@example.test`,
      },
      {
        id: `${prefix}-other-user`,
        name: "Otra cuenta ficticia",
        email: `${prefix}-other@example.test`,
      },
    ]);
    await db.insert(professionals).values(
      ["pro", "other"].map((name) => ({
        id: `${prefix}-${name}`,
        userId: `${prefix}-${name === "pro" ? "user" : "other-user"}`,
        email: `${prefix}-${name}@example.test`,
        fullName: "Profesional ficticio",
        status: "approved",
        languages: '["es"]',
        supportAreas: "[]",
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
    await db.insert(authSessions).values({
      id: `${prefix}-auth`,
      userId: `${prefix}-user`,
      token: `${prefix}-token`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await db.insert(conversations).values({
      id: `${prefix}-conv`,
      professionalId: `${prefix}-pro`,
      seekerSid: `${prefix}-sid`,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.insert(seekerSessions).values({
      sid: `${prefix}-sid`,
      conversationId: `${prefix}-conv`,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });
  });
  afterAll(async () => {
    await cleanup();
    client.close();
  });
  it.each([
    "seeker",
    "professional",
  ] as const)("sin D1 o con excepción rechaza %s aunque HMAC sea válido", async (role) => {
    for (const DB of [
      undefined,
      {
        prepare: () => {
          throw new Error("Fallo sintético de BD");
        },
      } as unknown as D1Database,
    ]) {
      const result = await makeOnBeforeConnect({ ...env, DB })(
        request(role),
        lobby,
      );
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    }
  });
  it("autoriza dueño aprobado y persona vigente; no confía en headers del cliente", async () => {
    for (const role of ["seeker", "professional"] as const) {
      const result = await makeOnBeforeConnect(env)(request(role), lobby);
      expect(result).toBeInstanceOf(Request);
      expect((result as Request).headers.get("x-nido-role")).toBe(role);
      expect((result as Request).headers.get("x-nido-can-send")).toBe("1");
    }
  });
  it("rechaza token de profesional aprobado ajeno aunque el hilo del token coincida", async () => {
    const result = await makeOnBeforeConnect(env)(
      request("professional", `${prefix}-other`),
      lobby,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
  it.each([
    "pending",
    "deleting",
    "suspended",
    "rejected",
  ])("rechaza profesional %s y conserva lectura de la persona", async (status) => {
    await db
      .update(professionals)
      .set({ status })
      .where(eq(professionals.id, `${prefix}-pro`));
    expect(
      await makeOnBeforeConnect(env)(request("professional"), lobby),
    ).toBeInstanceOf(Response);
    expect(
      await makeOnBeforeConnect(env)(request("seeker"), lobby),
    ).toBeInstanceOf(Request);
    await db
      .update(professionals)
      .set({ status: "approved" })
      .where(eq(professionals.id, `${prefix}-pro`));
  });
  it("cerrado permite leer a ambos, papelera impide ambas conexiones", async () => {
    await db
      .update(conversations)
      .set({ status: "closed" })
      .where(eq(conversations.id, `${prefix}-conv`));
    for (const role of ["seeker", "professional"] as const) {
      const result = await makeOnBeforeConnect(env)(request(role), lobby);
      expect(result).toBeInstanceOf(Request);
      expect((result as Request).headers.get("x-nido-can-send")).toBe("0");
    }
    await db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, `${prefix}-conv`));
    for (const role of ["seeker", "professional"] as const)
      expect(
        await makeOnBeforeConnect(env)(request(role), lobby),
      ).toBeInstanceOf(Response);
    await db
      .update(conversations)
      .set({ status: "open", deletedAt: null })
      .where(eq(conversations.id, `${prefix}-conv`));
  });
  it("sesión revocada o rol persistido incorrecto no autorizan", async () => {
    await db
      .update(seekerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(seekerSessions.sid, `${prefix}-sid`));
    expect(
      await makeOnBeforeConnect(env)(request("seeker"), lobby),
    ).toBeInstanceOf(Response);
    await db
      .update(seekerSessions)
      .set({ revokedAt: null, role: "professional" })
      .where(eq(seekerSessions.sid, `${prefix}-sid`));
    expect(
      await makeOnBeforeConnect(env)(request("seeker"), lobby),
    ).toBeInstanceOf(Response);
  });
  it("aviso de bandeja requiere dueño aprobado, token válido y no hereda headers públicos", async () => {
    const now = Date.now();
    const makeRequest = (pro: string, exp = now + 900000) =>
      new Request(
        "https://nido.example/parties/conversation/fixture?avisos=1",
        {
          headers: {
            Cookie: `${PRO_INBOX_COOKIE}=${mintProfessionalInboxToken({ professionalId: pro, authSessionId: `${prefix}-auth`, userId: `${prefix}-user`, role: "inbox", iat: now, exp }, secret)}`,
            Origin: "https://nido.example",
          },
        },
      );
    const result = await makeOnBeforeConnect(env)(
      makeRequest(`${prefix}-pro`),
      lobby,
    );
    expect(result).toBeInstanceOf(Request);
    expect((result as Request).headers.get("x-nido-informer")).toBe("1");
    expect((result as Request).headers.get("x-nido-can-send")).toBe("0");
    expect(
      await makeOnBeforeConnect(env)(makeRequest(`${prefix}-other`), lobby),
    ).toBeInstanceOf(Response);
    expect(
      await makeOnBeforeConnect(env)(makeRequest(`${prefix}-pro`, now), lobby),
    ).toBeInstanceOf(Response);
    await db
      .update(professionals)
      .set({ status: "pending" })
      .where(eq(professionals.id, `${prefix}-pro`));
    try {
      expect(
        await makeOnBeforeConnect(env)(makeRequest(`${prefix}-pro`), lobby),
      ).toBeInstanceOf(Response);
    } finally {
      await db
        .update(professionals)
        .set({ status: "approved" })
        .where(eq(professionals.id, `${prefix}-pro`));
    }
  });
});
