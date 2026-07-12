import { and, eq, inArray, like, or } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { auditLogs, contactMessages, professionals, user } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  getRequesterHash: vi.fn(),
  getServerSession: vi.fn(),
  notifyAdminContactMessage: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: mocks.getServerSession,
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdminContactMessage: mocks.notifyAdminContactMessage,
}));
vi.mock("@/lib/requester-hash", () => ({
  getRequesterHash: mocks.getRequesterHash,
}));

import {
  adminUpdateContactMessageStatus,
  createProfessionalContactMessage,
  createPublicContactMessage,
} from "@/app/actions-contact";

const PREFIX = "test-contact-actions";
const professionalUserId = `${PREFIX}-user`;
const professionalId = `${PREFIX}-professional`;
const professionalEmail = `${PREFIX}-professional@example.com`;
const nowIso = () => new Date().toISOString();

function contactForm(input: {
  category?: string;
  company?: string;
  email?: string;
  message?: string;
  name?: string;
}) {
  const data = new FormData();
  data.set("category", input.category ?? "question");
  data.set("email", input.email ?? `${PREFIX}-public@example.com`);
  data.set(
    "message",
    input.message ?? "Este es un mensaje válido para el equipo de Nido.",
  );
  if (input.name !== undefined) data.set("name", input.name);
  if (input.company !== undefined) data.set("company", input.company);
  return data;
}

async function testContactIds() {
  return db
    .select({ id: contactMessages.id })
    .from(contactMessages)
    .where(
      or(
        like(contactMessages.email, `${PREFIX}-%@example.com`),
        eq(contactMessages.professionalId, professionalId),
      ),
    );
}

async function cleanupMessages() {
  const ids = (await testContactIds()).map((row) => row.id);
  if (ids.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids));
  }
  await db
    .delete(contactMessages)
    .where(
      or(
        like(contactMessages.email, `${PREFIX}-%@example.com`),
        eq(contactMessages.professionalId, professionalId),
      ),
    );
}

async function cleanupAll() {
  await cleanupMessages();
  await db.delete(professionals).where(eq(professionals.id, professionalId));
  await db.delete(user).where(eq(user.id, professionalUserId));
}

