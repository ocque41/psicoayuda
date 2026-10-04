import { like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
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
import {
  adminRequestPage,
  normalizeAdminSearch,
} from "@/components/admin/search-params";
import { db } from "@/db";
import { contactMessages, helpRequests } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  administrator: vi.fn(),
  session: vi.fn(),
  support: vi.fn(),
  reviewer: vi.fn(),
  readSupport: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({
  requireAdmin: mocks.administrator,
  getAdminEmails: () => ["admin-navigation@example.test"],
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/practice/support-access", () => ({
  requireSupportStaff: mocks.support,
}));
vi.mock("@/lib/practice/staff", () => ({
  requirePracticeStaff: mocks.reviewer,
}));
vi.mock("@/lib/practice/support-queries", () => ({
  readStaffSupportList: mocks.readSupport,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/components/auth-panel", () => ({
  AuthPanel: ({ callbackURL }: { callbackURL: string }) => (
    <div data-login={callbackURL}>Acceso privado</div>
  ),
}));
vi.mock("@/components/metrics-dashboard", () => ({
  MetricsDashboard: () => <div data-metrics="true">Actividad agregada</div>,
}));
vi.mock("@/app/actions", () => ({
  adminAnonymizeHelpRequest: vi.fn(),
  adminApproveIncompleteRegistration: vi.fn(),
  adminAssignRequest: vi.fn(),
  adminSetCredentialConfirmed: vi.fn(),
  adminSetProfessionalKind: vi.fn(),
  adminSetProfessionalVisibility: vi.fn(),
  adminUpdateAllianceStatus: vi.fn(),
  adminUpdateHelpRequestStatus: vi.fn(),
  adminUpdateProfessionalStatus: vi.fn(),
}));
vi.mock("@/app/actions-account", () => ({ adminDeleteAccount: vi.fn() }));
vi.mock("@/app/actions-contact", () => ({
  adminUpdateContactMessageStatus: vi.fn(),
}));
vi.mock("@/app/actions-partners", () => ({
  adminDeletePartner: vi.fn(),
  adminSavePartner: vi.fn(),
}));
vi.mock("@/app/admin/operaciones/actions", () => ({
  reviewProfessional: vi.fn(),
  reviewScope: vi.fn(),
  revokeScope: vi.fn(),
}));

import { AdminDashboard } from "@/app/admin/dashboard";
import OperationsPage from "@/app/admin/operaciones/page";
import AdminPage from "@/app/admin/page";

