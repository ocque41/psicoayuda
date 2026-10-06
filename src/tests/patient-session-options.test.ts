import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { patientSessionOptions } from "@/app/mi/nueva-sesion/options";
import { db } from "@/db";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";
import { completePatientOnboarding } from "@/lib/patient/accounts";
import { patientChats } from "@/lib/patient/queries";
import { createPatientSessionRequest } from "@/lib/patient/requests";

const prefix = "test-session-options";
const owner = `${prefix}-owner`;
const other = `${prefix}-other`;
const stamp = "2026-10-01T12:00:00.000Z";
const chatId = (key: string) => `${prefix}-${key}`;
async function cleanup() {
  for (const [table, column] of [
    [patientSessionRequests, patientSessionRequests.userId],
    [patientConversationLinks, patientConversationLinks.userId],
    [practicePatients, practicePatients.id],
    [conversations, conversations.id],
    [professionals, professionals.id],
    [patientAccounts, patientAccounts.userId],
    [user, user.id],
  ] as const)
    await db.delete(table).where(like(column, `${prefix}%`));
}

describe("selección de nuevas sesiones del paciente", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values(
      ["owner", "other", "approved", "suspended"].map((key) => ({
        id: `${prefix}-${key}`,
        name: "Cuenta ficticia",
        email: `${prefix}-${key}@example.test`,
      })),
    );
    for (const id of [owner, other])
      await completePatientOnboarding(id, {
        displayName: "Paciente ficticio",
        country: "VE",
        timezone: "America/Caracas",
        ageBand: "adult",
      });
    await db.insert(professionals).values(
      ["approved", "suspended"].map((status) => ({
        id: `${prefix}-pro-${status}`,
        userId: `${prefix}-${status}`,
        fullName: "Profesional ficticio",
        email: `${prefix}-${status}@example.test`,
        status,
        languages: '["es"]',
        supportAreas: '["orientacion_general"]',
        createdAt: stamp,
        updatedAt: stamp,
      })),
    );
    const rows = [
      ...Array.from({ length: 22 }, (_, index) => ({
        key: `closed-${index}`,
        status: "closed",
        createdAt: "2026-09-01T00:00:00.000Z",
      })),
      ...Array.from({ length: 21 }, (_, index) => ({
        key: `open-${String(index).padStart(2, "0")}`,
        status: "open",
        createdAt: "2026-08-01T00:00:00.000Z",
      })),
      { key: "suspended", status: "open", createdAt: stamp },
      { key: "deleted", status: "open", createdAt: stamp },
      { key: "anonymized", status: "open", createdAt: stamp },
      { key: "other", status: "open", createdAt: stamp },
    ];
    await db.insert(conversations).values(
      rows.map((row) => ({
        id: chatId(row.key),
        professionalId: `${prefix}-pro-${row.key === "suspended" ? "suspended" : "approved"}`,
        seekerSid: `${chatId(row.key)}-sid`,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: stamp,
        deletedAt: row.key === "deleted" ? new Date(stamp) : null,
        anonymizedAt: row.key === "anonymized" ? stamp : null,
      })),
    );
    await db.insert(practicePatients).values({
      id: `${prefix}-earthquake-patient`,
      professionalId: `${prefix}-pro-approved`,
      conversationId: chatId("open-20"),
      name: "Ficha ficticia",
      country: "Venezuela",
      timeZone: "America/Caracas",
      program: "earthquake",
      consentAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await db.insert(patientConversationLinks).values(
      rows.map((row) => ({
        userId: row.key === "other" ? other : owner,
        conversationId: chatId(row.key),
        verifiedBy: "email",
        verifiedAt: stamp,
      })),
    );
  });
  afterAll(cleanup);

  it("filtra antes de paginar aunque los 22 chats cerrados sean más recientes", async () => {
    // Reproduce la selección anterior: la página inicial sólo ofrecía el
    // profesional suspendido y dejaba las 21 opciones válidas más adelante.
    const previous = await patientChats(owner);
    expect(previous.rows.filter((row) => row.status === "open")).toEqual([
      expect.objectContaining({ id: chatId("suspended") }),
    ]);
    const first = await patientSessionOptions(owner);
    const second = await patientSessionOptions(owner, "2");
    expect(first).toMatchObject({ total: 21, pages: 2, page: 1 });
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(1);
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.id)).size,
    ).toBe(21);
    expect(
      [...first.rows, ...second.rows].every((row) => row.id.includes("open-")),
    ).toBe(true);
  });

  it("conserva la identificación del programa gratuito en las opciones", async () => {
    const options = await patientSessionOptions(owner);
    expect(
      options.rows.find((row) => row.id === chatId("open-20"))?.program,
    ).toBe("earthquake");
  });

  it("no entrega opciones ajenas, borradas ni anonimizadas", async () => {
    const rows = await patientSessionOptions(other);
    expect(rows.total).toBe(1);
    expect(rows.rows.map((row) => row.id)).toEqual([chatId("other")]);
    expect((await patientSessionOptions(`${prefix}-missing`)).rows).toEqual([]);
  });

  it("conserva los chats cerrados y suspendidos en el historial de mensajes", async () => {
    const history = await patientChats(owner);
    expect(history.total).toBe(44);
    expect(history.rows.some((row) => row.id === chatId("suspended"))).toBe(
      true,
    );
    expect(history.rows.some((row) => row.status === "closed")).toBe(true);
  });

  it("limita páginas inválidas sin perder las opciones válidas", async () => {
    expect((await patientSessionOptions(owner, "-8")).page).toBe(1);
    expect((await patientSessionOptions(owner, "999")).page).toBe(2);
    expect((await patientSessionOptions(owner, "invalida")).page).toBe(1);
  });

  it("conserva la autorización del escritor ante una selección manipulada", async () => {
    const proposal = {
      kind: "new" as const,
      preferredLocal: new Date(Date.now() + 7 * 86400000)
        .toISOString()
        .slice(0, 16),
      timezone: "UTC",
    };
    await expect(
      createPatientSessionRequest(owner, {
        ...proposal,
        conversationId: chatId("suspended"),
      }),
    ).rejects.toThrow("no admite nuevas solicitudes");
    await expect(
      createPatientSessionRequest(owner, {
        ...proposal,
        conversationId: chatId("other"),
      }),
    ).rejects.toThrow("No tienes acceso");
    expect(
      await db.query.patientSessionRequests.findMany({
        where: eq(patientSessionRequests.userId, owner),
      }),
    ).toHaveLength(0);
  });

  it("una cuenta en baja no recibe opciones nuevas", async () => {
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, other));
    const result = await patientSessionOptions(other);
    expect(result).toMatchObject({ rows: [], total: 0, page: 1, pages: 1 });
  });
});