async function insertContact(input: {
  id: string;
  email: string;
  professionalId?: string;
  requesterHash?: string;
  status?: string;
}) {
  const timestamp = nowIso();
  await db.insert(contactMessages).values({
    id: input.id,
    source: input.professionalId ? "professional_dashboard" : "public_contact",
    category: "question",
    email: input.email,
    professionalId: input.professionalId ?? null,
    message: "Mensaje previo dentro de la ventana de una hora.",
    requesterHash: input.requesterHash ?? null,
    status: input.status ?? "new",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

beforeAll(async () => {
  await cleanupAll();
  await db.insert(user).values({
    id: professionalUserId,
    name: "Profesional verificada",
    email: professionalEmail,
  });
  await db.insert(professionals).values({
    id: professionalId,
    userId: professionalUserId,
    email: professionalEmail,
    fullName: "Profesional verificada",
    displayName: "Nombre público",
    languages: JSON.stringify(["es"]),
    supportAreas: JSON.stringify(["duelo"]),
    status: "approved",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
});

beforeEach(() => {
  mocks.getRequesterHash.mockResolvedValue(`${PREFIX}-hash-default`);
  mocks.getServerSession.mockResolvedValue(null);
  mocks.notifyAdminContactMessage.mockResolvedValue(undefined);
  mocks.requireAdmin.mockResolvedValue({
    email: "admin@example.com",
    session: {},
  });
});

afterEach(async () => {
  await cleanupMessages();
  vi.clearAllMocks();
});

afterAll(cleanupAll);

describe("contacto público", () => {
  it("normaliza y guarda antes del aviso, incluso si el correo falla", async () => {
    mocks.notifyAdminContactMessage.mockRejectedValueOnce(
      new Error("proveedor no disponible"),
    );

    const state = await createPublicContactMessage(
      null,
      contactForm({
        email: `  ${PREFIX}-PUBLIC@EXAMPLE.COM  `,
        name: "  Ana Pérez  ",
        message: "  Quiero hacer una pregunta clara al equipo.  ",
      }),
    );

    expect(state).toEqual({ ok: true });
    const saved = await db.query.contactMessages.findFirst({
      where: eq(contactMessages.email, `${PREFIX}-public@example.com`),
    });
    expect(saved).toMatchObject({
      name: "Ana Pérez",
      message: "Quiero hacer una pregunta clara al equipo.",
      source: "public_contact",
      status: "new",
    });
    expect(mocks.getRequesterHash).toHaveBeenCalledWith("contact_message");
    expect(mocks.notifyAdminContactMessage).toHaveBeenCalledOnce();
  });

  it("acepta silenciosamente el campo antirrobots sin guardar nada", async () => {
    const state = await createPublicContactMessage(
      null,
      contactForm({ company: "empresa automática" }),
    );

    expect(state).toEqual({ ok: true });
    expect(await testContactIds()).toHaveLength(0);
    expect(mocks.notifyAdminContactMessage).not.toHaveBeenCalled();
  });

  it("limita a tres mensajes por correo normalizado", async () => {
    const email = `${PREFIX}-rate-email@example.com`;
    for (let index = 0; index < 3; index += 1) {
      await insertContact({ id: `${PREFIX}-email-${index}`, email });
    }
    mocks.getRequesterHash.mockResolvedValue(undefined);

    const state = await createPublicContactMessage(
      null,
      contactForm({ email: ` ${email.toUpperCase()} ` }),
    );

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok) expect(state.message).toContain("varios mensajes");
    expect(await testContactIds()).toHaveLength(3);
  });

  it("limita también a tres mensajes por hash de conexión", async () => {
    const requesterHash = `${PREFIX}-shared-hash`;
    for (let index = 0; index < 3; index += 1) {
      await insertContact({
        id: `${PREFIX}-hash-${index}`,
        email: `${PREFIX}-hash-${index}@example.com`,
        requesterHash,
      });
    }
    mocks.getRequesterHash.mockResolvedValue(requesterHash);

    const state = await createPublicContactMessage(
      null,
      contactForm({ email: `${PREFIX}-hash-new@example.com` }),
    );

    expect(state).toMatchObject({ ok: false });
    expect(await testContactIds()).toHaveLength(3);
  });

  it("mantiene el límite con varios envíos públicos simultáneos", async () => {
    const email = `${PREFIX}-parallel-public@example.com`;
    mocks.getRequesterHash.mockResolvedValue(undefined);

    const states = await Promise.all(
      Array.from({ length: 8 }, () =>
        createPublicContactMessage(null, contactForm({ email })),
      ),
    );

    expect(states.filter((state) => state?.ok)).toHaveLength(3);
    expect(await testContactIds()).toHaveLength(3);
  });

  it("no mezcla mensajes del panel con el límite del formulario público", async () => {
    for (let index = 0; index < 3; index += 1) {
      await insertContact({
        id: `${PREFIX}-separate-${index}`,
        email: professionalEmail,
        professionalId,
      });
    }
    mocks.getRequesterHash.mockResolvedValue(`${PREFIX}-separate-hash`);

    const state = await createPublicContactMessage(
      null,
      contactForm({ email: professionalEmail }),
    );

    expect(state).toEqual({ ok: true });
    expect(await testContactIds()).toHaveLength(4);
  });

  it("devuelve un error claro si no puede consultar o guardar", async () => {
    mocks.getRequesterHash.mockRejectedValueOnce(new Error("D1 no disponible"));

    const state = await createPublicContactMessage(null, contactForm({}));

    expect(state).toEqual({
      ok: false,
      message:
        "No pudimos guardar tu mensaje. Intenta de nuevo en unos minutos o escríbenos por correo.",
    });
  });
});

describe("contacto profesional", () => {
  it("toma la identidad de la sesión e ignora campos suplantados", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: professionalUserId, email: professionalEmail },
    });
    const form = contactForm({
      email: `${PREFIX}-suplantado@example.com`,
      name: "Nombre suplantado",
      message: "Quiero proponer una mejora para el panel profesional.",
    });

    const state = await createProfessionalContactMessage(null, form);

    expect(state).toEqual({ ok: true });
    const saved = await db.query.contactMessages.findFirst({
      where: eq(contactMessages.professionalId, professionalId),
    });
    expect(saved).toMatchObject({
      name: "Nombre público",
      email: professionalEmail,
      professionalId,
      source: "professional_dashboard",
    });
  });

  it("limita a cinco mensajes por profesional", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: professionalUserId, email: professionalEmail },
    });
    for (let index = 0; index < 5; index += 1) {
      await insertContact({
        id: `${PREFIX}-professional-${index}`,
        email: professionalEmail,
        professionalId,
      });
    }

    const state = await createProfessionalContactMessage(null, contactForm({}));

    expect(state).toMatchObject({ ok: false });
    if (state && !state.ok)
      expect(state.message).toContain("varios mensajes tuyos");
    expect(await testContactIds()).toHaveLength(5);
  });

  it("mantiene el límite con varios envíos profesionales simultáneos", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: professionalUserId, email: professionalEmail },
    });

    const states = await Promise.all(
      Array.from({ length: 9 }, () =>
        createProfessionalContactMessage(null, contactForm({})),
      ),
    );

    expect(states.filter((state) => state?.ok)).toHaveLength(5);
    expect(await testContactIds()).toHaveLength(5);
  });

  it("rechaza una sesión ausente", async () => {
    const state = await createProfessionalContactMessage(null, contactForm({}));

    expect(state).toEqual({
      ok: false,
      message: "Tu sesión terminó. Entra de nuevo.",
    });
  });
});

