import { and, eq, inArray, like } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { auditLogs, waitlistEntries } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  getRequesterHash: vi.fn(),
  notifyAdminWaitlistEntry: vi.fn(),
  notifyWaitlistConfirmation: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/notifications", () => ({
  notifyAdminWaitlistEntry: mocks.notifyAdminWaitlistEntry,
  notifyWaitlistConfirmation: mocks.notifyWaitlistConfirmation,
}));
vi.mock("@/lib/requester-hash", () => ({
  getRequesterHash: mocks.getRequesterHash,
}));

import {
  adminUpdateWaitlistStatus,
  createWaitlistEntry,
} from "@/app/actions-waitlist";

const PREFIX = "test-waitlist";
const nowIso = () => new Date().toISOString();

function waitlistForm(input: {
  company?: string;
  description?: string;
  email?: string;
  source?: string;
  title?: string;
}) {
  const data = new FormData();
  data.set("email", input.email ?? `${PREFIX}-persona@example.com`);
  data.set("title", input.title ?? "Ansiedad por el trabajo");
  data.set(
    "description",
    input.description ??
      "Siento mucha ansiedad desde hace meses y quiero trabajarla con apoyo.",
  );
  data.set("source", input.source ?? "lista-de-espera");
  if (input.company !== undefined) data.set("company", input.company);
  return data;
}

async function testEntryIds() {
  return db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(like(waitlistEntries.email, `${PREFIX}-%@example.com`));
}

async function cleanupEntries() {
  const ids = (await testEntryIds()).map((row) => row.id);
  if (ids.length) {
    await db
      .delete(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, "waitlist_entry"),
          inArray(auditLogs.entityId, ids),
        ),
      );
  }
  await db
    .delete(waitlistEntries)
    .where(like(waitlistEntries.email, `${PREFIX}-%@example.com`));
}

async function insertEntry(input: {
  id: string;
  email: string;
  requesterHash?: string;
  status?: string;
}) {
  const timestamp = nowIso();
  await db.insert(waitlistEntries).values({
    id: input.id,
    email: input.email,
    title: "Anotación previa",
    description: "Descripción previa creada por el test.",
    source: "lista-de-espera",
    status: input.status ?? "waiting",
    requesterHash: input.requesterHash ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

beforeEach(() => {
  mocks.getRequesterHash.mockResolvedValue(`${PREFIX}-hash-default`);
  mocks.notifyAdminWaitlistEntry.mockResolvedValue(undefined);
  mocks.notifyWaitlistConfirmation.mockResolvedValue(undefined);
  mocks.requireAdmin.mockResolvedValue({
    email: "admin@example.com",
    session: {},
  });
});

afterEach(async () => {
  await cleanupEntries();
  vi.clearAllMocks();
});

afterAll(cleanupEntries);

describe("lista de espera pública", () => {
  it("normaliza y guarda la anotación, y avisa a admins y a la persona", async () => {
    const state = await createWaitlistEntry(
      null,
      waitlistForm({
        email: `  ${PREFIX}-PUBLIC@EXAMPLE.COM  `,
        title: "  Ansiedad y ataques de pánico  ",
      }),
    );

    expect(state).toEqual({ ok: true });
    const saved = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.email, `${PREFIX}-public@example.com`),
    });
    expect(saved).toMatchObject({
      title: "Ansiedad y ataques de pánico",
      source: "lista-de-espera",
      status: "waiting",
    });
    expect(saved?.requesterHash).toBe(`${PREFIX}-hash-default`);
    expect(mocks.getRequesterHash).toHaveBeenCalledWith("waitlist_entry");
    expect(mocks.notifyAdminWaitlistEntry).toHaveBeenCalledOnce();
    expect(mocks.notifyWaitlistConfirmation).toHaveBeenCalledWith({
      email: `${PREFIX}-public@example.com`,
    });
  });

  it("actualiza la anotación si el correo ya estaba, sin duplicar ni reenviar avisos", async () => {
    const email = `${PREFIX}-repetida@example.com`;
    const first = await createWaitlistEntry(
      null,
      waitlistForm({ email, title: "Primer título" }),
    );
    expect(first).toEqual({ ok: true });

    // Separación mínima para que el timestamp de la actualización no coincida
    // con el de la inserción.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createWaitlistEntry(
      null,
      waitlistForm({ email, title: "Segundo título" }),
    );

    expect(second).toEqual({ ok: true });
    expect(await testEntryIds()).toHaveLength(1);
    const saved = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.email, email),
    });
    expect(saved?.title).toBe("Segundo título");
    expect(mocks.notifyAdminWaitlistEntry).toHaveBeenCalledOnce();
    expect(mocks.notifyWaitlistConfirmation).toHaveBeenCalledOnce();
  });

  it("vuelve a poner en espera una anotación cerrada cuando la persona reenvía", async () => {
    const email = `${PREFIX}-cerrada@example.com`;
    await insertEntry({
      id: `${PREFIX}-cerrada`,
      email,
      status: "closed",
    });

    const state = await createWaitlistEntry(null, waitlistForm({ email }));

    expect(state).toEqual({ ok: true });
    const saved = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.email, email),
    });
    expect(saved?.status).toBe("waiting");
  });

  it("acepta silenciosamente el campo antirrobots sin guardar nada", async () => {
    const state = await createWaitlistEntry(
      null,
      waitlistForm({ company: "empresa automática" }),
    );

    expect(state).toEqual({ ok: true });
    expect(await testEntryIds()).toHaveLength(0);
    expect(mocks.notifyAdminWaitlistEntry).not.toHaveBeenCalled();
    expect(mocks.notifyWaitlistConfirmation).not.toHaveBeenCalled();
  });

  it("rechaza una descripción demasiado corta con un mensaje claro", async () => {
    const state = await createWaitlistEntry(
      null,
      waitlistForm({ description: "Muy corta" }),
    );

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok) expect(state.message).toContain("Cuéntanos");
    expect(await testEntryIds()).toHaveLength(0);
  });

  it("limita a tres anotaciones nuevas por conexión en una hora", async () => {
    const requesterHash = `${PREFIX}-shared-hash`;
    for (let index = 0; index < 3; index += 1) {
      await insertEntry({
        id: `${PREFIX}-hash-${index}`,
        email: `${PREFIX}-hash-${index}@example.com`,
        requesterHash,
      });
    }
    mocks.getRequesterHash.mockResolvedValue(requesterHash);

    const state = await createWaitlistEntry(
      null,
      waitlistForm({ email: `${PREFIX}-hash-nueva@example.com` }),
    );

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok) expect(state.message).toContain("anotaciones");
    expect(await testEntryIds()).toHaveLength(3);
  });

  it("mantiene el límite con varios envíos simultáneos desde la misma conexión", async () => {
    const requesterHash = `${PREFIX}-parallel-hash`;
    mocks.getRequesterHash.mockResolvedValue(requesterHash);

    const states = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createWaitlistEntry(
          null,
          waitlistForm({ email: `${PREFIX}-parallel-${index}@example.com` }),
        ),
      ),
    );

    expect(states.filter((state) => state?.ok)).toHaveLength(3);
    expect(await testEntryIds()).toHaveLength(3);
  });

  it("devuelve un error claro si no puede consultar o guardar", async () => {
    mocks.getRequesterHash.mockRejectedValueOnce(new Error("D1 no disponible"));

    const state = await createWaitlistEntry(null, waitlistForm({}));

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok)
      expect(state.message).toContain("No pudimos guardar");
  });
});

