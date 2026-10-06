import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-server", () => ({ getServerSession: session }));

import ProfessionalLayout from "@/app/pro/layout";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";

beforeEach(() => session.mockReset());

describe("presentación del CRM ligada a la cuenta", () => {
  it("conserva el acceso público sin cambiar los guards de las páginas", async () => {
    session.mockResolvedValue(null);
    const access = <p>Entrada profesional</p>;
    expect(await ProfessionalLayout({ children: access })).toBe(access);
  });

  it("no presenta fichas, notas ni bandeja antes de verificar al dueño", async () => {
    session.mockResolvedValue({ user: { id: "fictional-professional-a" } });
    const view = await ProfessionalLayout({
      children: (
        <>
          <p>Ficha privada ficticia</p>
          <textarea defaultValue="Nota clínica ficticia" />
          <p>Bandeja ficticia privada</p>
        </>
      ),
    });
    const html = renderToStaticMarkup(view);
    expect(html).toContain("Preparando tu consulta");
    expect(html).not.toContain("Ficha privada ficticia");
    expect(html).not.toContain("Nota clínica ficticia");
    expect(html).not.toContain("Bandeja ficticia privada");
    expect(html).not.toContain("fictional-professional-a");
  });

  it("cambiar de cuenta monta un límite nuevo, con retorno a la consulta propia", async () => {
    for (const owner of ["fictional-a", "fictional-b"]) {
      session.mockResolvedValue({ user: { id: owner } });
      const view = await ProfessionalLayout({ children: <p>Consulta</p> });
      expect(isValidElement(view)).toBe(true);
      if (!isValidElement<{ ownerId: string; audience: string }>(view))
        throw new Error("Falta el límite de cuenta");
      expect(view.type).toBe(PatientSessionBoundary);
      expect(view.key).toBe(owner);
      expect(view.props).toMatchObject({
        ownerId: owner,
        audience: "professional",
      });
    }
  });
});
