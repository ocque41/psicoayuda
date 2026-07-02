import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail } from "@/lib/email-templates";

describe("buildPasswordResetEmail", () => {
  const url =
    "https://saludmental-venezuela.com/api/auth/reset-password/tok123?callbackURL=%2Fpro%2Frestablecer";

  it("incluye el enlace en html y texto, y avisa de la caducidad", () => {
    const correo = buildPasswordResetEmail({
      resetUrl: url,
      name: "Valentina",
    });
    expect(correo.subject).toContain("contraseña nueva");
    expect(correo.html).toContain("Hola Valentina,");
    expect(correo.html).toContain(url.replace(/&/g, "&amp;"));
    expect(correo.text).toContain(url);
    expect(correo.text).toContain("1 hora");
    expect(correo.html).toContain("ignora este correo");
  });

  it("sin nombre saluda en genérico y escapa HTML en el nombre", () => {
    const anonimo = buildPasswordResetEmail({ resetUrl: url });
    expect(anonimo.html).toContain("Hola,");
    const malicioso = buildPasswordResetEmail({
      resetUrl: url,
      name: "<script>x</script>",
    });
    expect(malicioso.html).not.toContain("<script>x</script>");
    expect(malicioso.html).toContain("&lt;script&gt;");
  });

  it("va con cabeceras de alta prioridad", () => {
    const correo = buildPasswordResetEmail({ resetUrl: url });
    expect(correo.headers.Importance).toBe("high");
  });
});
