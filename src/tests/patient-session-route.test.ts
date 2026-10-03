import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import {
  conversations,
  practicePatients,
  professionals,
  seekerSessions,
  user,
} from "@/db/schema";

const P = "test-patient-route";
const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  session: vi.fn(
    async (): Promise<{ user: { id: string; email: string } } | null> => ({
      user: {
        id: "test-patient-route-user",
        email: "test-patient-route@example.test",
      },
    }),
  ),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));

import { GET } from "@/app/mi/mensajes/[conversationId]/route";
import { getAuthSecret } from "@/lib/auth-secret";
import { linkPatientConversation } from "@/lib/patient/access";
import { completePatientOnboarding } from "@/lib/patient/accounts";
import { patientActor } from "@/lib/practice/calls";
import { mintSeekerToken, verifySeekerToken } from "@/lib/seeker-token";

async function cleanup() {
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db
    .delete(seekerSessions)
    .where(like(seekerSessions.conversationId, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
describe("entrada autenticada al chat", () => {
  beforeAll(async () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-patient-route-secret-long-enough-for-auth",
    );
    await cleanup();
    const now = new Date().toISOString();
    await db.insert(user).values([
      {
        id: `${P}-user`,
        name: "Paciente ficticio",
        email: `${P}@example.test`,
        emailVerified: true,
      },
      {
        id: `${P}-prouser`,
        name: "Profesional ficticio",
        email: `${P}-pro@example.test`,
      },
    ]);
    await db.insert(professionals).values({
      id: `${P}-pro`,
      userId: `${P}-prouser`,
      email: `${P}-pro@example.test`,
      fullName: "Profesional ficticio",
      languages: '["es"]',
      supportAreas: '["ansiedad_depresion"]',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(conversations).values({
      id: `${P}-chat`,
      professionalId: `${P}-pro`,
      seekerSid: `${P}-original`,
      seekerEmail: `${P}@example.test`,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(practicePatients).values({
      id: `${P}-record`,
      professionalId: `${P}-pro`,
      conversationId: `${P}-chat`,
      name: "Ficha ficticia",
      country: "Venezuela",
      timeZone: "UTC",
      consentAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await completePatientOnboarding(`${P}-user`, {
      displayName: "Alias ficticio",
      country: "VE",
      timezone: "UTC",
      ageBand: "adult",
    });
    await linkPatientConversation(`${P}-user`, `${P}-chat`);
  });
  afterAll(async () => {
    await cleanup();
    vi.unstubAllEnvs();
  });
  it("emite cookie httpOnly no-store con sesión registrada y preserva accesos anteriores", async () => {
    const response = await GET(
      new Request("http://localhost:3000/mi/mensajes/test-patient-route-chat"),
      { params: Promise.resolve({ conversationId: `${P}-chat` }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      `/c/${P}-chat?como=persona`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const raw = response.headers.get("set-cookie") || "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=lax");
    const token = verifySeekerToken(
      decodeURIComponent(raw.match(/^nido_seeker=([^;]+)/)?.[1] || ""),
      getAuthSecret(),
      Date.now(),
    );
    expect(token?.conversationId).toBe(`${P}-chat`);
    const registry = await db.query.seekerSessions.findFirst({
      where: eq(seekerSessions.sid, token?.sid || "missing"),
    });
    expect(registry?.role).toBe("seeker");
    expect(registry?.conversationId).toBe(`${P}-chat`);
    expect(registry?.revokedAt).toBeNull();
    expect(
      (
        await db.query.conversations.findFirst({
          where: eq(conversations.id, `${P}-chat`),
        })
      )?.seekerSid,
    ).toBe(`${P}-original`);
  });
  it("una cuenta vinculada conserva acceso financiero si el profesional se suspende y el chat se cierra", async () => {
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, `${P}-pro`));
    await db
      .update(conversations)
      .set({ status: "closed" })
      .where(eq(conversations.id, `${P}-chat`));
    expect(
      (await patientActor(`${P}-record`, { financialAccess: true }))?.role,
    ).toBe("seeker");
    expect(await patientActor(`${P}-record`)).toBeNull();
    mocks.session.mockResolvedValue({
      user: { id: `${P}-unverified`, email: `${P}@example.test` },
    });
    expect(
      await patientActor(`${P}-record`, { financialAccess: true }),
    ).toBeNull();
    mocks.session.mockResolvedValue({
      user: { id: `${P}-user`, email: `${P}@example.test` },
    });
    await db
      .update(professionals)
      .set({ status: "approved" })
      .where(eq(professionals.id, `${P}-pro`));
    await db
      .update(conversations)
      .set({ status: "open" })
      .where(eq(conversations.id, `${P}-chat`));
  });
  it("una cookie firmada con registro vencido no abre llamadas ni acuerdos", async () => {
    const sid = `${P}-expired`,
      ms = Date.now();
    await db.insert(seekerSessions).values({
      sid,
      conversationId: `${P}-chat`,
      issuedAt: new Date(ms - 3600000),
      expiresAt: new Date(ms - 1),
    });
    const raw = mintSeekerToken(
      {
        sid,
        conversationId: `${P}-chat`,
        role: "seeker",
        iat: ms,
        exp: ms + 3600000,
      },
      getAuthSecret(),
    );
    mocks.session.mockResolvedValue(null);
    mocks.cookie.mockReturnValue({ value: raw });
    expect(
      await patientActor(`${P}-record`, { financialAccess: true }),
    ).toBeNull();
    expect(await patientActor(`${P}-record`)).toBeNull();
    mocks.session.mockResolvedValue({
      user: { id: `${P}-user`, email: `${P}@example.test` },
    });
    mocks.cookie.mockReturnValue(undefined);
  });
  it("rechaza salas ajenas y no emite cookies", async () => {
    const response = await GET(
      new Request("http://localhost:3000/mi/mensajes/unknown"),
      { params: Promise.resolve({ conversationId: "unknown" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("rechaza emisión durante una baja y salas borradas", async () => {
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, `${P}-user`));
    const response = await GET(
      new Request(`http://localhost:3000/mi/mensajes/${P}-chat`),
      { params: Promise.resolve({ conversationId: `${P}-chat` }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.has("set-cookie")).toBe(false);
    await db
      .update(patientAccounts)
      .set({ deletionState: "active" })
      .where(eq(patientAccounts.userId, `${P}-user`));
    await db
      .update(conversations)
      .set({ deletedAt: new Date() })
      .where(eq(conversations.id, `${P}-chat`));
    const deleted = await GET(
      new Request(`http://localhost:3000/mi/mensajes/${P}-chat`),
      { params: Promise.resolve({ conversationId: `${P}-chat` }) },
    );
    expect(deleted.status).toBe(404);
  });
});
