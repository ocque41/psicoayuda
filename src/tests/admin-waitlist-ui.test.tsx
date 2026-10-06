import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminNavigation,
  admissionNavigation,
  paolaPreviewNavigation,
} from "@/components/admin/navigation";
import { AdminWaitlistBoard } from "@/components/admin/waitlist/board";
import { WaitlistDetailDialog } from "@/components/admin/waitlist/detail-dialog";
import {
  receiveWaitlistStatus,
  recoverWaitlistStatus,
  statusDraftFromRemote,
} from "@/components/admin/waitlist/status-draft";
import {
  waitlistDate,
  waitlistHref,
} from "@/components/admin/waitlist/view-model";
import type {
  AdminWaitlistData,
  GeneralWaitlistDetail,
  HelpWaitlistDetail,
  WaitlistListItem,
} from "@/lib/admin-waitlist/types";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  data: vi.fn(),
  session: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/admin-waitlist/access", () => ({
  requireWaitlistAdmin: mocks.actor,
}));
vi.mock("@/lib/admin-waitlist/queries", () => ({
  readAdminWaitlistData: mocks.data,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/app/admin/lista-de-espera/actions", () => ({
  updateGeneralWaitlistStatus: mocks.update,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/auth-panel", () => ({
  AuthPanel: ({ callbackURL }: { callbackURL: string }) => (
    <p data-login={callbackURL}>Acceso privado</p>
  ),
}));

import AdminWaitlistPage from "@/app/admin/lista-de-espera/page";

const timestamp = "2026-10-06T10:00:00.000Z";
function item(index = 0): WaitlistListItem {
  return {
    id: `ficticio-${index}-ref-2026`,
    tab: "general",
    name: null,
    status: "waiting",
    statusLabel: "En espera",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeAssignments: 0,
    offeredAssignments: 0,
    requiresReview: false,
  };
}
function generalDetail(): GeneralWaitlistDetail {
  return {
    ...item(),
    tab: "general",
    email: "privado-general@example.test",
    title: "Motivo privado ficticio",
    description:
      "Relato privado ficticio que sólo debe aparecer en el detalle.",
    source: "ayuda",
    sourceLabel: "Página de pedir ayuda",
  };
}
function helpDetail(): HelpWaitlistDetail {
  return {
    ...item(),
    tab: "terremoto",
    name: "Alias ficticio",
    email: "privado-ayuda@example.test",
    country: "Venezuela",
    state: "Región ficticia",
    city: "Ciudad ficticia",
    language: "es",
    languageLabel: "Español",
    needCategory: "apoyo_emocional",
    needCategoryLabel: "Apoyo emocional",
    urgency: "baja",
    urgencyLabel: "Habitual",
    consentContact: true,
    assignments: [
      {
        id: "asignacion-ficticia",
        professionalId: "pro-ficticio",
        professionalName: "Profesional ficticia",
        status: "offered",
        statusLabel: "Invitación pendiente",
      },
    ],
    assignmentsHasMore: false,
  };
}
function fixture(): AdminWaitlistData {
  return {
    items: [item()],
    page: 1,
    pages: 2,
    total: 39,
    counts: { all: 39, waiting: 38, closed: 1 },
    sourceCounts: { general: 39, terremoto: 5 },
    tab: "general",
    q: "",
    queryWarning: null,
    status: "all",
    selected: null,
    failed: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    userId: "admin-ficticio",
    email: "admin@example.test",
    sessionId: "sesion-ficticia",
  });
  mocks.data.mockResolvedValue(fixture());
  mocks.session.mockResolvedValue(null);
});

