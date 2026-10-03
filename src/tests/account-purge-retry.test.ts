import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  account,
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
  practiceNotes,
  practicePatients,
  professionals,
  seekerSessions,
  session,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  purge: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/chat-admin", () => ({
  purgeConversationMessagesDetailed: mocks.purge,
  disconnectConversationSockets: mocks.disconnect,
}));

import { purgeAccount } from "@/lib/account";

const P = "test-account-purge-retry";
const ids = {
  owner: `${P}-owner`,
  pro: `${P}-pro`,
  other: `${P}-other`,
  otherPro: `${P}-other-pro`,
  patientUser: `${P}-patient-user`,
  first: `${P}-chat-first`,
  second: `${P}-chat-second`,
  firstSid: `${P}-sid-first`,
  secondSid: `${P}-sid-second`,
  session: `${P}-session`,
  credential: `${P}-credential`,
  help: `${P}-help`,
  assignment: `${P}-assignment`,
  patient: `${P}-patient`,
  note: `${P}-note`,
  request: `${P}-request`,
};
const timestamp = new Date().toISOString();
const expires = new Date(Date.now() + 3_600_000);

async function cleanup() {
  await db
    .delete(patientSessionRequests)
    .where(like(patientSessionRequests.id, `${P}%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db.delete(practiceNotes).where(like(practiceNotes.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(seekerSessions).where(like(seekerSessions.sid, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(assignments).where(like(assignments.id, `${P}%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(account).where(like(account.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
}

async function seed() {
  await db.insert(user).values([
    {
      id: ids.owner,
      name: "Profesional ficticio",
      email: `${ids.owner}@example.test`,
    },
    {
      id: ids.other,
      name: "Otra cuenta ficticia",
      email: `${ids.other}@example.test`,
    },
    {
      id: ids.patientUser,
      name: "Paciente ficticio",
      email: `${ids.patientUser}@example.test`,
    },
  ]);
  await db.insert(session).values({
    id: ids.session,
    token: `${ids.session}-token`,
    expiresAt: expires,
    userId: ids.owner,
  });
  await db.insert(account).values({
    id: ids.credential,
    accountId: ids.owner,
    providerId: "credential",
    userId: ids.owner,
  });
  await db.insert(patientAccounts).values([
    {
      userId: ids.owner,
      displayName: "Cuenta ficticia",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      userId: ids.patientUser,
      displayName: "Paciente ficticio",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await db.insert(professionals).values([
    {
      id: ids.pro,
      userId: ids.owner,
      email: `${ids.pro}@example.test`,
      fullName: "Profesional ficticio",
      status: "approved",
      currentActiveRequests: 1,
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: ids.otherPro,
      userId: ids.other,
      email: `${ids.otherPro}@example.test`,
      fullName: "Otro profesional ficticio",
      status: "approved",
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await db.insert(helpRequests).values({
    id: ids.help,
    email: `${ids.patientUser}@example.test`,
    needCategory: "duelo",
    urgency: "media",
    status: "assigned",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(assignments).values({
    id: ids.assignment,
    helpRequestId: ids.help,
    professionalId: ids.pro,
    status: "assigned",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(conversations).values([
    {
      id: ids.first,
      helpRequestId: ids.help,
      professionalId: ids.pro,
      seekerSid: ids.firstSid,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: ids.second,
      professionalId: ids.pro,
      seekerSid: ids.secondSid,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await db.insert(seekerSessions).values([
    {
      sid: ids.firstSid,
      conversationId: ids.first,
      issuedAt: new Date(),
      expiresAt: expires,
    },
    {
      sid: ids.secondSid,
      conversationId: ids.second,
      issuedAt: new Date(),
      expiresAt: expires,
    },
  ]);
  await db.insert(patientConversationLinks).values({
    userId: ids.patientUser,
    conversationId: ids.first,
    verifiedBy: "session",
    verifiedAt: timestamp,
  });
  await db.insert(patientSessionRequests).values({
    id: ids.request,
    userId: ids.patientUser,
    conversationId: ids.first,
    kind: "new",
    timezone: "America/Caracas",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(practicePatients).values({
    id: ids.patient,
    professionalId: ids.pro,
    conversationId: ids.first,
    name: "Paciente ficticio",
    country: "VE",
    consentAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(practiceNotes).values({
    id: ids.note,
    professionalId: ids.pro,
    patientId: ids.patient,
    ciphertext: "envelope-ficticio-no-contenido-clinico",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

describe("baja recuperable cuando falla la purga de mensajes", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
    mocks.purge.mockReset();
    mocks.disconnect.mockClear();
  });
  afterAll(cleanup);

  it("conserva todos los punteros y la sesión tras una purga mixta; el reintento idempotente completa la baja", async () => {
    const contents = new Set([ids.first, ids.second]);
    let providerRecovered = false;
    mocks.purge.mockImplementation(async (conversationId: string) => {
      if (conversationId === ids.second && !providerRecovered) return "failed";
      contents.delete(conversationId);
      return "purged";
    });

    await expect(purgeAccount(ids.owner)).rejects.toThrow(
      "borrado de los chats",
    );
    expect(contents).toEqual(new Set([ids.second]));
    expect(mocks.purge.mock.calls.map(([id]) => id).sort()).toEqual(
      [ids.first, ids.second].sort(),
    );
    expect(
      await db.query.user.findFirst({ where: eq(user.id, ids.owner) }),
    ).toBeDefined();
    expect(
      await db.query.session.findFirst({ where: eq(session.id, ids.session) }),
    ).toBeDefined();
    expect(
      await db.query.account.findFirst({
        where: eq(account.id, ids.credential),
      }),
    ).toBeDefined();
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, ids.pro),
        columns: { status: true, currentActiveRequests: true },
      }),
    ).toEqual({ status: "deleting", currentActiveRequests: 0 });
    expect(
      await db.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, ids.owner),
        columns: { deletionState: true },
      }),
    ).toEqual({ deletionState: "active" });
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, ids.note),
      }),
    ).toBeDefined();
    expect(
      await db.query.patientConversationLinks.findFirst({
        where: eq(patientConversationLinks.conversationId, ids.first),
      }),
    ).toBeDefined();
    expect(
      await db.query.patientSessionRequests.findFirst({
        where: eq(patientSessionRequests.id, ids.request),
      }),
    ).toBeDefined();
    for (const id of [ids.first, ids.second]) {
      expect(
        await db.query.conversations.findFirst({
          where: eq(conversations.id, id),
          columns: { status: true },
        }),
      ).toEqual({ status: "closed" });
      expect(
        (
          await db.query.seekerSessions.findFirst({
            where: eq(seekerSessions.conversationId, id),
          })
        )?.revokedAt,
      ).toBeInstanceOf(Date);
    }
    expect(
      (
        await db.query.helpRequests.findFirst({
          where: eq(helpRequests.id, ids.help),
        })
      )?.status,
    ).toBe("new");
    expect(
      (
        await db.query.assignments.findFirst({
          where: eq(assignments.id, ids.assignment),
        })
      )?.status,
    ).toBe("closed");
    const failures = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, ids.second));
    expect(failures).toHaveLength(1);
    expect(failures[0].action).toBe("account_purge_conversation_failed");

    providerRecovered = true;
    await expect(purgeAccount(ids.owner)).resolves.toBeUndefined();
    expect(contents.size).toBe(0);
    expect(
      mocks.purge.mock.calls.filter(([id]) => id === ids.first),
    ).toHaveLength(2);
    expect(
      mocks.purge.mock.calls.filter(([id]) => id === ids.second),
    ).toHaveLength(2);
    expect(
      await db.query.user.findFirst({ where: eq(user.id, ids.owner) }),
    ).toBeUndefined();
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, ids.pro),
      }),
    ).toBeUndefined();
    expect(
      await db.query.conversations.findFirst({
        where: eq(conversations.id, ids.second),
      }),
    ).toBeUndefined();
    expect(
      await db.query.seekerSessions.findFirst({
        where: eq(seekerSessions.sid, ids.secondSid),
      }),
    ).toBeUndefined();
    expect(
      await db.query.practiceNotes.findFirst({
        where: eq(practiceNotes.id, ids.note),
      }),
    ).toBeUndefined();
    expect(
      await db.query.patientConversationLinks.findFirst({
        where: eq(patientConversationLinks.conversationId, ids.first),
      }),
    ).toBeUndefined();
    expect(
      await db.query.patientSessionRequests.findFirst({
        where: eq(patientSessionRequests.id, ids.request),
      }),
    ).toBeUndefined();
    expect(
      await db.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, ids.patientUser),
      }),
    ).toBeDefined();
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, ids.otherPro),
        })
      )?.status,
    ).toBe("approved");
    expect(
      await db.query.user.findFirst({ where: eq(user.id, ids.other) }),
    ).toBeDefined();
  });

  it("una excepción del transporte conserva referencias y solo libera la reclamación propia del paciente", async () => {
    mocks.purge.mockRejectedValue(new Error("Proveedor ficticio sin conexión"));
    await expect(purgeAccount(ids.owner)).rejects.toThrow("sin conexión");
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, ids.pro),
        })
      )?.status,
    ).toBe("deleting");
    expect(
      (
        await db.query.patientAccounts.findFirst({
          where: eq(patientAccounts.userId, ids.owner),
        })
      )?.deletionState,
    ).toBe("active");
    expect(
      await db.query.conversations.findFirst({
        where: eq(conversations.id, ids.first),
      }),
    ).toBeDefined();
    expect(
      await db.query.session.findFirst({ where: eq(session.id, ids.session) }),
    ).toBeDefined();
  });

  it("un segundo intento no reactiva la cuenta de paciente reclamada por otra eliminación", async () => {
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, ids.owner));
    await expect(purgeAccount(ids.owner)).rejects.toThrow("está en proceso");
    expect(
      (
        await db.query.patientAccounts.findFirst({
          where: eq(patientAccounts.userId, ids.owner),
        })
      )?.deletionState,
    ).toBe("deleting");
    expect(mocks.purge).not.toHaveBeenCalled();
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, ids.pro),
        })
      )?.status,
    ).toBe("approved");
  });
});
