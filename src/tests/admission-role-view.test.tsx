import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  admissionNavigation,
  paolaPreviewNavigation,
} from "@/components/admin/navigation";
import {
  admissionHref,
  admissionViewHref,
} from "@/components/admission/view-model";
import {
  type AdmissionBoardData,
  defaultAdmissionStages,
} from "@/lib/admission/types";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  board: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/admission/access", () => ({
  requireAdmissionReviewer: mocks.actor,
}));
vi.mock("@/lib/admission/queries", () => ({ readAdmissionBoard: mocks.board }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/app/admin/admision/actions", () => ({
  configure: vi.fn(),
  moveStage: vi.fn(),
  publish: vi.fn(),
  saveReview: vi.fn(),
  saveScope: vi.fn(),
}));
vi.mock("@/components/auth-panel", () => ({
  AuthPanel: ({ callbackURL }: { callbackURL: string }) => (
    <p data-login={callbackURL}>Acceso privado</p>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

import AdmissionPage from "@/app/admin/admision/page";

function board(): AdmissionBoardData {
  return {
    stages: defaultAdmissionStages,
    configRevision: 1,
    candidates: [],
    selected: null,
    canConfigure: true,
    limitedReviewer: false,
    page: 2,
    hasMore: true,
    query: "Profesional ficticio",
    stageFilter: "identity",
    stageCounts: { identity: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.board.mockResolvedValue(board());
  mocks.session.mockResolvedValue(null);
});

describe("panel de Paola y cuenta real del administrador", () => {
  it.each([
    "admin-uno",
    "admin-dos",
  ])("%s tiene entrada al panel y conserva su identidad en la vista de Paola", async (userId) => {
    const actor = {
      userId,
      sessionId: `${userId}-sesion`,
      email: `${userId}@example.test`,
      isAdmin: true,
    };
    mocks.actor.mockResolvedValue(actor);
    const html = renderToStaticMarkup(
      await AdmissionPage({
        searchParams: Promise.resolve({ vista: "paola" }),
      }),
    );
    expect(mocks.board).toHaveBeenCalledWith(actor, { vista: "paola" });
    expect(actor.isAdmin).toBe(true);
    expect(html).toContain("Vista de Paola");
    expect(html).toContain("Sigues usando tu cuenta de Superadmin");
    expect(html).toContain(actor.email);
    expect(html).toContain("vista del rol de admisión");
    expect(html).toContain('href="/admin/crm"');
    expect(html).not.toContain('href="/pro/consulta"');
    expect(html).not.toContain('href="/admin/export"');
    expect(html).not.toContain('href="/admin/cuentas"');
    expect(html).not.toContain('href="/admin/contactos"');
    expect(html).toContain("Ajustar etapas");
  });

  it("la vista administradora ofrece Panel de Paola y el menú general", async () => {
    mocks.actor.mockResolvedValue({
      userId: "admin-ficticio",
      email: "admin@example.test",
      isAdmin: true,
    });
    const html = renderToStaticMarkup(
      await AdmissionPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Panel de Paola");
    expect(html).toContain('href="/admin/cuentas"');
    expect(html).toContain('href="/admin/export"');
    expect(html).toContain("Vista de Paola");
  });

  it.each([
    {},
    { vista: "administradora" },
    { vista: "paola" },
  ])("el rol de admisión conserva su consulta propia y el menú limitado con %j", async (query) => {
    const actor = {
      userId: "reviewer-ficticio",
      email: "reviewer@example.test",
      isAdmin: false,
    };
    mocks.actor.mockResolvedValue(actor);
    mocks.board.mockResolvedValue({ ...board(), limitedReviewer: true });
    const html = renderToStaticMarkup(
      await AdmissionPage({ searchParams: Promise.resolve(query) }),
    );
    expect(mocks.board).toHaveBeenCalledWith(actor, query);
    expect(html).toContain('href="/pro/consulta"');
    expect(html).toContain("Administración de psicólogos");
    expect(html).not.toContain("Sigues usando tu cuenta de Superadmin");
    expect(html).not.toContain('href="/admin/crm"');
    expect(html).not.toContain('href="/admin/export"');
    expect(html).not.toContain('href="/admin/cuentas"');
    expect(html).not.toContain("Vista de Superadmin");
  });

  it("una cuenta sin autorización no carga candidatos aunque pida la vista de Paola", async () => {
    mocks.actor.mockResolvedValue(null);
    mocks.session.mockResolvedValue({
      user: { email: "sin-acceso@example.test" },
    });
    const html = renderToStaticMarkup(
      await AdmissionPage({
        searchParams: Promise.resolve({ vista: "paola" }),
      }),
    );
    expect(mocks.board).not.toHaveBeenCalled();
    expect(html).toContain("Esta cuenta no tiene acceso a admisión");
    expect(html).not.toContain("Ajustar etapas");
    expect(html).not.toContain("Secciones de administración");
  });

  it("conserva el destino limitado al entrar desde un enlace directo sin aceptar retornos externos", async () => {
    mocks.actor.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await AdmissionPage({
        searchParams: Promise.resolve({
          vista: "paola",
          callbackURL: "https://example.test/externo",
        }),
      }),
    );
    expect(html).toContain('data-login="/admin/admision?vista=paola"');
    expect(html).not.toContain("https://example.test/externo");
    expect(mocks.board).not.toHaveBeenCalled();
  });

  it("la configuración real del servidor controla si aparecen los ajustes", async () => {
    mocks.actor.mockResolvedValue({
      userId: "admin-ficticio",
      email: "admin@example.test",
      isAdmin: true,
    });
    mocks.board.mockResolvedValue({ ...board(), canConfigure: false });
    const html = renderToStaticMarkup(
      await AdmissionPage({
        searchParams: Promise.resolve({ vista: "paola" }),
      }),
    );
    expect(html).not.toContain("Ajustar etapas");
    expect(html).toContain("Vista de Paola");
  });

  it("el fallo de lectura mantiene la vista y no ofrece un tablero vacío editable", async () => {
    mocks.actor.mockResolvedValue({
      userId: "admin-ficticio",
      email: "admin@example.test",
      isAdmin: true,
    });
    mocks.board.mockRejectedValue(new Error("fallo ficticio"));
    const html = renderToStaticMarkup(
      await AdmissionPage({
        searchParams: Promise.resolve({ vista: ["paola", "otra"] }),
      }),
    );
    expect(html).toContain("El tablero no está disponible");
    expect(html).toContain('href="/admin/admision?vista=paola"');
    expect(html).not.toContain("Ajustar etapas");
  });
});

describe("navegación de la interfaz de admisión", () => {
  it("ofrece admisión, invitaciones y consulta propia en el rol limitado", () => {
    expect(admissionNavigation.map((item) => item.id)).toEqual([
      "admision",
      "invitaciones",
      "mi-consulta",
    ]);
    expect(paolaPreviewNavigation.map((item) => item.id)).toEqual([
      "admision",
      "invitaciones",
      "mi-consulta",
    ]);
    expect(
      paolaPreviewNavigation.find((item) => item.id === "mi-consulta")?.href,
    ).toBe("/admin/crm");
  });

  it("selección, cierre, páginas e historial conservan vista sin interpolar consultas", () => {
    const data = {
      ...board(),
      query: "ficticio & vista=otra",
      viewMode: "paola" as const,
    };
    for (const options of [
      {},
      { candidate: "id/con?otro=1", historyPage: 3 },
      { page: 4 },
    ]) {
      const url = new URL(admissionHref(data, options), "https://example.test");
      expect(url.searchParams.get("vista")).toBe("paola");
      expect(url.searchParams.get("q")).toBe(data.query);
      expect(url.searchParams.get("etapa")).toBe("identity");
      expect(url.searchParams.get("otro")).toBeNull();
    }
    const regular = new URL(
      admissionViewHref(data, false),
      "https://example.test",
    );
    expect(regular.searchParams.get("vista")).toBeNull();
    expect(regular.searchParams.get("q")).toBe(data.query);
  });
});
