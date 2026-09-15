import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/acceso/[token]/route";
import { db } from "@/db";
import {
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { mintSeekerToken } from "@/lib/seeker-token";

const P = "test-acceso-token";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  conv: `${P}-conv`,
  anon: `${P}-conv-anon`,
  sid: `${P}-sid`,
  sidRevoked: `${P}-sid-rev`,
  sidOtro: `${P}-sid-otro`,
};

function tokenFor(
  sid: string,
  conversationId: string,
  ttlMs = 3_600_000,
): string {
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
    .where(inArray(seekerSessions.conversationId, [id.conv, id.anon]));
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

async function get(token: string) {
  return GET(new Request(`https://nido.test/acceso/${token}`), {
    params: Promise.resolve({ token }),
  });
}

beforeAll(async () => {
  await cleanup();
  const iso = new Date().toISOString();
  await db.insert(user).values({
    id: id.user,
    name: "Pro Acceso Token",
    email: `${id.user}@example.com`,
  });
  await db.insert(professionals).values({
    id: id.pro,
    userId: id.user,
    email: `${id.pro}@example.com`,
    fullName: "Pro Acceso Token",
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
      seekerSid: id.sid,
      status: "open",
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
  ]);
  await db.insert(seekerSessions).values([
    {
      sid: id.sid,
      conversationId: id.conv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    {
      sid: id.sidRevoked,
      conversationId: id.conv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: new Date(),
    },
  ]);
  await db.insert(seekerSessions).values({
    sid: id.sidOtro,
    conversationId: id.anon,
    role: "seeker",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
});

beforeEach(async () => {
  await db
    .update(conversations)
    .set({ anonymizedAt: null })
    .where(eq(conversations.id, id.conv));
});

afterAll(cleanup);

describe("ruta /acceso/[token]", () => {
  it("con token y sesión válidos deja la cookie y entra a la sala", async () => {
    const response = await get(tokenFor(id.sid, id.conv));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://nido.test/c/${id.conv}`,
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("nido_seeker=");
    expect(cookie).toContain("Path=/");
  });

  it("acepta la sesión NUEVA del enlace mágico (sid distinto al original)", async () => {
    const magicSid = `${P}-sid-magic`;
    await db.insert(seekerSessions).values({
      sid: magicSid,
      conversationId: id.conv,
      role: "seeker",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const response = await get(tokenFor(magicSid, id.conv));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://nido.test/c/${id.conv}`,
    );
  });

  it("rechaza un token inválido", async () => {
    const response = await get("no-es-un-token");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://nido.test/ayuda?acceso=invalido",
    );
  });

  it("rechaza un token caducado", async () => {
    const response = await get(tokenFor(id.sid, id.conv, -1000));
    expect(response.headers.get("location")).toBe(
      "https://nido.test/ayuda?acceso=invalido",
    );
  });

  it("rechaza una sesión revocada", async () => {
    const response = await get(tokenFor(id.sidRevoked, id.conv));
    expect(response.headers.get("location")).toBe(
      "https://nido.test/ayuda?acceso=invalido",
    );
  });

  it("rechaza una sesión que no existe (purga) y una de otra sala", async () => {
    const missing = await get(tokenFor(`${P}-sid-fantasma`, id.conv));
    expect(missing.headers.get("location")).toBe(
      "https://nido.test/ayuda?acceso=invalido",
    );

    const other = await get(tokenFor(id.sidOtro, id.conv));
    expect(other.headers.get("location")).toBe(
      "https://nido.test/ayuda?acceso=invalido",
    );
  });

  it("rechaza una conversación anonimizada", async () => {
    await db
      .update(conversations)
      .set({ anonymizedAt: new Date().toISOString() })
      .where(eq(conversations.id, id.conv));

    const response = await get(tokenFor(id.sid, id.conv));
    expect(response.headers.get("location")).toBe(
      "https://nido.test/ayuda?acceso=invalido",
    );
  });
});
