import { eq, like } from "drizzle-orm";
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
  auditLogs,
  conversations,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.getSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("fixture-access-denied");
  },
}));

import {
  linkPatientConversation,
  releaseConversationQuota,
} from "@/app/pro/consulta/actions";

const prefix = "test-chat-practice-link";
const id = {
  user: `${prefix}-user`,
  pro: `${prefix}-pro`,
  foreignUser: `${prefix}-foreign-user`,
  foreign: `${prefix}-foreign`,
  patient: `${prefix}-patient`,
  chat: `${prefix}-chat`,
  otherChat: `${prefix}-other-chat`,
};
async function cleanup() {
  await db
    .delete(practicePatients)
    .where(like(practicePatients.id, `${prefix}-%`));
  await db.delete(conversations).where(like(conversations.id, `${prefix}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${prefix}-%`));
}
function form(chat = id.chat) {
  const data = new FormData();
  data.set("conversationId", chat);
  data.set("patientId", id.patient);
  data.set("confirmed", "on");
  return data;
}
async function patient() {
  return db.query.practicePatients.findFirst({
    where: eq(practicePatients.id, id.patient),
  });
}
async function logs() {
  return db
    .select()
    .from(auditLogs)
    .where(like(auditLogs.entityId, `${prefix}-%`));
}
async function quota() {
  return (
    await db.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    })
  )?.currentActiveRequests;
}
describe("chat: liberar cupo y vincular ficha con permisos actuales", () => {
  beforeAll(async () => {
    const iso = new Date().toISOString();
    await db.insert(user).values([
      { id: id.user, name: "Cuenta ficticia", email: `${prefix}@example.test` },
      {
        id: id.foreignUser,
        name: "Cuenta ajena",
        email: `${prefix}-foreign@example.test`,
      },
    ]);
    await db.insert(professionals).values(
      [
        { id: id.pro, userId: id.user },
        { id: id.foreign, userId: id.foreignUser },
      ].map((actor) => ({
        ...actor,
        email: `${actor.id}@example.test`,
        fullName: "Profesional ficticio",
        status: "approved",
        languages: "[]",
        supportAreas: "[]",
        createdAt: iso,
        updatedAt: iso,
      })),
    );
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: id.user, email: `${prefix}@example.test` },
    });
    mocks.revalidate.mockClear();
    await cleanup();
    const iso = new Date().toISOString();
    await db
      .update(professionals)
      .set({ status: "approved", currentActiveRequests: 1 })
      .where(eq(professionals.id, id.pro));
    await db.insert(practicePatients).values({
      id: id.patient,
      professionalId: id.pro,
      name: "Ficha ficticia",
      country: "Venezuela",
      timeZone: "America/Caracas",
      program: "general",
      status: "active",
      consentAt: iso,
      createdAt: iso,
      updatedAt: iso,
    });
    await db.insert(conversations).values(
      [
        { id: id.chat, professionalId: id.pro, seekerSid: `${prefix}-sid` },
        {
          id: id.otherChat,
          professionalId: id.foreign,
          seekerSid: `${prefix}-other-sid`,
        },
      ].map((row) => ({
        ...row,
        status: "open",
        createdAt: iso,
        updatedAt: iso,
      })),
    );
  });
  afterAll(async () => {
    await cleanup();
    await db.delete(professionals).where(like(professionals.id, `${prefix}-%`));
    await db.delete(user).where(like(user.id, `${prefix}-%`));
  });
  it("liberación propia se confirma una vez, reintento no repite contador/audit", async () => {
    expect((await releaseConversationQuota(null, form()))?.ok).toBe(true);
    expect(await quota()).toBe(0);
    expect(await logs()).toHaveLength(1);
    expect((await releaseConversationQuota(null, form()))?.ok).toBe(true);
    expect(await quota()).toBe(0);
    expect(await logs()).toHaveLength(1);
  });
  it.each([
    id.otherChat,
    "fixture-missing-chat",
  ])("no confirma ni audita un cupo ajeno/desconocido", async (chat) => {
    expect((await releaseConversationQuota(null, form(chat)))?.ok).toBe(false);
    expect(await quota()).toBe(1);
    expect(await logs()).toHaveLength(0);
  });
  it("pérdida del actor antes del batch impide liberar y auditar", async () => {
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(professionals)
        .set({ status: "deleting" })
        .where(eq(professionals.id, id.pro));
      return original(queries);
    });
    expect((await releaseConversationQuota(null, form()))?.ok).toBe(false);
    expect(await quota()).toBe(1);
    expect(await logs()).toHaveLength(0);
  });
  it("vinculación propia guarda relación con audit; chat ajeno no puede usarse", async () => {
    expect((await linkPatientConversation(null, form(id.otherChat)))?.ok).toBe(
      false,
    );
    expect((await patient())?.conversationId).toBeNull();
    expect(await logs()).toHaveLength(0);
    expect((await linkPatientConversation(null, form()))?.ok).toBe(true);
    expect((await patient())?.conversationId).toBe(id.chat);
    expect(await logs()).toHaveLength(1);
  });
  it.each([
    "closed-chat",
    "closed-patient",
    "changed-patient",
    "deleting-pro",
  ])("carrera %s evita vínculo y auditoría", async (change) => {
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      if (change === "closed-chat")
        await db
          .update(conversations)
          .set({ status: "closed" })
          .where(eq(conversations.id, id.chat));
      if (change === "closed-patient")
        await db
          .update(practicePatients)
          .set({ status: "closed" })
          .where(eq(practicePatients.id, id.patient));
      if (change === "changed-patient")
        await db
          .update(practicePatients)
          .set({ updatedAt: new Date(Date.now() + 1000).toISOString() })
          .where(eq(practicePatients.id, id.patient));
      if (change === "deleting-pro")
        await db
          .update(professionals)
          .set({ status: "deleting" })
          .where(eq(professionals.id, id.pro));
      return original(queries);
    });
    expect((await linkPatientConversation(null, form()))?.ok).toBe(false);
    expect((await patient())?.conversationId).toBeNull();
    expect(await logs()).toHaveLength(0);
  });
});
