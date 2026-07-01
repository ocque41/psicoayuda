import { describe, expect, it } from "vitest";
import { buildErrorAlertEmail } from "@/lib/email-templates";

const base = {
  userLabel: "ana@example.com (u_1)",
  path: "/pro/dashboard",
  message: "Cannot read properties of undefined",
  digest: "abc123",
  when: "2026-07-01T00:00:00.000Z",
};

describe("buildErrorAlertEmail", () => {
  it("dice quién, dónde y qué acción llevó al error", () => {
    const mail = buildErrorAlertEmail({
      ...base,
      lastAction: {
        label: "Ver ofertas",
        href: "/pro/dashboard",
        page: "/pro",
      },
    });
    expect(mail.subject).toContain("/pro/dashboard");
    expect(mail.text).toContain("ana@example.com");
    expect(mail.text).toContain("Ver ofertas");
    expect(mail.html).toContain("Ver ofertas");
    expect(mail.text).toContain("abc123");
  });

  it("escapa HTML de los campos que vienen del cliente (anti-inyección)", () => {
    const mail = buildErrorAlertEmail({
      ...base,
      message: "<img src=x onerror=alert(1)>",
      lastAction: {
        label: "<script>x</script>",
        href: "javascript:1",
        page: "/",
      },
    });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;img");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("tolera acción y campos ausentes", () => {
    const mail = buildErrorAlertEmail({
      userLabel: "anónimo (sin sesión)",
      path: "/",
      when: base.when,
    });
    expect(mail.html).toContain("anónimo");
    expect(mail.subject).toContain("Error en Nido");
  });
});