describe("estado del buzón administrativo", () => {
  it("exige autorización", async () => {
    const id = `${PREFIX}-unauthorized`;
    await insertContact({ id, email: `${PREFIX}-unauthorized@example.com` });
    mocks.requireAdmin.mockResolvedValue(null);

    const form = new FormData();
    form.set("contactMessageId", id);
    form.set("status", "resolved");
    await adminUpdateContactMessageStatus(form);

    const row = await db.query.contactMessages.findFirst({
      where: eq(contactMessages.id, id),
    });
    expect(row?.status).toBe("new");
  });

  it("rechaza estados inválidos e identificadores inexistentes sin auditar", async () => {
    const id = `${PREFIX}-invalid`;
    await insertContact({ id, email: `${PREFIX}-invalid@example.com` });
    const invalid = new FormData();
    invalid.set("contactMessageId", id);
    invalid.set("status", "deleted");
    await adminUpdateContactMessageStatus(invalid);

    const missing = new FormData();
    missing.set("contactMessageId", `${PREFIX}-missing`);
    missing.set("status", "resolved");
    await adminUpdateContactMessageStatus(missing);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, "contact_message"),
          inArray(auditLogs.entityId, [id, `${PREFIX}-missing`]),
        ),
      );
    expect(audits).toHaveLength(0);
  });

  it("cambia el estado y crea su auditoría en el mismo batch", async () => {
    const id = `${PREFIX}-status`;
    await insertContact({ id, email: `${PREFIX}-status@example.com` });
    const form = new FormData();
    form.set("contactMessageId", id);
    form.set("status", "in_review");

    await adminUpdateContactMessageStatus(form);

    const row = await db.query.contactMessages.findFirst({
      where: eq(contactMessages.id, id),
    });
    expect(row).toMatchObject({
      status: "in_review",
      handledBy: "admin@example.com",
    });
    expect(row?.handledAt).toBeTruthy();
    const audit = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.entityType, "contact_message"),
        eq(auditLogs.entityId, id),
      ),
    });
    expect(audit).toMatchObject({
      actorEmail: "admin@example.com",
      action: "contact_message_in_review",
    });
  });
});
