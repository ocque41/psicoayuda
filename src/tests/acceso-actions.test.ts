import { createHash } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  accessRequests,
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";

const mocks = vi.hoisted(() => ({
  notifySeekerAccessLinks: vi.fn(async () => undefined),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9" })),
}));

vi.mock("@/lib/notifications", () => ({
  notifySeekerAccessLinks: mocks.notifySeekerAccessLinks,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { requestAccessLinks } from "@/app/acceso/actions";

const P = "test-acceso";
const EMAIL = "acceso-seeker@test.local";
const OTHER_EMAIL = "acceso-otro@test.local";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  help: `${P}-help`,
  conversation: `${P}-conv`,
  direct: `${P}-direct`,
};

function emailHash(email: string) {
  return createHash("sha256")
    .update(`${getAuthSecret()}:${email}`)
    .digest("hex");
}

async function cleanup() {
  await db
    .delete(seekerSessions)
    .where(like(seekerSessions.conversationId, `${P}-%`));
  await db
    .delete(accessRequests)
    .where(
      inArray(accessRequests.emailHash, [
        emailHash(EMAIL),
        emailHash(OTHER_EMAIL),
        emailHash("sin-chats@test.local"),
      ]),
    );
  await db.delete(conversations).where(like(conversations.id, `${P}-%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

async function submit(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  await expect(requestAccessLinks(formData)).rejects.toThrow(/REDIRECT:/);
}

describe("enlace mágico /acceso", () => {
  beforeAll(async () => {
    await cleanup();
    const iso = new Date().toISOString();
    await db.insert(user).values({
      id: id.user,
      name: "Pro Acceso",
      email: `${id.user}@test.local`,
    });
    await db.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.pro}@test.local`,
      fullName: "Pro Acceso",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(helpRequests).values({
      id: id.help,
      email: EMAIL,
      needCategory: "duelo",
      urgency: "media",
      status: "assigned",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values([
      {
        id: id.conversation,
        helpRequestId: id.help,
        professionalId: id.pro,
        seekerSid: `${P}-sid`,
        status: "open",
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.direct,
        professionalId: id.pro,
        seekerSid: `${P}-sid-direct`,
        seekerEmail: EMAIL,
        status: "open",
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: `${P}-direct-otro`,
        professionalId: id.pro,
        seekerSid: `${P}-sid-otro`,
        seekerEmail: OTHER_EMAIL,
        status: "open",
        createdAt: iso,
        updatedAt: iso,
      },
    ]);
  });

  afterAll(cleanup);

  it("envía enlaces solo de las conversaciones de ese correo", async () => {
    mocks.notifySeekerAccessLinks.mockClear();
    await submit(EMAIL);

    expect(mocks.notifySeekerAccessLinks).toHaveBeenCalledTimes(1);
    const call = mocks.notifySeekerAccessLinks.mock.calls[0]?.[0] as {
      seekerEmail: string;
      links: Array<{ url: string; when: string }>;
    };
    expect(call.seekerEmail).toBe(EMAIL);
    // Solicitud + chat directo: dos enlaces, ninguno del otro correo.
    expect(call.links).toHaveLength(2);
    for (const link of call.links) {
      expect(link.url).toMatch(/\/acceso\//);
      expect(link.when.length).toBeGreaterThan(0);
    }
    expect(mocks.redirect).toHaveBeenCalledWith("/acceso?enviado=1");
  });

  it("responde neutro (sin filtrar) cuando el correo no tiene chats", async () => {
    mocks.notifySeekerAccessLinks.mockClear();
    await submit("sin-chats@test.local");
    expect(mocks.notifySeekerAccessLinks).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/acceso?enviado=1");
  });

  it("rechaza correos con formato inválido sin enviar nada", async () => {
    mocks.notifySeekerAccessLinks.mockClear();
    await submit("no-es-un-correo");
    expect(mocks.notifySeekerAccessLinks).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/acceso?error=correo");
  });

  it("limita a 3 solicitudes por correo y hora", async () => {
    mocks.notifySeekerAccessLinks.mockClear();
    // Ya se envió 1 vez en el primer test: dos más llegan al límite.
    await submit(EMAIL);
    await submit(EMAIL);
    expect(mocks.notifySeekerAccessLinks).toHaveBeenCalledTimes(2);

    // La cuarta ya no envía más, pero la respuesta sigue siendo neutra.
    mocks.notifySeekerAccessLinks.mockClear();
    await submit(EMAIL);
    expect(mocks.notifySeekerAccessLinks).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/acceso?enviado=1");

    const rows = await db
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(eq(accessRequests.emailHash, emailHash(EMAIL)));
    expect(rows.length).toBe(3);
  });
});
