import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  session as authSessions,
  conversations,
  professionals,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({ session: vi.fn(), live: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/chat-professional-session", () => ({
  loadLiveChatProfessional: (...args: unknown[]) => mocks.live(...args),
}));

import { GET } from "@/app/api/pro/chats/route";
import { conversationsForProfessional } from "@/lib/offers";

if (!process.env.DATABASE_URL?.includes("nido-tests-"))
  throw new Error("Requiere test:isolated.");
const fixture = {
  users: ["fixture-chat-api-user-a", "fixture-chat-api-user-b"],
  pros: ["fixture-chat-api-pro-a", "fixture-chat-api-pro-b"],
  sids: ["fixture-chat-api-sid-a", "fixture-chat-api-sid-b"],
  rooms: ["fixture-chat-api-room-a", "fixture-chat-api-room-b"],
};
const real = await vi.importActual<
  typeof import("@/lib/chat-professional-session")
>("@/lib/chat-professional-session");
const current = (index = 0) => ({
  user: { id: fixture.users[index], emailVerified: true },
  session: {
    id: fixture.sids[index],
    expiresAt: new Date(Date.now() + 3600000),
  },
});
const request = (index = 0) =>
  new Request(
    `https://nido.example.invalid/api/pro/chats?professionalId=${fixture.pros[index]}`,
  );
async function clean() {
  await db
    .delete(conversations)
    .where(inArray(conversations.id, fixture.rooms));
  await db.delete(professionals).where(inArray(professionals.id, fixture.pros));
  await db.delete(authSessions).where(inArray(authSessions.id, fixture.sids));
  await db.delete(user).where(inArray(user.id, fixture.users));
}
beforeEach(async () => {
  vi.resetAllMocks();
  await clean();
  for (let index = 0; index < 2; index++) {
    await db.insert(user).values({
      id: fixture.users[index],
      name: "Cuenta ficticia",
      email: `chat-api-${index}@example.invalid`,
      emailVerified: true,
    });
    await db.insert(authSessions).values({
      id: fixture.sids[index],
      userId: fixture.users[index],
      token: `fictional-chat-api-token-${index}`,
      expiresAt: new Date(Date.now() + 3600000),
    });
    await db.insert(professionals).values({
      id: fixture.pros[index],
      userId: fixture.users[index],
      fullName: "Profesional ficticio",
      email: `chat-api-${index}@example.invalid`,
      status: "approved",
      languages: "[]",
      supportAreas: "[]",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.insert(conversations).values({
      id: fixture.rooms[index],
      seekerSid: `fixture-chat-api-seeker-${index}`,
      professionalId: fixture.pros[index],
      seekerName: `Alias ficticio ${index}`,
      seekerEmail: `private-contact-${index}@example.invalid`,
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  mocks.session.mockResolvedValue(current());
  mocks.live.mockImplementation(real.loadLiveChatProfessional);
});
afterAll(clean);

describe("API de metadatos con SID y dueño vigentes dentro del SQL", () => {
  it.each([
    "pending_verification",
    "suspended",
    "rejected",
    "deleting",
  ])("rechaza el profesional en estado %s", async (status) => {
    await db
      .update(professionals)
      .set({ status })
      .where(eq(professionals.id, fixture.pros[0]));
    expect((await GET(request())).status).toBe(403);
  });
  it.each([
    null,
    { user: { id: fixture.users[0] } },
  ])("rechaza la cuenta sin SID %j", async (session) => {
    mocks.session.mockResolvedValue(session);
    expect((await GET(request())).status).toBe(401);
  });
  it("entrega sólo metadatos propios y respuesta privada sin contactos", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      professionalId: fixture.pros[0],
      chats: [{ id: fixture.rooms[0], seekerName: "Alias ficticio 0" }],
    });
    expect(body).not.toContain(fixture.rooms[1]);
    expect(body).not.toContain("private-contact");
    expect(body).not.toContain("token");
  });
  it("sin parámetro de dueño conserva la consulta del actor vigente", async () => {
    const response = await GET(
      new Request("https://nido.example.invalid/api/pro/chats"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      professionalId: fixture.pros[0],
      chats: [{ id: fixture.rooms[0], seekerName: "Alias ficticio 0" }],
    });
    expect(mocks.live).toHaveBeenCalledWith(undefined);
  });
  it("revocar SID entre cargar actor y leer lista no devuelve metadatos", async () => {
    mocks.live.mockImplementation(async (expected?: string) => {
      const actor = await real.loadLiveChatProfessional(expected);
      await db.delete(authSessions).where(eq(authSessions.id, fixture.sids[0]));
      return actor;
    });
    expect(await (await GET(request())).json()).toEqual({
      professionalId: fixture.pros[0],
      chats: [],
    });
  });
  it("suspender después de cargar actor tampoco devuelve la lista", async () => {
    mocks.live.mockImplementation(async (expected?: string) => {
      const actor = await real.loadLiveChatProfessional(expected);
      await db
        .update(professionals)
        .set({ status: "suspended" })
        .where(eq(professionals.id, fixture.pros[0]));
      return actor;
    });
    expect(await (await GET(request())).json()).toEqual({
      professionalId: fixture.pros[0],
      chats: [],
    });
  });
  it("no mezcla la sala A con la lista B tras cambiar de cuenta", async () => {
    mocks.session.mockResolvedValue(current(1));
    const response = await GET(request(0));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ chats: [] });
    expect((await GET(request(1))).status).toBe(200);
  });
  it("un SID ajeno, inexistente o caducado no autoriza SELECT aunque el dueño coincida", async () => {
    for (const authSessionId of [fixture.sids[1], "fixture-no-sid"])
      expect(
        await conversationsForProfessional(fixture.pros[0], {
          userId: fixture.users[0],
          authSessionId,
        }),
      ).toEqual([]);
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(authSessions.id, fixture.sids[0]));
    expect(
      await conversationsForProfessional(fixture.pros[0], {
        userId: fixture.users[0],
        authSessionId: fixture.sids[0],
      }),
    ).toEqual([]);
  });
});
