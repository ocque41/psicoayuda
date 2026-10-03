import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppFrame, frameArea } from "@/components/app-frame";
import { SiteNav } from "@/components/site-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<typeof import("next/navigation")>(
    "next/navigation",
  )),
  usePathname: () => navigation.pathname,
}));

function renderFrame(pathname: string) {
  navigation.pathname = pathname;
  return renderToStaticMarkup(
    <AppFrame
      publicHeader={
        <header data-public-header>
          <SiteNav />
        </header>
      }
      publicFooter={<footer data-public-footer>Enlaces del sitio</footer>}
      publicStructuredData={
        <script type="application/ld+json">{'{"publico":true}'}</script>
      }
    >
      <section>Contenido del área</section>
    </AppFrame>,
  );
}

describe("separación entre el sitio público y la consulta", () => {
  afterEach(() => {
    navigation.pathname = "/";
  });

  it("retira captación, pie público y JSON-LD de ambas áreas privadas desde el primer HTML", () => {
    for (const pathname of [
      "/pro/consulta",
      "/pro/pacientes/ficha-ficticia/cobros/recibo-ficticio",
      "/pro/onboarding",
      "/mi",
      "/mi/pagos/recibo-ficticio",
      "/c/conversacion-ficticia",
      "/sesion/cita-ficticia",
      "/acompanamiento/acuerdo-ficticio",
    ]) {
      const html = renderFrame(pathname);
      expect(html).toContain("data-workspace-header");
      expect(html).toContain('aria-label="Tu cuenta"');
      expect(html).toContain("Contenido del área");
      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html).not.toContain("data-public-header");
      expect(html).not.toContain("data-public-footer");
      expect(html).not.toContain("application/ld+json");
      expect(html).not.toContain("Buscar psicólogo");
      expect(html).not.toContain("Ayúdame a elegir");
      expect(html).not.toContain("Soy profesional");
      expect(html).not.toContain("Administración");
    }
  });

  it("las pantallas compartidas vuelven al selector sin asumir el rol de la cuenta", () => {
    for (const pathname of [
      "/c/conversacion-ficticia",
      "/sesion/cita-ficticia",
      "/acompanamiento/acuerdo-ficticio",
    ]) {
      expect(frameArea(pathname)).toBe("shared");
      const html = renderFrame(pathname);
      expect(html).toContain('aria-label="Nido · Tu espacio"');
      expect(html).toContain('href="/empezar"');
      expect(html).not.toContain('href="/pro/consulta"');
      expect(html).not.toContain('href="/mi"');
    }
  });

  it("deja que la demo tenga su propia cabecera sin montar controles de cuenta", () => {
    const html = renderFrame("/demo/consulta");
    expect(html).toContain('id="contenido"');
    expect(html).toContain("Contenido del área");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("Ingresar");
    expect(html).not.toContain("site-navigation");
    expect(html).not.toContain("application/ld+json");
  });

  it("conserva captación y acceso público, y no confunde prefijos parecidos", () => {
    for (const pathname of [
      "/",
      "/profesionales",
      "/orientacion",
      "/para-psicologos",
      "/pro",
      "/pro/restablecer",
      "/empezar/paciente",
      "/miembros",
      "/progreso",
      "/demo/consulta-extra",
      "/sesiones-publicas",
      "/acompanamiento-publico",
      "/contacto",
      "/admin",
    ]) {
      expect(frameArea(pathname)).toBe("public");
      const html = renderFrame(pathname);
      expect(html).toContain("data-public-header");
      expect(html).toContain("data-public-footer");
      expect(html).toContain("application/ld+json");
      expect(html).toContain("Buscar psicólogo");
      expect(html).toContain("Ayúdame a elegir");
      expect(html).not.toContain("data-workspace-header");
    }
  });
});
