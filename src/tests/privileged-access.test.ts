import { eq, like } from "drizzle-orm";
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
import { professionals, user } from "@/db/schema";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  replySupport,
  reviewProfessional,
} from "@/app/admin/operaciones/actions";
import { GET as adminStatus } from "@/app/api/admin/status/route";
import { GET as credentialDocument } from "@/app/api/practice/credential/[professionalId]/route";
import { isAdminEmail, requireAdmin } from "@/lib/admin";
import { requirePracticeStaff } from "@/lib/practice/staff";

const P = "test-privileged-access";
const emails = {
  admin: `${P}-admin@example.test`,
  support: `${P}-support@example.test`,
  reviewer: `${P}-reviewer@example.test`,
  regular: `${P}-regular@example.test`,
};
function session(role: keyof typeof emails, declaredEmail = emails[role]) {
  mocks.session.mockResolvedValue({
    user: { id: `${P}-${role}`, email: declaredEmail, emailVerified: true },
  });
}
async function cleanup() {
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}

describe("permisos internos ligados al correo verificado en BD", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values(
      Object.entries(emails).map(([role, email]) => ({
        id: `${P}-${role}`,
        name: "Cuenta ficticia",
        email,
        emailVerified: true,
      })),
    );
    const timestamp = new Date().toISOString();
    await db.insert(professionals).values({
      id: `${P}-pro`,
      userId: `${P}-regular`,
      email: emails.regular,
      fullName: "Profesional ficticio",
      status: "pending_verification",
      registrationProofDoc: "data:application/pdf;base64,ZmFrZQ==",
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  beforeEach(async () => {
    vi.stubEnv("ADMIN_EMAILS", emails.admin);
    vi.stubEnv("SUPPORT_EMAILS", emails.support);
    vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", emails.reviewer);
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(like(user.id, `${P}%`));
    mocks.session.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(cleanup);

  it("un registro con correo interno sin verificar no recibe permisos, documentos ni capacidad de aprobación", async () => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, `${P}-admin`));
    session("admin"); // Aunque una sesión antigua diga verified, manda el estado actual.
    expect(isAdminEmail(emails.admin)).toBe(true);
    expect(await requireAdmin()).toBeNull();
    expect(await requirePracticeStaff("support")).toBeNull();
    expect(await requirePracticeStaff("credentials")).toBeNull();
    expect(await (await adminStatus()).json()).toEqual({
      isAdmin: false,
      isSuperAdmin: false,
      isAdmissionReviewer: false,
    });
    expect(
      (
        await credentialDocument(
          new Request("https://nido.example/credential"),
          {
            params: Promise.resolve({ professionalId: `${P}-pro` }),
          },
        )
      ).status,
    ).toBe(403);
    const form = new FormData();
    form.set("professionalId", `${P}-pro`);
    form.set("status", "approved");
    form.set("reference", "Cotejo ficticio");
    form.set("checked", "on");
    expect(await reviewProfessional(null, form)).toMatchObject({ ok: false });
    expect(await replySupport(null, form)).toMatchObject({ ok: false });
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, `${P}-pro`),
        columns: { status: true },
      }),
    ).toEqual({ status: "pending_verification" });
  });

  it.each([
    "support",
    "reviewer",
  ] as const)("deniega el correo permitido de %s mientras está sin verificar", async (role) => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, `${P}-${role}`));
    session(role);
    expect(await requirePracticeStaff("support")).toBeNull();
    expect(await requirePracticeStaff("credentials")).toBeNull();
  });

  it("soporte verificado conserva su permiso y no obtiene revisión clínica", async () => {
    session("support");
    expect(await requirePracticeStaff("support")).toEqual({
      email: emails.support,
    });
    expect(await requirePracticeStaff("credentials")).toBeNull();
    expect(await requireAdmin()).toBeNull();
  });
  it("el revisor verificado no obtiene acceso al buzón de soporte", async () => {
    session("reviewer");
    expect(await requirePracticeStaff("credentials")).toEqual({
      email: emails.reviewer,
    });
    expect(await requirePracticeStaff("support")).toBeNull();
    expect(
      (
        await credentialDocument(
          new Request("https://nido.example/credential"),
          {
            params: Promise.resolve({ professionalId: `${P}-pro` }),
          },
        )
      ).status,
    ).toBe(200);
  });
  it("la cuenta administradora verificada conserva ambos permisos", async () => {
    session("admin");
    expect(await requireAdmin()).toMatchObject({ email: emails.admin });
    expect(await requirePracticeStaff("support")).toEqual({
      email: emails.admin,
    });
    expect(await requirePracticeStaff("credentials")).toEqual({
      email: emails.admin,
    });
  });
  it("un correo permitido declarado en sesión no reemplaza el correo vigente de la cuenta", async () => {
    session("regular", emails.admin);
    expect(await requireAdmin()).toBeNull();
    expect(await requirePracticeStaff("support")).toBeNull();
    expect(await requirePracticeStaff("credentials")).toBeNull();
  });
  it("sin sesión o sin usuario vigente falla en cerrado", async () => {
    expect(await requireAdmin()).toBeNull();
    mocks.session.mockResolvedValue({
      user: { id: `${P}-missing`, email: emails.admin, emailVerified: true },
    });
    expect(await requireAdmin()).toBeNull();
    expect(await requirePracticeStaff("support")).toBeNull();
  });
});
