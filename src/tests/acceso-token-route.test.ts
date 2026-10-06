import { eq, inArray, like } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET } from "@/app/acceso/[token]/route";
import { db } from "@/db";
import {
  conversations,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import {
  createSeekerAccessLink,
  SEEKER_SESSION_TTL_MS,
} from "@/lib/seeker-access";
import { SEEKER_ACCESS_EXCHANGES_PER_HOUR } from "@/lib/seeker-access-session";
import {
  mintSeekerToken,
  SEEKER_COOKIE,
  verifySeekerAccessToken,
  verifySeekerToken,
} from "@/lib/seeker-token";

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

async function get(token: string, cookie?: string) {
  return GET(
    new Request(`https://nido.test/acceso/${token}`, {
      headers: cookie ? { Cookie: `${SEEKER_COOKIE}=${cookie}` } : undefined,
    }),
    {
      params: Promise.resolve({ token }),
    },
  );
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
  vi.restoreAllMocks();
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
  function browserCookie(response: Response) {
    const raw = /nido_seeker=([^;]+)/.exec(
      response.headers.get("set-cookie") ?? "",
    )?.[1];
    if (!raw) throw new Error("Sin cookie de fixture");
    const token = decodeURIComponent(raw);
    const payload = verifySeekerToken(token, getAuthSecret(), Date.now());
    if (!payload) throw new Error("Sin permiso de navegador ficticio");
    return { token, payload };
  }
  it("el enlace nuevo sólo sirve para intercambio; dos navegadores reciben SIDs propios", async () => {
    const link = await createSeekerAccessLink({ conversationId: id.conv });
    const before = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, link.sid),
    });
    expect(before?.role).toBe("access-link");
    expect(
      verifySeekerToken(link.token, getAuthSecret(), Date.now()),
    ).toBeNull();
    expect(
      verifySeekerAccessToken(link.token, getAuthSecret(), Date.now())?.purpose,
    ).toBe("access-link");
    const a = browserCookie(await get(link.token));
    const b = browserCookie(await get(link.token));
    expect(new Set([link.sid, a.payload.sid, b.payload.sid]).size).toBe(3);
    expect(a.payload.purpose).toBe("browser");
    expect(a.payload.exp - a.payload.iat).toBe(SEEKER_SESSION_TTL_MS);
    const after = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, link.sid),
    });
    expect(after).toEqual(before);
    const row = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, a.payload.sid),
    });
    expect(row?.role).toBe("seeker");
    expect(row?.conversationId).toBe(id.conv);
    expect(row?.expiresAt.getTime()).toBe(a.payload.exp);
    expect((await get(a.token)).headers.get("set-cookie")).toBeNull();
  });
  it("reutiliza SID propio y no crea sustituto si se revoca en vuelo", async () => {
    const link = await createSeekerAccessLink({ conversationId: id.conv });
    const first = browserCookie(await get(link.token));
    expect(browserCookie(await get(link.token, first.token)).payload.sid).toBe(
      first.payload.sid,
    );
    const original = db.values.bind(db);
    vi.spyOn(db, "values").mockImplementationOnce((query) => {
      const pending = (async () => {
        await db
          .update(seekerSessions)
          .set({ revokedAt: new Date() })
          .where(eq(seekerSessions.sid, first.payload.sid));
        return original(query);
      })();
      return pending as unknown as ReturnType<typeof db.values>;
    });
    const denied = await get(link.token, first.token);
    expect(denied.headers.get("set-cookie")).toBeNull();
    const fresh = browserCookie(await get(link.token));
    expect(fresh.payload.sid).not.toBe(first.payload.sid);
    expect(
      (
        await db.query.seekerSessions.findFirst({
          where: eq(seekerSessions.sid, first.payload.sid),
        })
      )?.revokedAt,
    ).not.toBeNull();
  });
  it.each([
    "revoked",
    "expired",
    "deleted",
    "anonymized",
    "purged",
    "status",
  ])("intercambio %s en carrera falla dentro del SQL sin crear permiso", async (kind) => {
    const link = await createSeekerAccessLink({ conversationId: id.conv });
    const countBefore = (
      await db.query.seekerSessions.findMany({
        where: eq(seekerSessions.conversationId, id.conv),
      })
    ).length;
    const original = db.values.bind(db);
    vi.spyOn(db, "values").mockImplementationOnce((query) => {
      const pending = (async () => {
        if (kind === "revoked")
          await db
            .update(seekerSessions)
            .set({ revokedAt: new Date() })
            .where(eq(seekerSessions.sid, link.sid));
        if (kind === "expired")
          await db
            .update(seekerSessions)
            .set({ expiresAt: new Date(Date.now() - 1) })
            .where(eq(seekerSessions.sid, link.sid));
        if (kind === "purged")
          await db
            .delete(seekerSessions)
            .where(eq(seekerSessions.sid, link.sid));
        if (kind === "deleted")
          await db
            .update(conversations)
            .set({ deletedAt: new Date() })
            .where(eq(conversations.id, id.conv));
        if (kind === "anonymized")
          await db
            .update(conversations)
            .set({ anonymizedAt: new Date().toISOString() })
            .where(eq(conversations.id, id.conv));
        if (kind === "status")
          await db
            .update(conversations)
            .set({ status: "unknown" })
            .where(eq(conversations.id, id.conv));
        return original(query);
      })();
      return pending as unknown as ReturnType<typeof db.values>;
    });
    try {
      const response = await get(link.token);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("location")).toContain("acceso=invalido");
      expect(
        (
          await db.query.seekerSessions.findMany({
            where: eq(seekerSessions.conversationId, id.conv),
          })
        ).length,
      ).toBe(countBefore - (kind === "purged" ? 1 : 0));
    } finally {
      await db
        .update(conversations)
        .set({ anonymizedAt: null, deletedAt: null, status: "open" })
        .where(eq(conversations.id, id.conv));
    }
  });
  it("el legado vivo se intercambia sin modificar su fila; revocado nunca se reactiva", async () => {
    const before = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, id.sid),
    });
    const granted = browserCookie(await get(tokenFor(id.sid, id.conv)));
    expect(granted.payload.sid).not.toBe(id.sid);
    expect(
      await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, id.sid),
      }),
    ).toEqual(before);
    expect(
      (await get(tokenFor(id.sidRevoked, id.conv))).headers.get("set-cookie"),
    ).toBeNull();
    expect(
      (
        await db.query.seekerSessions.findFirst({
          where: eq(seekerSessions.sid, id.sidRevoked),
        })
      )?.revokedAt,
    ).not.toBeNull();
  });
  it("acota altas concurrentes por enlace, permite reutilizar SID vigente y no afecta otro enlace", async () => {
    const link = await createSeekerAccessLink({ conversationId: id.conv });
    const responses = await Promise.all(
      Array.from({ length: SEEKER_ACCESS_EXCHANGES_PER_HOUR + 3 }, () =>
        get(link.token),
      ),
    );
    const allowed = responses.filter((response) =>
      response.headers.get("set-cookie"),
    );
    expect(allowed).toHaveLength(SEEKER_ACCESS_EXCHANGES_PER_HOUR);
    const first = browserCookie(allowed[0]);
    expect(browserCookie(await get(link.token, first.token)).payload.sid).toBe(
      first.payload.sid,
    );
    const another = await createSeekerAccessLink({ conversationId: id.conv });
    expect((await get(another.token)).headers.get("set-cookie")).not.toBeNull();
    expect(allowed[0].headers.get("cache-control")).toBe("no-store");
    expect(allowed[0].headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("la caducidad del token durante await también falla en el SQL", async () => {
    const link = await createSeekerAccessLink({
      conversationId: id.conv,
      ttlMs: 500,
    });
    const original = db.values.bind(db);
    vi.spyOn(db, "values").mockImplementationOnce((query) => {
      const pending = (async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, link.expiresAt - Date.now() + 5)),
        );
        return original(query);
      })();
      return pending as unknown as ReturnType<typeof db.values>;
    });
    const response = await get(link.token);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toContain("acceso=invalido");
  });
  it("rechaza rol fuente distinto aunque su firma sea válida", async () => {
    const now = Date.now();
    const mismatched = mintSeekerToken(
      {
        sid: id.sid,
        conversationId: id.conv,
        role: "seeker",
        purpose: "access-link",
        iat: now,
        exp: now + 3600000,
      },
      getAuthSecret(),
    );
    expect((await get(mismatched)).headers.get("set-cookie")).toBeNull();
  });
});
