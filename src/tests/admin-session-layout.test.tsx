import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-server", () => ({ getServerSession: session }));

import AdminLayout, { dynamic, metadata } from "@/app/admin/layout";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";

beforeEach(() => session.mockReset());

describe("presentación administrativa ligada a la cuenta", () => {
  it("conserva el acceso anónimo y los permisos de cada página", async () => {
    session.mockResolvedValue(null);
    const access = <p>Entrada administrativa ficticia</p>;
    expect(await AdminLayout({ children: access })).toBe(access);
    expect(dynamic).toBe("force-dynamic");
    expect(metadata?.robots).toEqual({ index: false, follow: false });
  });

  it("no envía al HTML credenciales o lista de espera antes de verificar la cuenta", async () => {
    session.mockResolvedValue({ user: { id: "fictional-admin-a" } });
    const view = await AdminLayout({
      children: (
        <>
          <p>Identidad privada ficticia</p>
          <p>Contacto privado ficticio de la lista de espera</p>
          <textarea defaultValue="Nota de admisión ficticia" />
        </>
      ),
    });
    const html = renderToStaticMarkup(view);
    expect(html).toContain("Preparando tu administración");
    expect(html).not.toContain("Identidad privada ficticia");
    expect(html).not.toContain("Contacto privado ficticio");
    expect(html).not.toContain("Nota de admisión ficticia");
    expect(html).not.toContain("fictional-admin-a");
  });

  it("usa una instancia nueva por dueño sin conceder un rol administrativo", async () => {
    for (const owner of ["fictional-admin-a", "fictional-other-account-b"]) {
      session.mockResolvedValue({ user: { id: owner } });
      const view = await AdminLayout({
        children: <p>Resultado de la página</p>,
      });
      if (!isValidElement<{ ownerId: string; audience: string }>(view))
        throw new Error("Falta el límite de cuenta");
      expect(view.type).toBe(PatientSessionBoundary);
      expect(view.key).toBe(owner);
      expect(view.props).toMatchObject({
        ownerId: owner,
        audience: "administration",
      });
    }
  });
});
