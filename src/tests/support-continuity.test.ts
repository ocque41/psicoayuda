import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { eq, like, sql } from "drizzle-orm";
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
import {
  auditLogs,
  contactMessages,
  practiceSettings,
  professionals,
  supportReplies,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({ session: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.refresh,
  revalidateTag: vi.fn(),
}));

import {
  replySupport,
  updateSupportStatus,
} from "@/app/admin/operaciones/actions";
import { replyProfessionalSupport } from "@/app/pro/soporte/actions";
import {
  readProfessionalSupportList,
  readStaffSupportList,
  readStaffSupportThread,
  readSupportThread,
  requireSupportProfessional,
  requireSupportStaff,
  type SupportProfessionalActor,
  type SupportStaffActor,
  writeSupportReply,
} from "@/lib/practice/support";

const P = "test-support-continuity";
const timestamp = () => new Date().toISOString();
const email = (role: string) => `${P}-${role}@example.test`;
const proActor = (role = "pro"): SupportProfessionalActor => ({
  kind: "professional",
  professionalId: `${P}-${role}`,
  userId: `${P}-${role}-user`,
  email: email(role),
  displayName: "Profesional ficticio",
  timeZone: "America/Caracas",
});
const staffActor = (): SupportStaffActor => ({
  kind: "staff",
  userId: `${P}-staff-user`,
  email: email("staff"),
});
function session(role: string, declaredEmail = email(role)) {
  mocks.session.mockResolvedValue({
    user: {
      id: `${P}-${role}-user`,
      email: declaredEmail,
      emailVerified: true,
    },
  });
}
function form(input: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(input)) result.set(key, value);
  return result;
}
async function ticket(
  suffix = "ticket",
  owner = "pro",
  status: "new" | "in_review" | "resolved" = "new",
) {
  const id = `${P}-${suffix}`;
  await db.insert(contactMessages).values({
    id,
    source: "professional_dashboard",
    category: "question",
    name: "Nombre ficticio",
    email: email(owner),
    professionalId: `${P}-${owner}`,
    message: "Consulta ficticia sobre el calendario.",
    status,
    handledBy: status === "resolved" ? email("staff") : null,
    handledAt: status === "resolved" ? timestamp() : null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  return id;
}
async function staffForm(
  id: string,
  body = "Respuesta ficticia del equipo.",
  status = "resolved",
) {
  const thread = await readStaffSupportThread(staffActor(), id);
  if (!thread) throw new Error("Falta el ticket ficticio");
  return form({
    contactId: id,
    body,
    status,
    submissionId: crypto.randomUUID(),
    revision: thread.revision,
  });
}
function proForm(
  id: string,
  submissionId = crypto.randomUUID(),
  body = "Continuación ficticia del profesional.",
) {
  return form({ contactId: id, submissionId, body });
}
async function replies(id: string) {
  return db
    .select()
    .from(supportReplies)
    .where(eq(supportReplies.contactId, id));
}
async function audits(id: string) {
  return db.select().from(auditLogs).where(eq(auditLogs.entityId, id));
}
async function cleanup() {
  await db
    .delete(supportReplies)
    .where(like(supportReplies.contactId, `${P}%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}%`));
  await db.delete(contactMessages).where(like(contactMessages.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}

describe("continuidad privada de soporte con escrituras atómicas", () => {
  beforeAll(async () => {
    const migration = await readFile(
      new URL("../../drizzle/0032_support_continuity.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      const name = /^CREATE TRIGGER (\w+)/.exec(statement.trim())?.[1];
      if (
        name &&
        !(
          await db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ${name}`,
          )
        ).length
      )
        await db.run(sql.raw(statement));
    }
  });
  beforeEach(async () => {
    await cleanup();
    vi.stubEnv("ADMIN_EMAILS", email("admin"));
    vi.stubEnv("SUPPORT_EMAILS", email("staff"));
    vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", email("reviewer"));
    for (const role of ["pro", "other", "staff", "reviewer", "admin"]) {
      await db.insert(user).values({
        id: `${P}-${role}-user`,
        name: "Cuenta ficticia",
        email: email(role),
        emailVerified: role !== "pro",
      });
      if (role === "pro" || role === "other")
        await db.insert(professionals).values({
          id: `${P}-${role}`,
          userId: `${P}-${role}-user`,
          email: email(role),
          fullName: "Profesional ficticio",
          nonClinicalHelper: role === "pro",
          status: role === "pro" ? "pending_verification" : "approved",
          languages: '["es"]',
          supportAreas: "[]",
          createdAt: timestamp(),
          updatedAt: timestamp(),
        });
    }
    session("pro");
    mocks.refresh.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  afterAll(cleanup);

  it("permite pedir soporte pendiente/no clínico y usa la identidad actual, bloqueando perfiles en eliminación", async () => {
    session("pro", email("staff"));
    expect(await requireSupportProfessional()).toMatchObject({
      professionalId: `${P}-pro`,
      email: email("pro"),
      timeZone: "America/Caracas",
    });
    await db.insert(practiceSettings).values({
      professionalId: `${P}-pro`,
      timeZone: "Europe/Madrid",
      updatedAt: timestamp(),
    });
    expect(await requireSupportProfessional()).toMatchObject({
      timeZone: "Europe/Madrid",
    });
    const id = await ticket();
    expect(await replyProfessionalSupport(null, proForm(id))).toMatchObject({
      ok: true,
    });
    await db
      .update(professionals)
      .set({ status: "deleting" })
      .where(eq(professionals.id, `${P}-pro`));
    expect(await requireSupportProfessional()).toBeNull();
    expect(await replyProfessionalSupport(null, proForm(id))).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    expect(await readSupportThread(proActor(), id)).toBeNull();
  });

  it("soporte usa correo verificado en BD; una sesión que declara staff o solo revisión no concede permiso", async () => {
    session("pro", email("staff"));
    expect(await requireSupportStaff()).toBeNull();
    session("reviewer");
    expect(await requireSupportStaff()).toBeNull();
    expect(await replySupport(null, form({}))).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    session("staff");
    expect(await requireSupportStaff()).toEqual(staffActor());
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, `${P}-staff-user`));
    expect(await requireSupportStaff()).toBeNull();
    expect(await updateSupportStatus(null, form({}))).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("aísla al dueño antes de leer textos y no entrega correo del equipo en DTO profesional", async () => {
    const own = await ticket();
    const foreign = await ticket("foreign", "other");
    const select = vi.spyOn(db, "select");
    expect(await readSupportThread(proActor(), foreign)).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
    expect(Object.keys(select.mock.calls[0][0] ?? {})).not.toContain("body");
    select.mockRestore();
    expect(
      await replyProfessionalSupport(null, proForm(foreign)),
    ).toMatchObject({ ok: false, code: "not_found" });
    session("staff");
    expect(await replySupport(null, await staffForm(own))).toMatchObject({
      ok: true,
    });
    const thread = await readSupportThread(proActor(), own);
    expect(thread?.replies[0]).toMatchObject({
      authorRole: "staff",
      body: "Respuesta ficticia del equipo.",
    });
    expect(JSON.stringify(thread)).not.toContain(email("staff"));
    expect(thread?.ticket).not.toHaveProperty("email");
    expect(thread?.replies[0]).not.toHaveProperty("actorUserId");
    expect(
      (await readStaffSupportThread(staffActor(), own))?.ticket,
    ).toMatchObject({ name: "Nombre ficticio", email: email("pro") });
    vi.stubEnv("SUPPORT_EMAILS", "");
    expect(await readStaffSupportThread(staffActor(), own)).toBeNull();
    expect((await readStaffSupportList(staffActor())).total).toBe(0);
  });

  it("reabre resueltos, guarda autor real y un reintento no duplica respuesta ni auditoría", async () => {
    const id = await ticket("reopen", "pro", "resolved");
    const input = proForm(id);
    const first = await replyProfessionalSupport(null, input);
    expect(first).toMatchObject({ ok: true, replyId: expect.any(String) });
    expect(await replyProfessionalSupport(null, input)).toMatchObject({
      ok: true,
      replyId: first?.replyId,
    });
    expect(await replies(id)).toHaveLength(1);
    expect(await audits(id)).toHaveLength(1);
    expect((await replies(id))[0]).toMatchObject({
      authorRole: "professional",
      actorUserId: `${P}-pro-user`,
      authorEmail: email("pro"),
    });
    expect(
      await db.query.contactMessages.findFirst({
        where: eq(contactMessages.id, id),
      }),
    ).toMatchObject({ status: "new", handledBy: null, handledAt: null });
    input.set("body", "Otro contenido ficticio.");
    expect(await replyProfessionalSupport(null, input)).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(await replies(id)).toHaveLength(1);
  });

  it("envíos simultáneos con el mismo submissionId producen una única réplica y auditoría", async () => {
    const id = await ticket("duplicate");
    const submission = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        writeSupportReply(proActor(), proForm(id, submission)),
      ),
    );
    expect(results.every((value) => value?.ok)).toBe(true);
    expect(await replies(id)).toHaveLength(1);
    expect(await audits(id)).toHaveLength(1);
    expect(new Set(results.map((value) => value?.replyId)).size).toBe(1);
  });

  it("una resolución con revisión vieja conserva el nuevo mensaje sin auditar éxito", async () => {
    const id = await ticket("stale");
    const original = await readStaffSupportThread(staffActor(), id);
    await writeSupportReply(proActor(), proForm(id));
    session("staff");
    expect(
      await updateSupportStatus(
        null,
        form({
          contactId: id,
          status: "resolved",
          revision: original?.revision ?? "",
        }),
      ),
    ).toMatchObject({ ok: false, code: "conflict" });
    expect(await audits(id)).toHaveLength(1);
    expect(
      (
        await db.query.contactMessages.findFirst({
          where: eq(contactMessages.id, id),
        })
      )?.status,
    ).toBe("new");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("CAS de estado cubre la carrera entre el SELECT y el batch; no hay auditoría fantasma", async () => {
    const id = await ticket("status-race");
    const thread = await readStaffSupportThread(staffActor(), id);
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      expect(await writeSupportReply(proActor(), proForm(id))).toMatchObject({
        ok: true,
      });
      return realBatch(queries);
    });
    session("staff");
    expect(
      await updateSupportStatus(
        null,
        form({
          contactId: id,
          status: "resolved",
          revision: thread?.revision ?? "",
        }),
      ),
    ).toMatchObject({ ok: false, code: "conflict" });
    expect((await audits(id)).map((row) => row.action)).toEqual([
      "support_professional_reply",
    ]);
    expect(
      (
        await db.query.contactMessages.findFirst({
          where: eq(contactMessages.id, id),
        })
      )?.status,
    ).toBe("new");
  });

  it("CAS de respuesta staff cubre esa misma carrera y la nueva revisión permite continuar", async () => {
    const id = await ticket("reply-race");
    const input = await staffForm(id);
    const realBatch = db.batch.bind(db);
    const race = vi
      .spyOn(db, "batch")
      .mockImplementationOnce(async (queries) => {
        expect(await writeSupportReply(proActor(), proForm(id))).toMatchObject({
          ok: true,
        });
        return realBatch(queries);
      });
    session("staff");
    expect(await replySupport(null, input)).toMatchObject({
      ok: false,
      code: "conflict",
    });
    race.mockRestore();
    expect(await replies(id)).toHaveLength(1);
    expect(await audits(id)).toHaveLength(1);
    const fresh = await staffForm(id);
    const stored = await replySupport(null, fresh);
    expect(stored).toMatchObject({ ok: true });
    expect(await replySupport(null, fresh)).toMatchObject({
      ok: true,
      replyId: stored?.replyId,
    });
    expect(await replies(id)).toHaveLength(2);
    expect(await audits(id)).toHaveLength(2);
    expect(
      (
        await db.query.contactMessages.findFirst({
          where: eq(contactMessages.id, id),
        })
      )?.status,
    ).toBe("resolved");
  });

  it("un profesional que pasa a deleting justo antes de insertar no escribe ni audita", async () => {
    const id = await ticket("delete-race");
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(professionals)
        .set({ status: "deleting" })
        .where(eq(professionals.id, `${P}-pro`));
      return realBatch(queries);
    });
    expect(await replyProfessionalSupport(null, proForm(id))).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(await replies(id)).toHaveLength(0);
    expect(await audits(id)).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("el límite de 20 respuestas por hora es atómico entre tickets y admite reintentar un envío existente", async () => {
    const one = await ticket("limit-one");
    const two = await ticket("limit-two");
    const firstInput = proForm(one);
    expect(await writeSupportReply(proActor(), firstInput)).toMatchObject({
      ok: true,
    });
    const results = await Promise.all(
      Array.from({ length: 23 }, (_, index) =>
        writeSupportReply(proActor(), proForm(index % 2 ? one : two)),
      ),
    );
    expect(results.filter((value) => value?.ok)).toHaveLength(19);
    expect(
      results.filter((value) => value?.code === "rate_limit"),
    ).toHaveLength(4);
    expect((await replies(one)).length + (await replies(two)).length).toBe(20);
    expect((await audits(one)).length + (await audits(two)).length).toBe(20);
    expect(await writeSupportReply(proActor(), firstInput)).toMatchObject({
      ok: true,
    });
    await expect(
      db.insert(supportReplies).values({
        id: `${P}-rate-bypass`,
        contactId: one,
        body: "Ejemplo ficticio adicional.",
        authorRole: "professional",
        actorUserId: `${P}-pro-user`,
        authorEmail: email("pro"),
        submissionId: crypto.randomUUID(),
        createdAt: timestamp(),
      }),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("support_reply_rate_limit") },
    });
  });

  it("las páginas de 20 recorren todos los tickets y estados sin cargar cuerpos; staff recibe nombre sin correo", async () => {
    for (let index = 0; index < 43; index++)
      await ticket(
        `page-${String(index).padStart(2, "0")}`,
        "pro",
        ["new", "in_review", "resolved"][index % 3] as
          | "new"
          | "in_review"
          | "resolved",
      );
    await ticket("page-other", "other");
    const first = await readProfessionalSupportList(proActor());
    const second = await readProfessionalSupportList(proActor(), { page: "2" });
    const last = await readProfessionalSupportList(proActor(), {
      page: "99999999",
    });
    expect(first).toMatchObject({
      page: 1,
      pageCount: 3,
      total: 43,
      counts: { all: 43, new: 15, in_review: 14, resolved: 14 },
    });
    expect([
      first.items.length,
      second.items.length,
      last.items.length,
    ]).toEqual([20, 20, 3]);
    expect(
      new Set(
        [...first.items, ...second.items, ...last.items].map((item) => item.id),
      ).size,
    ).toBe(43);
    expect(first.items[0]).not.toHaveProperty("body");
    expect(first.items[0]).not.toHaveProperty("email");
    expect(first.items[0]).not.toHaveProperty("name");
    expect(
      (await readProfessionalSupportList(proActor(), { status: "in_review" }))
        .total,
    ).toBe(14);
    const staff = await readStaffSupportList(staffActor());
    expect(staff.items[0]).toHaveProperty("name", "Nombre ficticio");
    expect(staff.items[0]).not.toHaveProperty("email");
  });

  it("historial con fechas iguales pagina estable y accesible; abre la página más reciente", async () => {
    const id = await ticket("long-thread");
    const sameDate = timestamp();
    await db.insert(supportReplies).values(
      Array.from({ length: 45 }, (_, index) => ({
        id: `${P}-msg-${String(index).padStart(2, "0")}`,
        contactId: id,
        body: "Mensaje histórico completamente ficticio.",
        authorEmail: email("staff"),
        createdAt: sameDate,
      })),
    );
    const recent = await readSupportThread(proActor(), id);
    const first = await readSupportThread(proActor(), id, "1");
    const middle = await readSupportThread(proActor(), id, "2");
    expect(recent).toMatchObject({ page: 3, pageCount: 3, total: 45 });
    expect([
      first?.replies.length,
      middle?.replies.length,
      recent?.replies.length,
    ]).toEqual([20, 20, 5]);
    const all = [
      ...(first?.replies ?? []),
      ...(middle?.replies ?? []),
      ...(recent?.replies ?? []),
    ];
    expect(new Set(all.map((row) => row.id)).size).toBe(45);
    expect(all.map((row) => row.id)).toEqual(
      [...all.map((row) => row.id)].sort(),
    );
    expect(all.every((row) => row.authorRole === "staff")).toBe(true);
  });

  it("una consulta pública admite estado con CAS y datos de contacto solo staff, no réplicas internas", async () => {
    const id = `${P}-public`;
    await db.insert(contactMessages).values({
      id,
      source: "public_contact",
      category: "other",
      email: email("public"),
      name: "Contacto ficticio",
      message: "Consulta pública ficticia.",
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    expect(await readSupportThread(proActor(), id)).toBeNull();
    session("staff");
    const thread = await readStaffSupportThread(staffActor(), id);
    expect(thread?.ticket).toMatchObject({
      email: email("public"),
      name: "Contacto ficticio",
    });
    expect(await replySupport(null, await staffForm(id))).toMatchObject({
      ok: false,
      code: "validation",
    });
    const update = form({
      contactId: id,
      status: "resolved",
      revision: thread?.revision ?? "",
    });
    expect(await updateSupportStatus(null, update)).toMatchObject({ ok: true });
    const latest = await readStaffSupportThread(staffActor(), id);
    expect(
      await updateSupportStatus(
        null,
        form({
          contactId: id,
          status: "resolved",
          revision: latest?.revision ?? "",
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(await audits(id)).toHaveLength(1);
    expect(await replies(id)).toHaveLength(0);
  });

  it("el trigger impide dueño/correo/rol falsos e impide reescribir la autoría histórica", async () => {
    const id = await ticket("db-owner");
    const base = {
      id: `${P}-forbidden`,
      contactId: id,
      body: "Ejemplo ficticio de respuesta.",
      authorRole: "professional" as const,
      actorUserId: `${P}-other-user`,
      authorEmail: email("other"),
      submissionId: crypto.randomUUID(),
      createdAt: timestamp(),
    };
    await expect(db.insert(supportReplies).values(base)).rejects.toMatchObject({
      cause: { message: expect.stringContaining("support_reply_owner") },
    });
    await expect(
      db
        .insert(supportReplies)
        .values({ ...base, actorUserId: `${P}-pro-user` }),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("support_reply_owner") },
    });
    await expect(
      db.run(
        sql`INSERT INTO support_replies (id, contact_id, body, author_email, author_role, created_at) VALUES (${base.id}, ${id}, 'Ejemplo ficticio', ${email("pro")}, 'patient', ${timestamp()})`,
      ),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("support_reply_invalid") },
    });
    expect(await writeSupportReply(proActor(), proForm(id))).toMatchObject({
      ok: true,
    });
    await expect(
      db
        .update(supportReplies)
        .set({ authorRole: "staff" })
        .where(eq(supportReplies.contactId, id)),
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining("support_reply_immutable") },
    });
    expect((await replies(id))[0].authorRole).toBe("professional");
  });

  it("un fallo de batch no confirma éxito ni deja estado o auditoría separados", async () => {
    const id = await ticket("storage-failure");
    vi.spyOn(db, "batch").mockRejectedValueOnce(
      new Error("Detalle ficticio privado que no se debe devolver"),
    );
    const state = await replyProfessionalSupport(null, proForm(id));
    expect(state).toMatchObject({ ok: false, code: "unavailable" });
    expect(JSON.stringify(state)).not.toContain("privado");
    expect(await replies(id)).toHaveLength(0);
    expect(await audits(id)).toHaveLength(0);
    expect(
      (
        await db.query.contactMessages.findFirst({
          where: eq(contactMessages.id, id),
        })
      )?.status,
    ).toBe("new");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("un fallo real de auditoría revierte INSERT y reapertura en la transacción SQLite", async () => {
    const id = await ticket("atomic-failure", "pro", "resolved");
    await db.run(sql`CREATE TRIGGER support_test_audit_failure BEFORE INSERT ON audit_logs
      WHEN NEW.entity_id = ${sql.raw(`'${id}'`)}
      BEGIN SELECT RAISE(ABORT, 'support_test_failure'); END`);
    try {
      expect(await replyProfessionalSupport(null, proForm(id))).toMatchObject({
        ok: false,
        code: "unavailable",
      });
      expect(await replies(id)).toHaveLength(0);
      expect(await audits(id)).toHaveLength(0);
      expect(
        (
          await db.query.contactMessages.findFirst({
            where: eq(contactMessages.id, id),
          })
        )?.status,
      ).toBe("resolved");
      expect(mocks.refresh).not.toHaveBeenCalled();
    } finally {
      await db.run(sql`DROP TRIGGER support_test_audit_failure`);
    }
  });

  it("un cambio de correo actual entre SELECT y escritura invalida el actor capturado", async () => {
    const id = await ticket("email-race");
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(user)
        .set({ email: email("changed") })
        .where(eq(user.id, `${P}-pro-user`));
      return realBatch(queries);
    });
    expect(await replyProfessionalSupport(null, proForm(id))).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(await replies(id)).toHaveLength(0);
    expect(await audits(id)).toHaveLength(0);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

it("la migración aditiva conserva fila histórica y el default staff sin asignar una identidad inventada", async () => {
  const local = new DatabaseSync(":memory:");
  try {
    local.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT,email_verified INTEGER); CREATE TABLE professionals(id TEXT PRIMARY KEY,user_id TEXT,status TEXT); CREATE TABLE contact_messages(id TEXT PRIMARY KEY,professional_id TEXT,source TEXT,status TEXT,handled_by TEXT,handled_at TEXT,updated_at TEXT); CREATE TABLE support_replies(id TEXT PRIMARY KEY,contact_id TEXT NOT NULL REFERENCES contact_messages(id),body TEXT NOT NULL,author_email TEXT NOT NULL,created_at TEXT NOT NULL); INSERT INTO contact_messages VALUES('ticket',NULL,'public_contact','new',NULL,NULL,'2026-01-01'); INSERT INTO support_replies VALUES('historic','ticket','Texto histórico ficticio','staff@example.test','2026-01-01');",
    );
    const before = local
      .prepare(
        "SELECT id,contact_id,body,author_email,created_at FROM support_replies",
      )
      .get();
    const migration = await readFile(
      new URL("../../drizzle/0032_support_continuity.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      local.exec(statement);
    expect(
      local
        .prepare(
          "SELECT id,contact_id,body,author_email,created_at FROM support_replies",
        )
        .get(),
    ).toEqual(before);
    expect(
      local
        .prepare(
          "SELECT author_role,actor_user_id,submission_id FROM support_replies",
        )
        .get(),
    ).toMatchObject({
      author_role: "staff",
      actor_user_id: null,
      submission_id: null,
    });
    expect(
      local.prepare("SELECT count(*) AS n FROM support_replies").get(),
    ).toMatchObject({ n: 1 });
  } finally {
    local.close();
  }
});