describe("lista privada para Superadmin", () => {
  it.each([
    false,
    true,
  ])("deniega antes de leer registros con sesión=%s", async (authenticated) => {
    mocks.actor.mockResolvedValue(null);
    mocks.session.mockResolvedValue(
      authenticated ? { user: { email: "reviewer@example.test" } } : null,
    );
    const html = renderToStaticMarkup(
      await AdminWaitlistPage({
        searchParams: Promise.resolve({ persona: "ficticio-0-ref-2026" }),
      }),
    );
    expect(mocks.data).not.toHaveBeenCalled();
    expect(html).not.toContain("Registros de la página actual");
    expect(html).not.toContain("Secciones de administración");
    expect(html).toContain(
      authenticated
        ? "Esta cuenta no tiene acceso"
        : 'data-login="/admin/lista-de-espera"',
    );
  });

  it.each([
    "superadmin-uno",
    "superadmin-dos",
  ])("%s abre la sección con su identidad real", async (userId) => {
    const actor = {
      userId,
      email: `${userId}@example.test`,
      sessionId: `${userId}-sesion`,
    };
    mocks.actor.mockResolvedValue(actor);
    const query = { fuente: "general", estado: "all" };
    const html = renderToStaticMarkup(
      await AdminWaitlistPage({ searchParams: Promise.resolve(query) }),
    );
    expect(mocks.data).toHaveBeenCalledWith(actor, query);
    expect(html).toContain('id="lista-espera"');
    expect(html).toContain("Superadmin");
  });

  it("la navegación limitada de Paola no recibe la lista general", () => {
    expect(
      adminNavigation.find((entry) => entry.id === "lista-espera")?.href,
    ).toBe("/admin/lista-de-espera");
    expect(
      admissionNavigation.some((entry) => entry.id === "lista-espera"),
    ).toBe(false);
    expect(
      paolaPreviewNavigation.some((entry) => entry.id === "lista-espera"),
    ).toBe(false);
  });
});

describe("ventanas independientes y detalle de espera", () => {
  it("muestra referencias compactas sin correos ni relatos del apoyo general", () => {
    const data = fixture();
    data.items = [{ ...item(), name: "Relato que no es un nombre" }];
    const html = renderToStaticMarkup(<AdminWaitlistBoard data={data} />);
    expect(html).toContain("Referencia: ref-2026");
    expect(html).toContain("Registro de apoyo general");
    expect(html).not.toContain("Relato que no es un nombre");
    expect(html).not.toContain("@example.test");
    expect(html).toContain('placeholder="Referencia"');
    expect(html).toContain('pattern="[^@]*"');
    expect(html).toContain("Hasta 25 registros por página");
  });

  it("separa las listas incluso ante una selección de otra fuente", () => {
    const data = fixture();
    data.items.push(helpDetail());
    data.selected = helpDetail();
    const html = renderToStaticMarkup(<AdminWaitlistBoard data={data} />);
    expect(html).not.toContain("Alias ficticio");
    expect(html).not.toContain("privado-ayuda@example.test");
    expect(html).not.toContain("Profesional ficticia");
    expect(html).toContain("39 registros");
    expect(html).toContain("5 solicitudes");
  });

  it("escapa el motivo y permite editar sólo el estado mediante CAS en el detalle general", () => {
    const detail = generalDetail();
    detail.description = '<script>alert("ficticio")</script>';
    const html = renderToStaticMarkup(
      <WaitlistDetailDialog data={fixture()} detail={detail} />,
    );
    expect(html).toContain("privado-general@example.test");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    for (const name of [
      "entryId",
      "expectedStatus",
      "expectedUpdatedAt",
      "status",
    ])
      expect(html).toContain(`name="${name}"`);
    expect(html).not.toContain('name="description"');
    expect(html).not.toContain('name="email"');
    expect(html).toContain("Guardar seguimiento");
  });

  it("Ayuda Terremoto conserva asignaciones y ofrece gestión existente sin formulario de cambios", () => {
    const detail = helpDetail();
    detail.assignmentsHasMore = true;
    const html = renderToStaticMarkup(
      <WaitlistDetailDialog
        data={{ ...fixture(), tab: "terremoto" }}
        detail={detail}
      />,
    );
    expect(html).toContain("Ayuda Terremoto · $0");
    expect(html).toContain("Profesional ficticia");
    expect(html).toContain("Invitación pendiente");
    expect(html).toContain('href="/admin/solicitudes"');
    expect(html).toContain("primeras 50 asignaciones");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Guardar seguimiento");
    expect(html).toContain("Asignaciones activas</dt><dd>0</dd>");
  });

  it("el fallo conserva la vía de reintento y no se representa como cero registros", () => {
    const html = renderToStaticMarkup(
      <AdminWaitlistBoard
        data={{ ...fixture(), failed: true, selected: generalDetail() }}
      />,
    );
    expect(html).toContain("No pudimos abrir la lista");
    expect(html).toContain("Volver a intentar");
    expect(html).not.toContain("No hay registros en este seguimiento");
    expect(html).not.toContain("39 registros");
    expect(html).not.toContain("privado-general@example.test");
  });

  it("muestra la advertencia de búsqueda descartada sin reflejar un correo en la URL", () => {
    const html = renderToStaticMarkup(
      <AdminWaitlistBoard
        data={{
          ...fixture(),
          queryWarning: "Usa la referencia de la solicitud.",
        }}
      />,
    );
    expect(html).toContain("Usa la referencia de la solicitud.");
    expect(html).toContain('role="alert"');
    const href = waitlistHref({ ...fixture(), q: "privado@example.test" });
    expect(href).not.toContain("privado");
    expect(new URL(href, "https://example.test").searchParams.has("q")).toBe(
      false,
    );
  });
});

