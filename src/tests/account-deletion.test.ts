import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  account,
  assignments,
  conversations,
  helpRequests,
  professionals,
  responseSamples,
  seekerSessions,
  session,
  user,
} from "@/db/schema";
import { purgeAccount } from "@/lib/account";

const now = new Date();
const iso = now.toISOString();
const later = new Date(now.getTime() + 3_600_000);

const P = "test-purge";
const id = {
  vUser: `${P}-victim-user`,
  vPro: `${P}-victim-pro`,
  vSession: `${P}-victim-session`,
  vAccount: `${P}-victim-account`,
  vAssignment: `${P}-victim-assignment`,
  vConversation: `${P}-victim-conv`,
  vSid: `${P}-victim-sid`,
  vSample: `${P}-victim-sample`,
  help: `${P}-help`,
  bUser: `${P}-bystander-user`,
  bPro: `${P}-bystander-pro`,
  soloUser: `${P}-solo-user`,
  soloSession: `${P}-solo-session`,
};

// Idempotente: deja la base como estaba, aun si un run anterior falló a medias.
async function cleanup() {
  await db.delete(responseSamples).where(eq(responseSamples.id, id.vSample));
  await db.delete(seekerSessions).where(eq(seekerSessions.sid, id.vSid));
  await db.delete(conversations).where(eq(conversations.id, id.vConversation));
  await db.delete(assignments).where(eq(assignments.id, id.vAssignment));
  await db.delete(helpRequests).where(eq(helpRequests.id, id.help));
  await db.delete(professionals).where(eq(professionals.id, id.vPro));
  await db.delete(professionals).where(eq(professionals.id, id.bPro));
  await db.delete(session).where(eq(session.id, id.vSession));
  await db.delete(session).where(eq(session.id, id.soloSession));
  await db.delete(account).where(eq(account.id, id.vAccount));
  await db.delete(user).where(eq(user.id, id.vUser));
  await db.delete(user).where(eq(user.id, id.bUser));
  await db.delete(user).where(eq(user.id, id.soloUser));
}

describe("purgeAccount", () => {
  beforeAll(async () => {
    await cleanup();

    await db.insert(user).values([
      { id: id.vUser, name: "Víctima", email: `${id.vUser}@test.local` },
      { id: id.bUser, name: "Ajeno", email: `${id.bUser}@test.local` },
    ]);
    await db.insert(session).values({
      id: id.vSession,
      token: `${id.vSession}-token`,
      expiresAt: later,
      userId: id.vUser,
    });
    await db.insert(account).values({
      id: id.vAccount,
      accountId: id.vUser,
      providerId: "credential",
      userId: id.vUser,
    });
    await db.insert(professionals).values([
      {
        id: id.vPro,
        userId: id.vUser,
        email: `${id.vPro}@test.local`,
        fullName: "Víctima Pro",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.bPro,
        userId: id.bUser,
        email: `${id.bPro}@test.local`,
        fullName: "Ajeno Pro",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        createdAt: iso,
        updatedAt: iso,
      },
    ]);
    await db.insert(helpRequests).values({
      id: id.help,
      email: "seeker@test.local",
      needCategory: "duelo",
      urgency: "alta",
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(assignments).values({
      id: id.vAssignment,
      helpRequestId: id.help,
      professionalId: id.vPro,
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values({
      id: id.vConversation,
      helpRequestId: id.help,
      professionalId: id.vPro,
      seekerSid: id.vSid,
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(seekerSessions).values({
      sid: id.vSid,
      conversationId: id.vConversation,
      issuedAt: now,
      expiresAt: later,
    });
    await db.insert(responseSamples).values({
      id: id.vSample,
      professionalId: id.vPro,
      conversationId: id.vConversation,
      sampledAt: now,
    });
  });

  afterAll(cleanup);

  it("borra al usuario y TODO su rastro, sin tocar datos ajenos", async () => {
    await purgeAccount(id.vUser);

    // Todo lo de la cuenta borrada desaparece.
    expect(
      await db.query.user.findFirst({ where: eq(user.id, id.vUser) }),
    ).toBeUndefined();
    expect(
      await db.query.session.findFirst({ where: eq(session.id, id.vSession) }),
    ).toBeUndefined();
    expect(
      await db.query.account.findFirst({ where: eq(account.id, id.vAccount) }),
    ).toBeUndefined();
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, id.vPro),
      }),
    ).toBeUndefined();
    expect(
      await db.query.assignments.findFirst({
        where: eq(assignments.id, id.vAssignment),
      }),
    ).toBeUndefined();
    expect(
      await db.query.conversations.findFirst({
        where: eq(conversations.id, id.vConversation),
      }),
    ).toBeUndefined();
    expect(
      await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, id.vSid),
      }),
    ).toBeUndefined();
    expect(
      await db.query.responseSamples.findFirst({
        where: eq(responseSamples.id, id.vSample),
      }),
    ).toBeUndefined();

    // Datos ajenos intactos: otro profesional y la solicitud de ayuda.
    expect(
      await db.query.user.findFirst({ where: eq(user.id, id.bUser) }),
    ).toBeDefined();
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, id.bPro),
      }),
    ).toBeDefined();
    expect(
      await db.query.helpRequests.findFirst({
        where: eq(helpRequests.id, id.help),
      }),
    ).toBeDefined();
  });

  it("funciona con onboarding incompleto (usuario sin perfil profesional)", async () => {
    await db.insert(user).values({
      id: id.soloUser,
      name: "Solo",
      email: `${id.soloUser}@test.local`,
    });
    await db.insert(session).values({
      id: id.soloSession,
      token: `${id.soloSession}-token`,
      expiresAt: later,
      userId: id.soloUser,
    });

    await expect(purgeAccount(id.soloUser)).resolves.toBeUndefined();

    expect(
      await db.query.user.findFirst({ where: eq(user.id, id.soloUser) }),
    ).toBeUndefined();
    expect(
      await db.query.session.findFirst({
        where: eq(session.id, id.soloSession),
      }),
    ).toBeUndefined();
  });
});
