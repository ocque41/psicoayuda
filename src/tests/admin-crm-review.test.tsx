import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminNavigation } from "@/components/admin/navigation";
import { WorkspaceNav } from "@/components/workspace/nav";
import { db } from "@/db";
import {
  reviewHref,
  reviewProfessionalHref,
  reviewWindow,
  reviewWindows,
} from "@/lib/practice/review-navigation";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/components/auth-panel", () => ({
  AuthPanel: ({ callbackURL }: { callbackURL: string }) => (
    <div data-login={callbackURL}>Acceso privado</div>
  ),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useSearchParams: () => new URLSearchParams("ventana=pacientes"),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/components/admin/crm-review", () => ({
  CrmReview: ({ window }: { window: string }) => (
    <div data-window={window}>Revisión sin datos clínicos</div>
  ),
}));

import CrmReviewPage from "@/app/admin/crm/page";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("revisión del CRM reservada a administradores", () => {
  it("deniega acceso antes de leer cualquier lista privada", async () => {
    mocks.admin.mockResolvedValue(null);
    const select = vi.spyOn(db, "select");
    const patients = vi.spyOn(db.query.practicePatients, "findMany");
    mocks.session.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await CrmReviewPage({
        searchParams: Promise.resolve({ ventana: "pacientes" }),
      }),
    );
    expect(html).toContain('data-login="/admin/crm"');
    expect(html).not.toContain("Secciones de administración");
    expect(select).not.toHaveBeenCalled();
    expect(patients).not.toHaveBeenCalled();
  });
  it.each(
    reviewWindows,
  )("%s no consulta fichas ni altera permisos clínicos", async (window) => {
    mocks.admin.mockResolvedValue({ email: "admin-review@example.test" });
    const select = vi.spyOn(db, "select");
    const patients = vi.spyOn(db.query.practicePatients, "findMany");
    const html = renderToStaticMarkup(
      await CrmReviewPage({
        searchParams: Promise.resolve({ ventana: window, mes: "2026-10" }),
      }),
    );
    expect(html).toContain(`data-window="${window}"`);
    expect(html).toContain('href="/admin/consola"');
    expect(html).toContain('href="/admin/profesionales"');
    expect(select).not.toHaveBeenCalled();
    expect(patients).not.toHaveBeenCalled();
  });
  it("limita los destinos y conserva fuera del modo revisión el acceso normal", () => {
    expect(reviewWindow("https://example.test/pro")).toBe("agenda");
    expect(reviewWindow(["pacientes"])).toBe("agenda");
    expect(reviewProfessionalHref("/pro/pacientes")).toBe(
      reviewHref("pacientes"),
    );
    expect(reviewProfessionalHref("/pro/pacientes/private-id")).toBe(
      reviewHref("agenda"),
    );
    expect(
      adminNavigation.filter((item) => ["crm", "consola"].includes(item.id)),
    ).toHaveLength(2);
  });
  it("la revisión usa sus destinos propios y la consulta normal conserva los suyos", () => {
    const preview = renderToStaticMarkup(
      <WorkspaceNav audience="professional" adminReview />,
    );
    const normal = renderToStaticMarkup(
      <WorkspaceNav audience="professional" />,
    );
    expect(preview).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/admin\/crm\?ventana=pacientes"/,
    );
    expect(preview).not.toContain('href="/pro/');
    expect(normal).toContain('href="/pro/pacientes"');
    expect(normal).not.toContain('href="/admin/crm');
  });
});