describe("URL opaca y recuperación concurrente del editor", () => {
  it("codifica el identificador y conserva fuente, seguimiento y página al volver", () => {
    const data = { ...fixture(), page: 2, q: "ref-2026", status: "waiting" };
    const url = new URL(
      waitlistHref(data, { person: "opaco/id?otro=1" }),
      "https://example.test",
    );
    expect(url.pathname).toBe("/admin/lista-de-espera");
    expect(url.searchParams.get("persona")).toBe("opaco/id?otro=1");
    expect(url.searchParams.get("otro")).toBeNull();
    expect(url.searchParams.get("pagina")).toBe("2");
    const changed = new URL(
      waitlistHref(data, { tab: "terremoto" }),
      "https://example.test",
    );
    expect(changed.searchParams.get("estado")).toBe("waiting");
    expect(changed.searchParams.has("q")).toBe(false);
    expect(changed.searchParams.has("persona")).toBe(false);
  });

  it("una revisión recibida mientras hay cambios conserva CAS y permite releerla explícitamente tras el conflicto", () => {
    const original = { status: "waiting", updatedAt: timestamp };
    const proposed = {
      ...statusDraftFromRemote(original),
      selected: "contacted",
    };
    const otherWindow = {
      status: "closed",
      updatedAt: "2026-10-06T10:01:00.000Z",
    };
    const held = receiveWaitlistStatus(proposed, otherWindow);
    expect(held).toEqual(proposed);
    expect(held.expected).toEqual(original);
    // No se requiere un nuevo updatedAt: la revisión ya había llegado mientras estaba dirty.
    const recovered = recoverWaitlistStatus(otherWindow);
    expect(recovered.selected).toBe("closed");
    expect(recovered.expected).toEqual(otherWindow);
    expect(receiveWaitlistStatus(recovered, otherWindow)).toEqual(recovered);
  });

  it("una actualización de lectura sin cambios locales puede reflejarse sin inventar fechas", () => {
    const original = statusDraftFromRemote({
      status: "waiting",
      updatedAt: timestamp,
    });
    const remote = { status: "matched", updatedAt: "2026-10-06T10:02:00.000Z" };
    expect(receiveWaitlistStatus(original, remote)).toEqual(
      statusDraftFromRemote(remote),
    );
    expect(waitlistDate("fecha inválida")).toBe("Fecha no registrada");
  });
});