const prefix = "test-admin-navigation-";
const createdAt = "2026-10-01T12:00:00.000Z";
async function cleanup() {
  await db
    .delete(contactMessages)
    .where(like(contactMessages.id, `${prefix}%`));
  await db.delete(helpRequests).where(like(helpRequests.id, `${prefix}%`));
}
beforeAll(async () => {
  await cleanup();
  await db.insert(helpRequests).values(
    Array.from({ length: 27 }, (_, index) => ({
      id: `${prefix}request-${index}`,
      email: `request-${index}@example.test`,
      seekerName: `Solicitud ficticia ${index}`,
      needCategory: "apoyo_emocional",
      urgency: "baja",
      status: "new",
      createdAt,
      updatedAt: createdAt,
    })),
  );
  await db.insert(contactMessages).values({
    id: `${prefix}contact`,
    source: "public_contact",
    category: "question",
    email: "contact-navigation@example.test",
    message: "Mensaje ficticio exclusivo del buzón.",
    createdAt,
    updatedAt: createdAt,
  });
});
beforeEach(() => {
  mocks.administrator.mockResolvedValue({
    email: "admin-navigation@example.test",
  });
  mocks.session.mockResolvedValue(null);
  mocks.support.mockResolvedValue(null);
  mocks.reviewer.mockResolvedValue(null);
  mocks.readSupport.mockResolvedValue({
    items: [],
    counts: { all: 0, new: 0, in_review: 0, resolved: 0 },
    status: "new",
    total: 0,
    page: 1,
    pageCount: 1,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
afterAll(cleanup);

describe("administración por vistas privadas", () => {
  it.each([
    false,
    true,
  ])("deniega el acceso sin permiso actual antes de consultar datos (sesión=%s)", async (hasSession) => {
    mocks.administrator.mockResolvedValue(null);
    mocks.session.mockResolvedValue(
      hasSession ? { user: { email: "sin-permiso@example.test" } } : null,
    );
    const select = vi.spyOn(db, "select");
    const professionals = vi.spyOn(db.query.professionals, "findMany");
    const html = renderToStaticMarkup(
      await AdminDashboard({ view: "solicitudes", query: {} }),
    );
    expect(select).not.toHaveBeenCalled();
    expect(professionals).not.toHaveBeenCalled();
    expect(html).not.toContain("Solicitud ficticia");
    expect(html).not.toContain("Secciones de administración");
    expect(html).toContain(
      hasSession ? "no tiene acceso" : 'data-login="/admin/solicitudes"',
    );
  });

  it.each([
    "resumen",
    "metricas",
  ] as const)("%s consulta solo tres agregados pequeños y no otras listas privadas", async (view) => {
    const select = vi.spyOn(db, "select");
    const professionals = vi.spyOn(db.query.professionals, "findMany");
    const html = renderToStaticMarkup(
      await AdminDashboard({ view, query: {} }),
    );
    expect(select).toHaveBeenCalledTimes(3);
    expect(professionals).not.toHaveBeenCalled();
    expect(html).not.toContain("Solicitud ficticia");
    expect(html).not.toContain("Mensaje ficticio exclusivo");
    expect(html).not.toContain('name="contacto_estado"');
    expect(html).not.toContain('name="estado"');
    expect(html.includes('data-metrics="true"')).toBe(view === "metricas");
    expect(html).toContain('href="/admin/operaciones"');
    expect(html).toContain('href="/admin/fpv"');
  });

  it("las solicitudes muestran como máximo25 filas y la página siguiente mantiene los filtros", async () => {
    const html = renderToStaticMarkup(
      await AdminDashboard({
        view: "solicitudes",
        query: {
          estado: "new",
          urgencia: "baja",
          q: "Solicitud ficticia",
          page: "1",
        },
      }),
    );
    expect(html.match(/class="card admin-request-card"/g) || []).toHaveLength(
      25,
    );
    expect(html).toContain('action="/admin/solicitudes"');
    expect(html).toContain(
      "/admin/solicitudes?estado=new&amp;urgencia=baja&amp;q=Solicitud+ficticia&amp;page=2",
    );
    expect(html).not.toContain("Mensaje ficticio exclusivo");
    expect(html).not.toContain('data-metrics="true"');
    const second = renderToStaticMarkup(
      await AdminDashboard({
        view: "solicitudes",
        query: {
          estado: "new",
          urgencia: "baja",
          q: "Solicitud ficticia",
          page: "2",
        },
      }),
    );
    expect(second.match(/class="card admin-request-card"/g) || []).toHaveLength(
      2,
    );
    expect(second).toContain(
      "/admin/solicitudes?estado=new&amp;urgencia=baja&amp;q=Solicitud+ficticia",
    );
  });

  it("los parámetros repetidos y las páginas enormes no producen un error de lectura", async () => {
    const html = renderToStaticMarkup(
      await AdminDashboard({
        view: "solicitudes",
        query: {
          q: ["Solicitud ficticia", "otra"],
          page: "9".repeat(100),
        },
      }),
    );
    expect(html).toContain('value="Solicitud ficticia"');
    expect(html.match(/class="card admin-request-card"/g) || []).toHaveLength(
      25,
    );
    expect(adminRequestPage("10000")).toBe(10000);
    expect(adminRequestPage("10001")).toBe(1);
    expect(normalizeAdminSearch({ q: ["primero", "segundo"] }).q).toBe(
      "primero",
    );
  });

  it("el buzón mantiene sus filtros en su propia ruta y las otras vistas no se montan", async () => {
    const html = renderToStaticMarkup(
      await AdminDashboard({
        view: "contactos",
        query: { contacto_estado: "new" },
      }),
    );
    expect(html).toContain('action="/admin/contactos"');
    expect(html).toContain('href="/admin/contactos"');
    expect(html).toContain("Mensaje ficticio exclusivo del buzón.");
    expect(html).not.toContain("Solicitud ficticia");
    expect(html).toContain('id="contactos"');
  });

  it("los retornos de cuenta siguen mostrando el resultado en Cuentas", async () => {
    const page = await AdminPage({
      searchParams: Promise.resolve({ cuenta: "borrada" }),
    });
    expect(page.props.view).toBe("cuentas");
    const html = renderToStaticMarkup(await AdminDashboard(page.props));
    expect(html).toContain('id="cuentas"');
    expect(html).toContain(
      "La cuenta y sus sesiones se borraron correctamente.",
    );
    expect(html).toContain("Registros incompletos");
    expect(html).not.toContain("Solicitud ficticia");
  });
});

describe("operaciones conserva los accesos separados", () => {
  it("un equipo de soporte no consulta credenciales ni ve navegación de administración general", async () => {
    mocks.administrator.mockResolvedValue(null);
    mocks.support.mockResolvedValue({ email: "soporte@example.test" });
    const select = vi.spyOn(db, "select");
    const html = renderToStaticMarkup(
      await OperationsPage({
        searchParams: Promise.resolve({ vista: "credenciales" }),
      }),
    );
    expect(select).not.toHaveBeenCalled();
    expect(mocks.readSupport).toHaveBeenCalledOnce();
    expect(html).not.toContain('href="/admin/metricas"');
    expect(html).not.toContain("Credenciales y seguimiento");
    expect(html).not.toContain("Registrar revisión");
  });

  it("un revisor conserva su entrada y no obtiene datos de soporte", async () => {
    mocks.administrator.mockResolvedValue(null);
    mocks.reviewer.mockResolvedValue({ email: "revisor@example.test" });
    const select = vi.spyOn(db, "select");
    const html = renderToStaticMarkup(
      await OperationsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(select).toHaveBeenCalledTimes(1);
    expect(mocks.readSupport).not.toHaveBeenCalled();
    expect(html).toContain("Credenciales y seguimiento");
    expect(html).not.toContain("Registrar revisión");
    expect(html).not.toContain('href="/admin/metricas"');
  });

  it("el apartado Ámbitos carga sus referencias sin montar revisión de perfiles o soporte", async () => {
    mocks.reviewer.mockResolvedValue({ email: "revisor@example.test" });
    const html = renderToStaticMarkup(
      await OperationsPage({
        searchParams: Promise.resolve({ vista: "ambitos" }),
      }),
    );
    expect(mocks.readSupport).not.toHaveBeenCalled();
    expect(html).toContain("Registrar revisión");
    expect(html).not.toContain("Credenciales y seguimiento");
  });

  it("sin permisos de equipo redirige antes de cualquier consulta", async () => {
    const select = vi.spyOn(db, "select");
    await expect(
      OperationsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/pro");
    expect(select).not.toHaveBeenCalled();
    expect(mocks.readSupport).not.toHaveBeenCalled();
  });
});