describe("estado de la lista de espera en el admin", () => {
  it("exige autorización", async () => {
    const id = `${PREFIX}-unauthorized`;
    await insertEntry({ id, email: `${PREFIX}-unauthorized@example.com` });
    mocks.requireAdmin.mockResolvedValue(null);

    const form = new FormData();
    form.set("waitlistId", id);
    form.set("status", "contacted");
    await adminUpdateWaitlistStatus(form);

    const row = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.id, id),
    });
    expect(row?.status).toBe("waiting");
  });

  it("rechaza estados inválidos e identificadores inexistentes sin auditar", async () => {
    const id = `${PREFIX}-invalid`;
    await insertEntry({ id, email: `${PREFIX}-invalid@example.com` });
    const invalid = new FormData();
    invalid.set("waitlistId", id);
    invalid.set("status", "deleted");
    await adminUpdateWaitlistStatus(invalid);

    const missing = new FormData();
    missing.set("waitlistId", `${PREFIX}-missing`);
    missing.set("status", "contacted");
    await adminUpdateWaitlistStatus(missing);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, "waitlist_entry"),
          inArray(auditLogs.entityId, [id, `${PREFIX}-missing`]),
        ),
      );
    expect(audits).toHaveLength(0);
  });

  it("cambia el estado y crea su auditoría en el mismo batch", async () => {
    const id = `${PREFIX}-status`;
    await insertEntry({ id, email: `${PREFIX}-status@example.com` });
    const form = new FormData();
    form.set("waitlistId", id);
    form.set("status", "matched");

    await adminUpdateWaitlistStatus(form);

    const row = await db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.id, id),
    });
    expect(row?.status).toBe("matched");
    const audit = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.entityType, "waitlist_entry"),
        eq(auditLogs.entityId, id),
      ),
    });
    expect(audit).toMatchObject({
      actorEmail: "admin@example.com",
      action: "waitlist_matched",
    });
  });
});
