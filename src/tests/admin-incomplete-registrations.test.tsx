import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IncompleteRegistrationsSection,
  type RegistrationAccount,
  selectIncompleteRegistrations,
} from "@/components/admin-incomplete-registrations";
import { getAdminEmails } from "@/lib/admin";

const accounts: RegistrationAccount[] = [
  {
    id: "user-old",
    name: "Registro anterior",
    email: "anterior@example.test",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    emailVerified: false,
  },
  {
    id: "user-new",
    name: "Registro reciente",
    email: "reciente@example.test",
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    emailVerified: true,
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registros incompletos del panel admin", () => {
  it("muestra usuarios sin perfil profesional, con los más recientes primero", () => {
    const registrations = selectIncompleteRegistrations(accounts, [], []);
    const html = renderToStaticMarkup(
      <IncompleteRegistrationsSection registrations={registrations} />,
    );

    expect(html).toContain("Registro reciente");
    expect(html).toContain("reciente@example.test");
    expect(html).toContain("Verificado");
    expect(html).toContain("Registro anterior");
    expect(html).toContain("Sin verificar");
    expect(html).toContain("Onboarding incompleto");
    expect(html.indexOf("Registro reciente")).toBeLessThan(
      html.indexOf("Registro anterior"),
    );
  });

  it("excluye usuarios que ya completaron el perfil profesional", () => {
    const registrations = selectIncompleteRegistrations(
      accounts,
      ["user-new"],
      [],
    );

    expect(registrations.map((registration) => registration.id)).toEqual([
      "user-old",
    ]);
  });

  it("excluye administradores usando ADMIN_EMAILS sin distinguir mayúsculas", () => {
    vi.stubEnv("ADMIN_EMAILS", " admin@example.test,otro@example.test ");
    const adminAccount: RegistrationAccount = {
      id: "user-admin",
      name: "Administradora",
      email: "ADMIN@example.test",
      createdAt: new Date("2026-07-01T13:00:00.000Z"),
      emailVerified: true,
    };

    const registrations = selectIncompleteRegistrations(
      [...accounts, adminAccount],
      [],
      getAdminEmails(),
    );

    expect(registrations.map((registration) => registration.id)).not.toContain(
      "user-admin",
    );
  });

  it("muestra el total cero y un estado vacío claro", () => {
    const html = renderToStaticMarkup(
      <IncompleteRegistrationsSection registrations={[]} />,
    );

    expect(html).toContain("Total: 0");
    expect(html).toContain("No hay registros incompletos.");
    expect(html).not.toContain("<table");
  });
});
