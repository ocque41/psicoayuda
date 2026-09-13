import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, professionals, user } from "@/db/schema";
import { conversationsForProfessional } from "@/lib/offers";

const P = "test-inbox";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  unread: `${P}-unread`,
  read: `${P}-read`,
  proLast: `${P}-pro-last`,
  direct: `${P}-direct`,
};

const NOW = Date.now();
const HOUR = 3_600_000;

async function cleanup() {
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

describe("bandeja del profesional (orden + no leídos)", () => {
  beforeAll(async () => {
    await cleanup();
    const iso = new Date().toISOString();
    await db.insert(user).values({
      id: id.user,
      name: "Pro Bandeja",
      email: `${id.user}@test.local`,
    });
    await db.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.pro}@test.local`,
      fullName: "Pro Bandeja",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values([
      {
        id: id.unread,
        professionalId: id.pro,
        seekerSid: `${P}-sid-1`,
        seekerName: "María",
        status: "open",
        lastMessageAt: new Date(NOW - 2 * HOUR),
        lastMessageRole: "seeker",
        createdAt: new Date(NOW - 10 * HOUR).toISOString(),
        updatedAt: iso,
      },
      {
        id: id.read,
        professionalId: id.pro,
        seekerSid: `${P}-sid-2`,
        status: "open",
        lastMessageAt: new Date(NOW - 1 * HOUR),
        lastMessageRole: "seeker",
        proLastReadAt: new Date(NOW),
        createdAt: new Date(NOW - 10 * HOUR).toISOString(),
        updatedAt: iso,
      },
      {
        id: id.proLast,
        professionalId: id.pro,
        seekerSid: `${P}-sid-3`,
        status: "open",
        lastMessageAt: new Date(NOW),
        lastMessageRole: "professional",
        createdAt: new Date(NOW - 10 * HOUR).toISOString(),
        updatedAt: iso,
      },
      {
        id: id.direct,
        professionalId: id.pro,
        seekerSid: `${P}-sid-4`,
        status: "closed",
        closedReason: "inactivity",
        createdAt: new Date(NOW - 3 * HOUR).toISOString(),
        updatedAt: iso,
      },
    ]);
  });

  afterAll(cleanup);

  it("ordena por última actividad (no por creación)", async () => {
    const rows = await conversationsForProfessional(id.pro);
    expect(rows.map((row) => row.conversationId)).toEqual([
      id.proLast,
      id.read,
      id.unread,
      id.direct,
    ]);
  });

  it("expone metadatos para el badge de no leído", async () => {
    const rows = await conversationsForProfessional(id.pro);

    const unread = rows.find((row) => row.conversationId === id.unread);
    expect(unread?.lastMessageRole).toBe("seeker");
    expect(unread?.proLastReadAt).toBeNull();
    expect(unread?.seekerName).toBe("María");

    const read = rows.find((row) => row.conversationId === id.read);
    expect(read?.proLastReadAt?.getTime()).toBe(NOW);

    const direct = rows.find((row) => row.conversationId === id.direct);
    expect(direct?.status).toBe("closed");
    expect(direct?.closedReason).toBe("inactivity");
  });
});
