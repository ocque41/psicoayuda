import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { eq, like, sql } from "drizzle-orm";
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
  admissionCases,
  admissionConfiguration,
  admissionEvents,
  auditLogs,
  practiceCredentials,
  professionals,
  session,
  user,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { requireAdmissionReviewer } from "@/lib/admission/access";
import { admissionHistoryDetails } from "@/lib/admission/history";
import {
  configureAdmissionStages,
  moveAdmissionStage,
  publishAdmissionCandidate,
  saveAdmissionReview,
  saveAdmissionScope,
} from "@/lib/admission/mutations";
import { readAdmissionBoard } from "@/lib/admission/queries";
import {
  type AdmissionReviewer,
  defaultAdmissionStages,
} from "@/lib/admission/types";
import { parseAdmissionStages } from "@/lib/admission/validation";

const mocks = vi.hoisted(() => ({ session: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.refresh,
  revalidateTag: mocks.refresh,
}));

import { saveReview } from "@/app/admin/admision/actions";
import { GET } from "@/app/admin/admision/documento/[professionalId]/route";
import AdmissionPage from "@/app/admin/admision/page";

const P = "test-admission-pipeline";
const profileRevision = "2000-01-01T00:00:00.000Z";
const actor: AdmissionReviewer = {
  userId: `${P}-reviewer`,
  email: `${P}-reviewer@example.test`,
  isAdmin: false,
  sessionId: `${P}-auth-reviewer`,
};
const proId = `${P}-pending`;
let client: ReturnType<typeof createClient>;
function form(fields: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({
    professionalId: proId,
    revision: "0",
    configRevision: "1",
    profileRevision,
    identityChecked: "on",
    identityReference: "Identidad cotejada mediante entrevista",
    credentialsChecked: "on",
    credentialsReference: "Registro profesional consultado",
    interviewLocal: "2000-01-02T10:00",
    interviewTimeZone: "America/Caracas",
    interviewReference: "Entrevista realizada y cotejada",
    interviewCompleted: "on",
    reference: "Revisión manual de la candidatura",
    ...fields,
  }))
    result.set(key, value);
  return result;
}
async function record() {
  return db.query.admissionCases.findFirst({
    where: eq(admissionCases.professionalId, proId),
  });
}
async function events() {
  return db.query.admissionEvents.findMany({
    where: eq(admissionEvents.professionalId, proId),
  });
}
async function logs() {
  return db.query.auditLogs.findMany({ where: eq(auditLogs.entityId, proId) });
}
async function prepared() {
  expect(await saveAdmissionReview(actor, form())).toMatchObject({ ok: true });
  expect(
    await saveAdmissionScope(
      actor,
      form({
        revision: "1",
        country: "Venezuela",
        registryReference: "Registro oficial cotejado",
        expiresAt: new Date(Date.now() + 30 * 86_400_000)
          .toISOString()
          .slice(0, 10),
        checked: "on",
      }),
    ),
  ).toMatchObject({ ok: true });
  expect(
    await moveAdmissionStage(
      actor,
      form({ revision: "2", stageId: "publication" }),
    ),
  ).toMatchObject({ ok: true });
}
async function cleanup() {
  vi.restoreAllMocks();
  await db.delete(admissionEvents);
  await db.delete(admissionCases);
  await db.delete(admissionConfiguration);
  await db
    .delete(practiceCredentials)
    .where(like(practiceCredentials.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(session).where(like(session.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
  await db.delete(auditLogs).where(sql`${auditLogs.action} LIKE 'admission_%'`);
}
beforeAll(async () => {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:") || !url.includes("nido-tests-"))
    throw new Error(
      "La prueba de admisión requiere la base temporal de test:isolated.",
    );
  client = createClient({ url });
  const migration = await readFile(
    new URL(
      "../../drizzle/0040_professional_admission_pipeline.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    const normalized = statement.trim().replace(/^(?:--[^\n]*\n\s*)+/, "");
    if (normalized.startsWith("CREATE TRIGGER"))
      await client.execute(
        normalized.replace("CREATE TRIGGER", "CREATE TRIGGER IF NOT EXISTS"),
      );
  }
});
beforeEach(async () => {
  await cleanup();
  vi.stubEnv("ADMISSION_REVIEWER_EMAILS", actor.email);
  vi.stubEnv("ADMIN_EMAILS", `${P}-admin@example.test`);
  await db.insert(admissionConfiguration).values({
    id: "default",
    stagesJson: JSON.stringify(defaultAdmissionStages),
    revision: 1,
    updatedAt: profileRevision,
  });
  await db.insert(user).values({
    id: actor.userId,
    name: "Revisor ficticio",
    email: actor.email,
    emailVerified: true,
  });
  await db.insert(session).values({
    id: actor.sessionId,
    userId: actor.userId,
    token: `${P}-reviewer-token`,
    expiresAt: new Date(Date.now() + 86400000),
  });
  await db.insert(user).values({
    id: `${P}-admin`,
    name: "Administrador ficticio",
    email: `${P}-admin@example.test`,
    emailVerified: true,
  });
  await db.insert(session).values({
    id: `${P}-auth-admin`,
    userId: `${P}-admin`,
    token: `${P}-admin-token`,
    expiresAt: new Date(Date.now() + 86400000),
  });
  for (const status of [
    "pending_verification",
    "approved",
    "rejected",
    "suspended",
    "deleting",
  ] as const) {
    const suffix = status === "pending_verification" ? "pending" : status;
    await db.insert(user).values({
      id: `${P}-${suffix}-user`,
      name: "Profesional ficticio",
      email: `${P}-${suffix}@example.test`,
      emailVerified: true,
    });
    await db.insert(professionals).values({
      id: `${P}-${suffix}`,
      userId: `${P}-${suffix}-user`,
      email: `${P}-${suffix}@example.test`,
      fullName: "Profesional ficticio",
      country: "Venezuela",
      licenseCountry: "Venezuela",
      university: "Universidad ficticia",
      licenseNumber: "REGISTRO-FICTICIO",
      languages: "[]",
      supportAreas: "[]",
      status,
      conductAcceptedAt: profileRevision,
      registrationProofDoc: "data:application/pdf;base64,JVBERg==",
      createdAt: profileRevision,
      updatedAt: profileRevision,
    });
  }
  mocks.session.mockResolvedValue({
    user: { id: actor.userId, email: actor.email },
    session: { id: actor.sessionId },
  });
  mocks.refresh.mockClear();
});
afterAll(async () => {
  await cleanup();
  client?.close();
  vi.unstubAllEnvs();
});

describe("admisión: permisos, revisión y publicación atómica", () => {
  it("el administrador comparte el tablero y el revisor conserva sólo Admisión", async () => {
    expect(await requireAdmin()).toBeNull();
    expect(await requireAdmissionReviewer()).toEqual(actor);
    expect((await readAdmissionBoard(actor, {})).limitedReviewer).toBe(true);
    mocks.session.mockResolvedValue({
      user: { id: `${P}-admin`, email: `${P}-admin@example.test` },
      session: { id: `${P}-auth-admin` },
    });
    const admin = await requireAdmissionReviewer();
    expect(admin).toMatchObject({
      isAdmin: true,
      userId: `${P}-admin`,
      sessionId: `${P}-auth-admin`,
    });
    expect(await requireAdmin()).toBeTruthy();
    expect(
      (await readAdmissionBoard(admin as AdmissionReviewer, {})).candidates.map(
        (candidate) => candidate.professionalId,
      ),
    ).toEqual([proId]);
    expect(
      (await readAdmissionBoard(admin as AdmissionReviewer, {}))
        .limitedReviewer,
    ).toBe(false);
    expect(
      await saveAdmissionReview(admin as AdmissionReviewer, form()),
    ).toMatchObject({ ok: true });
    expect((await events())[0].actorUserId).toBe(`${P}-admin`);
  });
  it.each([
    "revoked",
    "expired",
    "foreign",
  ])("una sesión %s no ve tablero, comprobante ni guarda revisiones", async (mode) => {
    let stale = actor;
    if (mode === "revoked")
      await db.delete(session).where(eq(session.id, actor.sessionId));
    else if (mode === "expired")
      await db
        .update(session)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(session.id, actor.sessionId));
    else {
      stale = { ...actor, sessionId: `${P}-auth-admin` };
      mocks.session.mockResolvedValue({
        user: { id: actor.userId, email: actor.email },
        session: { id: stale.sessionId },
      });
    }
    expect(await requireAdmissionReviewer()).toBeNull();
    await expect(
      readAdmissionBoard(stale, { candidato: proId }),
    ).rejects.toThrow("admission_configuration_unavailable");
    expect(await saveAdmissionReview(stale, form())).toMatchObject({
      ok: false,
    });
    expect(
      (
        await GET(new Request("https://example.test"), {
          params: Promise.resolve({ professionalId: proId }),
        })
      ).status,
    ).toBe(403);
    expect(await record()).toBeUndefined();
    expect(await events()).toHaveLength(0);
    expect(await logs()).toHaveLength(0);
  });
  it.each([
    "revoked",
    "expired",
    "email_changed",
  ])("recomprueba sesión %s tras lectura antes del batch", async (mode) => {
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      if (mode === "revoked")
        await db.delete(session).where(eq(session.id, actor.sessionId));
      else if (mode === "expired")
        await db
          .update(session)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(session.id, actor.sessionId));
      else
        await db
          .update(user)
          .set({ email: `${P}-changed@example.test` })
          .where(eq(user.id, actor.userId));
      return original(queries);
    });
    expect(await saveAdmissionReview(actor, form())).toMatchObject({
      ok: false,
    });
    expect(await record()).toBeUndefined();
    expect(await events()).toHaveLength(0);
    expect(await logs()).toHaveLength(0);
  });
  it("un rol retirado no aprovecha un actor capturado aunque su sesión siga viva", async () => {
    expect(await requireAdmissionReviewer()).toEqual(actor);
    vi.stubEnv("ADMISSION_REVIEWER_EMAILS", "");
    expect(await requireAdmissionReviewer()).toBeNull();
    expect(await saveAdmissionReview(actor, form())).toMatchObject({
      ok: false,
    });
    expect(await record()).toBeUndefined();
  });
  it("Paola puede ajustar nombres de fases, pero no retirar controles obligatorios", async () => {
    expect(actor.isAdmin).toBe(false);
    const stages = defaultAdmissionStages.map((stage) => ({
      ...stage,
      label: stage.id === "interview" ? "Llamada de admisión" : stage.label,
    }));
    expect(
      await configureAdmissionStages(
        actor,
        form({ stagesJSON: JSON.stringify(stages) }),
      ),
    ).toMatchObject({ ok: true });
    expect((await readAdmissionBoard(actor, {})).stages).toEqual(stages);
    expect(
      await configureAdmissionStages(
        actor,
        form({
          configRevision: "2",
          stagesJSON: JSON.stringify(
            stages.filter((stage) => stage.id !== "credentials"),
          ),
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await moveAdmissionStage(
        actor,
        form({ configRevision: "2", stageId: "publication" }),
      ),
    ).toMatchObject({ ok: false });
    expect(await record()).toBeUndefined();
  });
  it("requiere identidad actual verificada y no concede soporte ni administración general", async () => {
    expect(await requireAdmissionReviewer()).toEqual(actor);
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, actor.userId));
    expect(await requireAdmissionReviewer()).toBeNull();
    expect(await saveAdmissionReview(actor, form())).toMatchObject({
      ok: false,
    });
    expect(await record()).toBeUndefined();
    expect(await events()).toHaveLength(0);
    expect(await logs()).toHaveLength(0);
  });
  it("una sesión sin autorización no carga candidaturas ni documentos", async () => {
    mocks.session.mockResolvedValue(null);
    const select = vi.spyOn(db, "select");
    await AdmissionPage({ searchParams: Promise.resolve({}) });
    expect(await saveReview({ ok: false, message: "" }, form())).toMatchObject({
      code: "unauthorized",
    });
    expect(
      (
        await GET(new Request("https://example.test"), {
          params: Promise.resolve({ professionalId: proId }),
        })
      ).status,
    ).toBe(403);
    expect(select).not.toHaveBeenCalled();
  });
  it("limita listado y documentos a candidatos clínicos pendientes", async () => {
    const board = await readAdmissionBoard(actor, {
      candidato: `${P}-approved`,
    });
    expect(
      board.candidates.map((candidate) => candidate.professionalId),
    ).toEqual([proId]);
    expect(board.selected).toBeNull();
    expect(board.limitedReviewer).toBe(true);
    for (const suffix of ["approved", "rejected", "suspended", "deleting"]) {
      expect(
        await saveAdmissionReview(
          actor,
          form({ professionalId: `${P}-${suffix}` }),
        ),
      ).toMatchObject({ ok: false });
      expect(
        (
          await GET(new Request("https://example.test"), {
            params: Promise.resolve({ professionalId: `${P}-${suffix}` }),
          })
        ).status,
      ).toBe(404);
    }
    await db
      .update(professionals)
      .set({ nonClinicalHelper: true })
      .where(eq(professionals.id, proId));
    expect((await readAdmissionBoard(actor, {})).candidates).toHaveLength(0);
    expect(
      (
        await GET(new Request("https://example.test"), {
          params: Promise.resolve({ professionalId: proId }),
        })
      ).status,
    ).toBe(404);
  });
  it("entrega el documento autorizado con cabeceras privadas y sandbox", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ professionalId: proId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });
  it("no entrega archivos activos ni documentos sobredimensionados", async () => {
    for (const document of [
      "data:text/html;base64,PHNjcmlwdD4=",
      `data:application/pdf;base64,${"A".repeat(3_000_000)}`,
    ]) {
      await db
        .update(professionals)
        .set({ registrationProofDoc: document })
        .where(eq(professionals.id, proId));
      expect(
        (
          await GET(new Request("https://example.test"), {
            params: Promise.resolve({ professionalId: proId }),
          })
        ).status,
      ).toBe(404);
    }
  });
  it("registra cotejo, UTC e historial con una sola auditoría y sin publicar", async () => {
    expect(await saveAdmissionReview(actor, form())).toMatchObject({
      ok: true,
    });
    expect(await record()).toMatchObject({
      revision: 1,
      profileRevision,
      stageId: "identity",
      interviewAt: "2000-01-02T14:00:00.000Z",
      interviewTimeZone: "America/Caracas",
    });
    expect(await events()).toHaveLength(1);
    expect(await logs()).toHaveLength(1);
    expect(
      (
        await db.query.professionals.findFirst({
          where: eq(professionals.id, proId),
        })
      )?.status,
    ).toBe("pending_verification");
    expect(
      (await readAdmissionBoard(actor, { candidato: proId })).selected
        ?.canPublish,
    ).toBe(false);
  });
  it("rechaza cédulas en referencias, entrevista futura completa y horas ambiguas", async () => {
    const invalidInputs: Record<string, string>[] = [
      { identityReference: "V-12345678" },
      { interviewLocal: "2099-01-01T10:00" },
      {
        interviewLocal: "2026-10-25T02:30",
        interviewTimeZone: "Europe/Madrid",
      },
      {
        interviewLocal: "2026-03-29T02:30",
        interviewTimeZone: "Europe/Madrid",
      },
      { identityReference: "", identityChecked: "on" },
    ];
    for (const changes of invalidInputs)
      expect(await saveAdmissionReview(actor, form(changes))).toMatchObject({
        code: "invalid",
      });
    expect(await record()).toBeUndefined();
    expect(await events()).toHaveLength(0);
  });
  it.each([
    [{ interviewLocal: "2099-01-01T10:00" }, "interviewLocal"],
    [
      {
        interviewLocal: "2026-03-29T02:30",
        interviewTimeZone: "Europe/Madrid",
      },
      "interviewLocal",
    ],
    [
      {
        interviewLocal: "2026-10-25T02:30",
        interviewTimeZone: "Europe/Madrid",
      },
      "interviewLocal",
    ],
    [{ interviewTimeZone: "Fake/Zone" }, "interviewTimeZone"],
    [{ interviewLocal: "" }, "interviewLocal"],
    [{ interviewReference: "" }, "interviewReference"],
  ] as const)("identifica el campo de entrevista rechazado: %j", async (changes, field) => {
    expect(await saveAdmissionReview(actor, form(changes))).toMatchObject({
      ok: false,
      code: "invalid",
      field,
    });
    expect(await record()).toBeUndefined();
    expect(await events()).toHaveLength(0);
  });
  it("dos formularios simultáneos no pisan una revisión ni duplican historial", async () => {
    const results = await Promise.all([
      saveAdmissionReview(actor, form()),
      saveAdmissionReview(
        actor,
        form({ identityReference: "Otra entrevista de cotejo" }),
      ),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await record()).toMatchObject({ revision: 1 });
    expect(await events()).toHaveLength(1);
    expect(await logs()).toHaveLength(1);
  });
  it("no salta puertas obligatorias y permite retroceder con referencia", async () => {
    expect(
      await moveAdmissionStage(actor, form({ stageId: "publication" })),
    ).toMatchObject({ code: "blocked" });
    await prepared();
    expect(
      await moveAdmissionStage(
        actor,
        form({ revision: "3", stageId: "credentials" }),
      ),
    ).toMatchObject({ ok: true });
    expect(await record()).toMatchObject({
      revision: 4,
      stageId: "credentials",
    });
    expect((await events()).at(-1)).toMatchObject({ action: "stage_returned" });
  });
  it("publica explícitamente con puertas completas y sale del alcance de admisión", async () => {
    await prepared();
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "3", confirm: "on" }),
      ),
    ).toMatchObject({ ok: true, published: true });
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, proId),
      }),
    ).toMatchObject({
      status: "approved",
      credentialConfirmed: true,
      remoteAvailable: true,
    });
    expect(await events()).toHaveLength(4);
    expect(await logs()).toHaveLength(4);
    expect(
      (await readAdmissionBoard(actor, { candidato: proId })).selected,
    ).toBeNull();
    expect(
      (
        await GET(new Request("https://example.test"), {
          params: Promise.resolve({ professionalId: proId }),
        })
      ).status,
    ).toBe(404);
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "3", confirm: "on" }),
      ),
    ).toMatchObject({ ok: false });
    expect(await events()).toHaveLength(4);
  });
  it("no publica sin consentimiento, ámbito vigente ni confirmación", async () => {
    await prepared();
    expect(
      await publishAdmissionCandidate(actor, form({ revision: "3" })),
    ).toMatchObject({ code: "invalid" });
    await db
      .update(professionals)
      .set({ conductAcceptedAt: null })
      .where(eq(professionals.id, proId));
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "3", confirm: "on" }),
      ),
    ).toMatchObject({ ok: false });
    await db
      .update(professionals)
      .set({ conductAcceptedAt: profileRevision })
      .where(eq(professionals.id, proId));
    await db
      .update(practiceCredentials)
      .set({ expiresAt: profileRevision })
      .where(eq(practiceCredentials.professionalId, proId));
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "3", confirm: "on" }),
      ),
    ).toMatchObject({ ok: false });
    expect(await record()).toMatchObject({ revision: 3 });
    expect(await events()).toHaveLength(3);
  });
  it("invalida cotejos del perfil editado y bloquea la versión abierta", async () => {
    await prepared();
    const next = "2000-01-01T00:00:01.000Z";
    await db
      .update(professionals)
      .set({ updatedAt: next, university: "Universidad ficticia corregida" })
      .where(eq(professionals.id, proId));
    const detail = (await readAdmissionBoard(actor, { candidato: proId }))
      .selected;
    expect(detail?.gates).toEqual({
      identity: false,
      credentials: false,
      scope: true,
      interview: false,
    });
    expect(detail?.publishBlockers.join(" ")).toContain("El perfil cambió");
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "3", confirm: "on" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "3", profileRevision: next, confirm: "on" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await saveAdmissionReview(
        actor,
        form({ revision: "3", profileRevision: next }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await publishAdmissionCandidate(
        actor,
        form({ revision: "4", profileRevision: next, confirm: "on" }),
      ),
    ).toMatchObject({ ok: true });
  });
  it("revierte todo si la publicación del perfil falla después del CAS", async () => {
    await prepared();
    await client.execute(
      `CREATE TRIGGER test_admission_ignore_publish BEFORE UPDATE OF status ON professionals WHEN NEW.id='${proId}' AND NEW.status='approved' BEGIN SELECT RAISE(IGNORE); END`,
    );
    try {
      expect(
        await publishAdmissionCandidate(
          actor,
          form({ revision: "3", confirm: "on" }),
        ),
      ).toMatchObject({ ok: false });
      expect(await record()).toMatchObject({ revision: 3 });
      expect(await events()).toHaveLength(3);
      expect(await logs()).toHaveLength(3);
      expect(
        (
          await db.query.professionals.findFirst({
            where: eq(professionals.id, proId),
          })
        )?.status,
      ).toBe("pending_verification");
    } finally {
      await client.execute("DROP TRIGGER test_admission_ignore_publish");
    }
  });
  it("vuelve a comprobar identidad dentro del batch si cambia tras la lectura", async () => {
    const original = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (queries) => {
      await db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, actor.userId));
      return original(queries);
    });
    expect(await saveAdmissionReview(actor, form())).toMatchObject({
      ok: false,
    });
    expect(await record()).toBeUndefined();
    expect(await events()).toHaveLength(0);
    expect(await logs()).toHaveLength(0);
  });
  it("recomprueba el ámbito al publicar y revierte si vence dentro del batch", async () => {
    await prepared();
    await client.execute(
      `CREATE TRIGGER test_admission_expire_scope AFTER UPDATE ON admission_cases WHEN NEW.professional_id='${proId}' AND NEW.revision=4 BEGIN UPDATE practice_credentials SET expires_at='${profileRevision}' WHERE professional_id=NEW.professional_id; END`,
    );
    try {
      expect(
        await publishAdmissionCandidate(
          actor,
          form({ revision: "3", confirm: "on" }),
        ),
      ).toMatchObject({ ok: false });
      expect(await record()).toMatchObject({ revision: 3 });
      expect(await events()).toHaveLength(3);
      expect(
        (await readAdmissionBoard(actor, { candidato: proId })).selected?.gates
          .scope,
      ).toBe(true);
    } finally {
      await client.execute("DROP TRIGGER test_admission_expire_scope");
    }
  });
  it("conserva éxito confirmado aunque falle la actualización de caché", async () => {
    mocks.refresh.mockImplementationOnce(() => {
      throw new Error("cache_fixture_unavailable");
    });
    expect(await saveReview({ ok: false, message: "" }, form())).toMatchObject({
      ok: true,
      message: expect.stringContaining(
        "La actualización de las vistas puede tardar",
      ),
    });
    expect(await record()).toMatchObject({ revision: 1 });
    expect(await events()).toHaveLength(1);
  });
  it("la migración completa preserva filas existentes y crea restricciones reales", async () => {
    const isolated = createClient({ url: "file::memory:" });
    try {
      await isolated.execute("PRAGMA foreign_keys=ON");
      await isolated.execute(
        "CREATE TABLE user(id TEXT PRIMARY KEY,email TEXT NOT NULL,email_verified INTEGER NOT NULL)",
      );
      await isolated.execute(
        "INSERT INTO user VALUES('legacy-user','legacy@example.test',1)",
      );
      await isolated.execute(
        "CREATE TABLE professionals(id TEXT PRIMARY KEY,user_id TEXT REFERENCES user(id),status TEXT NOT NULL,non_clinical_helper INTEGER NOT NULL)",
      );
      await isolated.execute(
        "INSERT INTO professionals VALUES('legacy-approved','legacy-user','approved',0),('new-pending','legacy-user','pending_verification',0)",
      );
      const migration = await readFile(
        new URL(
          "../../drizzle/0040_professional_admission_pipeline.sql",
          import.meta.url,
        ),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await isolated.execute(statement);
      expect(
        (
          await isolated.execute(
            "SELECT id,status FROM professionals ORDER BY id",
          )
        ).rows,
      ).toMatchObject([
        { id: "legacy-approved", status: "approved" },
        { id: "new-pending", status: "pending_verification" },
      ]);
      expect(
        (await isolated.execute("SELECT revision FROM admission_configuration"))
          .rows,
      ).toMatchObject([{ revision: 1 }]);
      expect(
        (await isolated.execute("SELECT id,email_verified FROM user")).rows,
      ).toMatchObject([{ id: "legacy-user", email_verified: 1 }]);
      await expect(
        isolated.execute(
          "INSERT INTO admission_cases(professional_id,stage_id,profile_revision,config_revision,last_event_id,created_at,updated_at) VALUES('legacy-approved','identity','version',1,'event','time','time')",
        ),
      ).rejects.toThrow("admission_pending_candidate");
      await isolated.execute(
        "INSERT INTO admission_cases(professional_id,stage_id,profile_revision,config_revision,last_event_id,created_at,updated_at) VALUES('new-pending','identity','version',1,'event','time','time')",
      );
      await expect(
        isolated.execute(
          "UPDATE admission_cases SET revision=3 WHERE professional_id='new-pending'",
        ),
      ).rejects.toThrow("admission_candidate_revision");
      expect(
        (await isolated.execute("SELECT revision FROM admission_cases")).rows,
      ).toMatchObject([{ revision: 1 }]);
      await isolated.execute(
        "INSERT INTO admission_events(id,revision,config_revision,actor_user_id,action,summary,created_at) VALUES('event',1,1,'reviewer','fixture','Fixture','time')",
      );
      await expect(
        isolated.execute(
          "UPDATE admission_events SET summary='changed' WHERE id='event'",
        ),
      ).rejects.toThrow("admission_event_immutable");
    } finally {
      isolated.close();
    }
  });
  it("configura etapas con CAS, no retira una etapa ocupada y conserva requisitos", async () => {
    const custom = [
      ...defaultAdmissionStages.slice(0, 4),
      { id: "custom_info", label: "Pendiente de información", core: false },
      defaultAdmissionStages[4],
    ];
    expect(parseAdmissionStages(JSON.stringify(custom))).toEqual(custom);
    expect(
      await configureAdmissionStages(
        actor,
        form({ stagesJSON: JSON.stringify(custom) }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await configureAdmissionStages(
        actor,
        form({ stagesJSON: JSON.stringify(custom) }),
      ),
    ).toMatchObject({ code: "conflict" });
    expect(
      await saveAdmissionReview(actor, form({ configRevision: "2" })),
    ).toMatchObject({ ok: true });
    expect(
      await saveAdmissionScope(
        actor,
        form({
          configRevision: "2",
          revision: "1",
          country: "Venezuela",
          registryReference: "Registro profesional cotejado",
          expiresAt: new Date(Date.now() + 30 * 86_400_000)
            .toISOString()
            .slice(0, 10),
          checked: "on",
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await moveAdmissionStage(
        actor,
        form({ configRevision: "2", revision: "2", stageId: "custom_info" }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await configureAdmissionStages(
        actor,
        form({
          configRevision: "2",
          stagesJSON: JSON.stringify(defaultAdmissionStages),
        }),
      ),
    ).toMatchObject({ code: "conflict" });
    expect((await readAdmissionBoard(actor, {})).stages).toEqual(custom);
    expect(
      parseAdmissionStages(JSON.stringify(defaultAdmissionStages.slice(1))),
    ).toBeNull();
    expect(
      parseAdmissionStages(
        JSON.stringify([...defaultAdmissionStages].reverse()),
      ),
    ).toBeNull();
  });
  it("normaliza parámetros repetidos y acota páginas antes de consultar", async () => {
    const board = await readAdmissionBoard(actor, {
      q: ["Profesional", "otro"],
      pagina: "9".repeat(100),
      historial: ["2", "3"],
      candidato: [proId],
    });
    expect(board.query).toBe("Profesional");
    expect(board.page).toBe(1);
    expect(board.selected?.historyPage).toBe(2);
  });
  it("no retira una etapa usada por casos suspendidos, rechazados o auxiliares", async () => {
    const stages = [
      { id: "custom_hold", label: "Pendiente de información", core: false },
      ...defaultAdmissionStages,
    ];
    expect(
      await configureAdmissionStages(
        actor,
        form({ stagesJSON: JSON.stringify(stages) }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await saveAdmissionReview(actor, form({ configRevision: "2" })),
    ).toMatchObject({ ok: true });
    for (const status of [
      "suspended",
      "rejected",
      "pending_verification",
    ] as const) {
      await db
        .update(professionals)
        .set({ status, nonClinicalHelper: status === "pending_verification" })
        .where(eq(professionals.id, proId));
      expect(
        await configureAdmissionStages(
          actor,
          form({
            configRevision: "2",
            stagesJSON: JSON.stringify(defaultAdmissionStages),
          }),
        ),
      ).toMatchObject({ ok: false });
      expect((await readAdmissionBoard(actor, {})).candidates).toHaveLength(0);
    }
    await db
      .update(professionals)
      .set({ status: "pending_verification", nonClinicalHelper: false })
      .where(eq(professionals.id, proId));
    expect((await readAdmissionBoard(actor, {})).candidates[0]?.stageId).toBe(
      "custom_hold",
    );
    expect((await db.query.admissionConfiguration.findFirst())?.revision).toBe(
      2,
    );
  });
  it("conserva las evidencias anteriores, fecha y configuración en historial acotado", async () => {
    expect(await saveAdmissionReview(actor, form())).toMatchObject({
      ok: true,
    });
    expect(
      await saveAdmissionReview(
        actor,
        form({
          revision: "1",
          identityReference: "Nuevo cotejo mediante entrevista",
        }),
      ),
    ).toMatchObject({ ok: true });
    const history =
      (await readAdmissionBoard(actor, { candidato: proId })).selected
        ?.history || [];
    expect(history).toHaveLength(2);
    expect(history[0].details?.join(" ")).toContain(
      "Nuevo cotejo mediante entrevista",
    );
    expect(history[1].details?.join(" ")).toContain(
      "Identidad cotejada mediante entrevista",
    );
    expect(history[1].details?.join(" ")).toContain("2000-01-02T14:00:00.000Z");
    const metadata = JSON.parse((await events())[0].metadata);
    expect(metadata).toMatchObject({
      identityReference: "Identidad cotejada mediante entrevista",
      credentialsReference: "Registro profesional consultado",
      interviewReference: "Entrevista realizada y cotejada",
      interviewTimeZone: "America/Caracas",
      profileRevision,
    });
    expect(JSON.stringify(metadata)).not.toContain(actor.email);
    expect(JSON.stringify(metadata)).not.toContain("registrationProofDoc");
    const stages = defaultAdmissionStages.map((stage) => ({
      ...stage,
      label: stage.id === "identity" ? "Cotejo de identidad" : stage.label,
    }));
    expect(
      await configureAdmissionStages(
        actor,
        form({ stagesJSON: JSON.stringify(stages) }),
      ),
    ).toMatchObject({ ok: true });
    const configurationEvent = await db.query.admissionEvents.findFirst({
      where: eq(admissionEvents.action, "configuration_changed"),
    });
    expect(JSON.parse(configurationEvent?.metadata || "{}")).toMatchObject({
      stages,
      reference: "Revisión manual de la candidatura",
    });
    expect(admissionHistoryDetails("review_saved", "{")).toEqual([]);
    expect(admissionHistoryDetails("review_saved", "x".repeat(8001))).toEqual(
      [],
    );
    expect(
      admissionHistoryDetails(
        "review_saved",
        JSON.stringify({
          identityReference: "a".repeat(1000),
          privateField: "no se muestra",
        }),
      )[0],
    ).toHaveLength("Cotejo de identidad: ".length + 300);
    expect(
      admissionHistoryDetails(
        "unknown",
        JSON.stringify({ identityReference: "No debe mostrarse" }),
      ),
    ).toEqual([]);
  });
});
