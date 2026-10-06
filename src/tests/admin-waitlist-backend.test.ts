import { createClient } from "@libsql/client";
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
  assignments,
  auditLogs,
  helpRequests,
  professionals,
  session,
  user,
  waitlistEntries,
} from "@/db/schema";
import { requireWaitlistAdmin } from "@/lib/admin-waitlist/access";
import { saveGeneralWaitlistStatus } from "@/lib/admin-waitlist/mutations";
import { readAdminWaitlistData } from "@/lib/admin-waitlist/queries";
import type { WaitlistAdmin } from "@/lib/admin-waitlist/types";

const mocks = vi.hoisted(() => ({ session: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));

import { updateGeneralWaitlistStatus } from "@/app/admin/lista-de-espera/actions";

const P = "test-admin-waitlist";
const timestamp = "2000-01-01T00:00:00.000Z";
const actor: WaitlistAdmin = {
  userId: `${P}-admin`,
  email: `${P}-admin@example.test`,
  sessionId: `${P}-sid-admin`,
};
const reviewer: WaitlistAdmin = {
  userId: `${P}-reviewer`,
  email: `${P}-reviewer@example.test`,
  sessionId: `${P}-sid-reviewer`,
};
let client: ReturnType<typeof createClient>;

async function cleanup() {
  vi.restoreAllMocks();
  await db.delete(assignments).where(like(assignments.id, `${P}%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${P}%`));
  await db.delete(waitlistEntries).where(like(waitlistEntries.id, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
beforeAll(() => {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:") || !url.includes("nido-tests-"))
    throw new Error("La lista requiere la base temporal de test:isolated.");
  client = createClient({ url });
});
beforeEach(async () => {
  await cleanup();
  vi.stubEnv("ADMIN_EMAILS", actor.email);
  vi.stubEnv("ADMISSION_REVIEWER_EMAILS", reviewer.email);
  for (const item of [actor, reviewer]) {
    await db.insert(user).values({
      id: item.userId,
      email: item.email,
      name: "Cuenta ficticia",
      emailVerified: true,
    });
    await db.insert(session).values({
      id: item.sessionId,
      userId: item.userId,
      token: `${item.sessionId}-token`,
      expiresAt: new Date(Date.now() + 86400000),
    });
  }
  for (const suffix of ["pro-a", "pro-b"]) {
    const id = `${P}-${suffix}`;
    await db.insert(user).values({
      id: `${id}-user`,
      email: `${id}@example.test`,
      name: "Profesional ficticio",
    });
    await db.insert(professionals).values({
      id,
      userId: `${id}-user`,
      email: `${id}@example.test`,
      fullName: "Profesional ficticio",
      languages: "[]",
      supportAreas: "[]",
      status: "approved",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  await general("first");
  mocks.session.mockResolvedValue({
    user: { id: actor.userId, email: actor.email },
    session: { id: actor.sessionId },
  });
  mocks.refresh.mockClear();
});
afterAll(async () => {
  await cleanup();
  client.close();
  vi.unstubAllEnvs();
});

async function general(
  suffix: string,
  extra: Partial<typeof waitlistEntries.$inferInsert> = {},
) {
  const row = {
    id: `${P}-${suffix}`,
    email: `${P}-${suffix}@example.test`,
    title: "Solicitud ficticia",
    description: "Contexto ficticio reservado para el detalle.",
    source: "lista-de-espera",
    status: "waiting",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
  await db.insert(waitlistEntries).values(row);
  return row;
}
async function help(
  suffix: string,
  status = "new",
  extra: Partial<typeof helpRequests.$inferInsert> = {},
) {
  const row = {
    id: `${P}-help-${suffix}`,
    email: `${P}-help-${suffix}@example.test`,
    seekerName: "Persona ficticia",
    status,
    needCategory: "orientacion_general",
    urgency: "media",
    country: "Venezuela",
    city: "Ciudad ficticia",
    consentContact: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...extra,
  };
  await db.insert(helpRequests).values(row);
  return row;
}
async function relation(requestId: string, status: string, suffix = "pro-a") {
  await db.insert(assignments).values({
    id: `${P}-relation-${requestId}-${suffix}`,
    helpRequestId: requestId,
    professionalId: `${P}-${suffix}`,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    entryId: `${P}-first`,
    expectedStatus: "waiting",
    expectedUpdatedAt: timestamp,
    status: "contacted",
    ...extra,
  }))
    data.set(key, value);
  return data;
}
async function logs() {
  return db
    .select()
    .from(auditLogs)
    .where(like(auditLogs.entityId, `${P}%`));
}
async function record() {
  return db.query.waitlistEntries.findFirst({
    where: eq(waitlistEntries.id, `${P}-first`),
  });
}

describe("lista de espera: fuentes reales y privacidad", () => {
  it("refleja las once columnas existentes sin necesitar una migración nueva", async () => {
    const columns = await client.execute("PRAGMA table_info(waitlist_entries)");
    expect(columns.rows.map((row) => row.name).sort()).toEqual(
      [
        "id",
        "email",
        "title",
        "description",
        "source",
        "status",
        "requester_hash",
        "anonymized_at",
        "created_at",
        "updated_at",
        "conversation_id",
      ].sort(),
    );
  });
  it("abre la lista general existente y reserva correo y relato al detalle", async () => {
    await help("also");
    const data = await readAdminWaitlistData(actor, { persona: `${P}-first` });
    expect(data).toMatchObject({
      failed: false,
      tab: "general",
      status: "all",
      total: 1,
      sourceCounts: { general: 1, terremoto: 1 },
    });
    expect(data.items[0]).not.toHaveProperty("email");
    expect(data.items[0]).not.toHaveProperty("description");
    expect(data.items[0]).not.toHaveProperty("title");
    expect(data.selected).toMatchObject({
      tab: "general",
      email: `${P}-first@example.test`,
      description: "Contexto ficticio reservado para el detalle.",
    });
  });
  it("conserva dos solicitudes con el mismo correo en fuentes separadas", async () => {
    await help("shared", "new", { email: `${P}-first@example.test` });
    const [generalData, helpData] = await Promise.all([
      readAdminWaitlistData(actor, {}),
      readAdminWaitlistData(actor, { fuente: "terremoto" }),
    ]);
    expect(generalData.sourceCounts).toEqual({ general: 1, terremoto: 1 });
    expect(generalData.items[0].id).not.toBe(helpData.items[0].id);
    expect(await record()).toMatchObject({
      status: "waiting",
      updatedAt: timestamp,
    });
  });
  it("excluye registros anonimizados también en detalles directos", async () => {
    await general("anon", { anonymizedAt: timestamp });
    const anonymizedHelp = await help("anon", "new", {
      anonymizedAt: timestamp,
    });
    const a = await readAdminWaitlistData(actor, { persona: `${P}-anon` });
    const b = await readAdminWaitlistData(actor, {
      fuente: "terremoto",
      persona: anonymizedHelp.id,
    });
    expect(a).toMatchObject({
      total: 1,
      selected: null,
      sourceCounts: { general: 1, terremoto: 0 },
    });
    expect(b).toMatchObject({ total: 0, selected: null });
  });
  it("no mezcla el identificador de un detalle con la otra fuente", async () => {
    const row = await help("only");
    expect(
      (await readAdminWaitlistData(actor, { persona: row.id })).selected,
    ).toBeNull();
    expect(
      (
        await readAdminWaitlistData(actor, {
          fuente: "terremoto",
          persona: `${P}-first`,
        })
      ).selected,
    ).toBeNull();
  });
  it("busca porcentajes, guiones bajos y barras literalmente con parámetros", async () => {
    await general("literal-100%_\\");
    for (const q of ["100%", "%_", "_\\", "' OR 1=1 --"]) {
      const result = await readAdminWaitlistData(actor, { q });
      expect(result.failed).toBe(false);
      expect(result.total).toBe(q.startsWith("'") ? 0 : 1);
    }
  });
  it("busca referencias y alias sin incluir correo ni texto privado en búsqueda", async () => {
    await general("private", {
      title: "Texto reservado único",
      email: "private-address@example.test",
    });
    const request = await help("alias", "new", {
      seekerName: "Alias_ficticio%",
    });
    expect(
      (await readAdminWaitlistData(actor, { q: "Texto reservado" })).total,
    ).toBe(0);
    expect(
      (
        await readAdminWaitlistData(actor, {
          fuente: "terremoto",
          q: "Alias_ficticio%",
        })
      ).items[0].id,
    ).toBe(request.id);
    const rejected = await readAdminWaitlistData(actor, {
      q: "private-address@example.test",
    });
    expect(rejected).toMatchObject({ q: "", failed: false });
    expect(rejected.queryWarning).toContain("descartado");
  });
  it("pagina25 filas con orden estable, normaliza arrays y limita página extrema", async () => {
    for (let i = 0; i < 29; i++)
      await general(`page-${String(i).padStart(2, "0")}`, {
        status: i % 2 ? "closed" : "waiting",
      });
    const first = await readAdminWaitlistData(actor, {
      fuente: ["general", "terremoto"],
      estado: ["all"],
      pagina: "1",
    });
    const second = await readAdminWaitlistData(actor, { pagina: "9999999" });
    expect(first).toMatchObject({
      total: 30,
      page: 1,
      pages: 2,
      failed: false,
    });
    expect(first.items).toHaveLength(25);
    expect(second).toMatchObject({ page: 2, total: 30 });
    expect(second.items).toHaveLength(5);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(30);
    expect(
      (await readAdminWaitlistData(actor, { pagina: "1e4", estado: "closed" }))
        .page,
    ).toBe(1);
    expect(first.counts).toMatchObject({ all: 30, waiting: 16, closed: 14 });
  });
  it("los contadores de fuente no dependen de filtros ni ocultan estados anteriores", async () => {
    await general("legacy", { status: "legacy" });
    const data = await readAdminWaitlistData(actor, {
      q: "inexistente",
      estado: "waiting",
    });
    expect(data).toMatchObject({
      total: 0,
      sourceCounts: { general: 2, terremoto: 0 },
    });
    const all = await readAdminWaitlistData(actor, {});
    expect(all.items.find((item) => item.id.endsWith("legacy"))).toMatchObject({
      requiresReview: true,
    });
  });
});

describe("Ayuda Terremoto: sólo lectura de pendientes y relaciones", () => {
  it.each([
    "new",
    "offered",
    "contacted",
  ])("incluye %s pendiente sin una relación activa", async (status) => {
    const row = await help(status, status);
    await relation(row.id, "offered");
    const data = await readAdminWaitlistData(actor, {
      fuente: "terremoto",
      persona: row.id,
    });
    expect(data).toMatchObject({ failed: false, total: 1, status: "waiting" });
    expect(data.items[0]).toMatchObject({
      activeAssignments: 0,
      offeredAssignments: 1,
    });
    expect(data.selected).toMatchObject({
      tab: "terremoto",
      consentContact: true,
      urgencyLabel: "Me vendría bien pronto",
      assignmentsHasMore: false,
    });
  });
  it.each([
    "accepted",
    "assigned",
  ])("una relación %s ocupa una plaza y sale de espera", async (status) => {
    const row = await help(status, "offered");
    await relation(row.id, status);
    const waiting = await readAdminWaitlistData(actor, { fuente: "terremoto" });
    const assigned = await readAdminWaitlistData(actor, {
      fuente: "terremoto",
      estado: "assigned",
    });
    expect(waiting).toMatchObject({
      total: 0,
      counts: { assigned: 1, waiting: 0 },
    });
    expect(assigned.items[0]).toMatchObject({
      activeAssignments: 1,
      requiresReview: true,
    });
  });
  it.each([
    "suggested",
    "offered",
    "missed",
    "closed",
  ])("una relación %s no ocupa plaza", async (status) => {
    const row = await help(status);
    await relation(row.id, status);
    expect(
      (await readAdminWaitlistData(actor, { fuente: "terremoto" })).total,
    ).toBe(1);
  });
  it("una solicitud assigned sin relación activa pide revisión sin reabrirla", async () => {
    const row = await help("released", "assigned");
    await relation(row.id, "closed");
    const data = await readAdminWaitlistData(actor, {
      fuente: "terremoto",
      estado: "review",
    });
    expect(data.items[0]).toMatchObject({ id: row.id, requiresReview: true });
    expect(
      (await readAdminWaitlistData(actor, { fuente: "terremoto" })).total,
    ).toBe(0);
    expect(
      await db.query.helpRequests.findFirst({
        where: eq(helpRequests.id, row.id),
      }),
    ).toMatchObject({ status: "assigned", updatedAt: timestamp });
  });
  it("separa cerradas y estados anteriores; la lectura no escribe auditorías", async () => {
    await help("closed", "closed");
    await help("legacy", "legacy");
    const waiting = await readAdminWaitlistData(actor, { fuente: "terremoto" });
    expect(waiting).toMatchObject({
      total: 0,
      counts: { all: 2, closed: 1, review: 1 },
    });
    expect(await logs()).toEqual([]);
  });
});

describe("administración verificada y sesiones reales", () => {
  it("admite al superadmin y rechaza al revisor limitado aunque esté verificado", async () => {
    expect(await requireWaitlistAdmin()).toEqual(actor);
    mocks.session.mockResolvedValue({
      user: { id: reviewer.userId, email: reviewer.email },
      session: { id: reviewer.sessionId },
    });
    expect(await requireWaitlistAdmin()).toBeNull();
    expect(
      await readAdminWaitlistData(reviewer, { persona: `${P}-first` }),
    ).toMatchObject({ failed: true, selected: null, items: [] });
    expect(await saveGeneralWaitlistStatus(reviewer, form())).toMatchObject({
      ok: false,
    });
    expect(await logs()).toEqual([]);
  });
  it.each([
    "missing",
    "expired",
    "revoked",
    "foreign",
    "unverified",
    "changedEmail",
    "removedRole",
  ])("rechaza permisos %s antes de leer o escribir", async (kind) => {
    let captured = actor;
    if (kind === "missing") captured = { ...actor, sessionId: "" };
    if (kind === "expired")
      await db
        .update(session)
        .set({ expiresAt: new Date(0) })
        .where(eq(session.id, actor.sessionId));
    if (kind === "revoked")
      await db.delete(session).where(eq(session.id, actor.sessionId));
    if (kind === "foreign")
      captured = { ...actor, sessionId: reviewer.sessionId };
    if (kind === "unverified")
      await db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, actor.userId));
    if (kind === "changedEmail")
      await db
        .update(user)
        .set({ email: `${P}-changed@example.test` })
        .where(eq(user.id, actor.userId));
    if (kind === "removedRole") vi.stubEnv("ADMIN_EMAILS", reviewer.email);
    const result = await readAdminWaitlistData(captured, {
      persona: `${P}-first`,
    });
    expect(result).toMatchObject({ failed: true, items: [], selected: null });
    expect(await saveGeneralWaitlistStatus(captured, form())).toMatchObject({
      ok: false,
    });
    expect(await record()).toMatchObject({ status: "waiting" });
    expect(await logs()).toEqual([]);
  });
  it("descarta la respuesta completa si se revoca la sesión entre lecturas", async () => {
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementation(async (queries) => {
      const result = await original(queries);
      await db.delete(session).where(eq(session.id, actor.sessionId));
      return result;
    });
    expect(
      await readAdminWaitlistData(actor, { persona: `${P}-first` }),
    ).toMatchObject({ failed: true, items: [], selected: null });
  });
});

describe("cambios generales CAS y auditoría atómica", () => {
  it("una escritura modifica sólo el estado y conserva texto, relaciones y ayuda", async () => {
    const helpRow = await help("unchanged");
    const before = await record();
    const result = await saveGeneralWaitlistStatus(actor, form());
    expect(result).toMatchObject({ ok: true, status: "contacted" });
    expect(Date.parse(result.updatedAt || "")).toBeGreaterThan(
      Date.parse(timestamp),
    );
    const after = await record();
    expect(after).toEqual({
      ...before,
      status: "contacted",
      updatedAt: result.updatedAt,
    });
    expect(
      await db.query.helpRequests.findFirst({
        where: eq(helpRequests.id, helpRow.id),
      }),
    ).toMatchObject({ status: "new", updatedAt: timestamp });
    expect(await logs()).toMatchObject([
      { action: "waitlist_status_updated", metadata: '{"status":"contacted"}' },
    ]);
    expect(JSON.stringify(await logs())).not.toContain(before?.description);
    expect(JSON.stringify(await logs())).not.toContain(before?.email);
  });
  it("dos formularios sobre la misma versión tienen exactamente un ganador", async () => {
    const results = await Promise.all([
      saveGeneralWaitlistStatus(actor, form()),
      saveGeneralWaitlistStatus(actor, form({ status: "matched" })),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.code === "conflict")).toHaveLength(
      1,
    );
    expect(await logs()).toHaveLength(1);
  });
  it("la versión enviada decide y no se sustituye por la última leída", async () => {
    await db
      .update(waitlistEntries)
      .set({ updatedAt: "2000-01-02T00:00:00.000Z" })
      .where(eq(waitlistEntries.id, `${P}-first`));
    expect(await saveGeneralWaitlistStatus(actor, form())).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(await record()).toMatchObject({ status: "waiting" });
    expect(await logs()).toEqual([]);
  });
  it("repetir el mismo estado vigente no crea una auditoría falsa", async () => {
    expect(
      await saveGeneralWaitlistStatus(actor, form({ status: "waiting" })),
    ).toMatchObject({ ok: true, updatedAt: timestamp });
    expect(await logs()).toEqual([]);
    await db.delete(session).where(eq(session.id, actor.sessionId));
    expect(
      await saveGeneralWaitlistStatus(actor, form({ status: "waiting" })),
    ).toMatchObject({ ok: false });
  });
  it.each([
    "invalidStatus",
    "invalidTime",
    "file",
    "missing",
    "anonymized",
    "wrongSource",
  ])("rechaza %s sin alterar nada", async (kind) => {
    const data = form();
    if (kind === "invalidStatus") data.set("status", "diagnostico");
    if (kind === "invalidTime") data.set("expectedUpdatedAt", "mañana");
    if (kind === "file")
      data.set("entryId", new Blob(["identificador"]), "id.txt");
    if (kind === "missing") data.set("entryId", `${P}-missing`);
    if (kind === "anonymized")
      await db
        .update(waitlistEntries)
        .set({ anonymizedAt: timestamp })
        .where(eq(waitlistEntries.id, `${P}-first`));
    if (kind === "wrongSource") {
      const row = await help("wrong");
      data.set("entryId", row.id);
    }
    expect(await saveGeneralWaitlistStatus(actor, data)).toMatchObject({
      ok: false,
    });
    expect(await record()).toMatchObject({ status: "waiting" });
    expect(await logs()).toEqual([]);
  });
  it("un fallo de auditoría revierte la escritura y conserva el formulario", async () => {
    // A scoped trigger in the disposable database is visible to the app connection.
    await client.execute(
      `CREATE TRIGGER test_waitlist_rollback BEFORE INSERT ON audit_logs WHEN NEW.entity_id='${P}-first' BEGIN SELECT RAISE(ABORT,'test rollback'); END`,
    );
    try {
      const data = form();
      expect(await saveGeneralWaitlistStatus(actor, data)).toMatchObject({
        ok: false,
        code: "unavailable",
      });
      expect(data.get("status")).toBe("contacted");
      expect(await record()).toMatchObject({
        status: "waiting",
        updatedAt: timestamp,
      });
      expect(await logs()).toEqual([]);
    } finally {
      await client.execute("DROP TRIGGER test_waitlist_rollback");
    }
  });
  it("la acción verifica acceso, invalida la vista y no confunde un fallo de caché con pérdida de datos", async () => {
    mocks.refresh.mockImplementation(() => {
      throw new Error("Fallo ficticio de caché");
    });
    const result = await updateGeneralWaitlistStatus(
      { ok: false, message: "" },
      form(),
    );
    expect(result).toMatchObject({ ok: true, status: "contacted" });
    expect(result.message).toContain("Vuelve a abrir");
    expect(mocks.refresh).toHaveBeenCalledWith("/admin/lista-de-espera");
    await db.delete(session).where(eq(session.id, actor.sessionId));
    expect(
      await updateGeneralWaitlistStatus({ ok: false, message: "" }, form()),
    ).toMatchObject({ ok: false, code: "unauthorized" });
  });
  it("los errores de consulta no muestran un resultado vacío como si fuera real", async () => {
    vi.spyOn(db, "batch").mockRejectedValue(
      new Error("Fallo ficticio de consulta"),
    );
    expect(await readAdminWaitlistData(actor, {})).toMatchObject({
      failed: true,
      items: [],
      selected: null,
    });
    expect(await logs()).toEqual([]);
  });
});
