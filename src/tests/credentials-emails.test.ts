import { describe, expect, it } from "vitest";
import {
  buildEmailChangeConfirmationEmail,
  buildEmailChangeNoticeEmail,
  buildEmailVerificationEmail,
  buildPasswordChangedEmail,
  buildPhoneChangedEmail,
} from "@/lib/email-templates";

const URL_CONFIRMA =
  "https://saludmental-venezuela.com/api/auth/verify-email?token=tok123&callbackURL=%2Fpro%2Fdashboard";

describe("correos de credenciales", () => {
  it("confirmación de cambio de correo: aprueba desde el correo actual", () => {
    const correo = buildEmailChangeConfirmationEmail({
      confirmUrl: URL_CONFIRMA,
      newEmail: "nueva@test.com",
      name: "Valentina",
    });
    expect(correo.subject).toContain("Aprueba el cambio de correo");
    expect(correo.html).toContain("Hola Valentina,");
    expect(correo.html).toContain("nueva@test.com");
    expect(correo.html).toContain(URL_CONFIRMA.replace(/&/g, "&amp;"));
    expect(correo.text).toContain(URL_CONFIRMA);
    expect(correo.text).toContain("no cambia");
    expect(correo.headers.Importance).toBe("high");
  });

  it("confirmación escapa el nombre y el correo nuevos", () => {
    const correo = buildEmailChangeConfirmationEmail({
      confirmUrl: URL_CONFIRMA,
      newEmail: "<script>x</script>",
      name: "<b>Ana</b>",
    });
    expect(correo.html).not.toContain("<script>x</script>");
    expect(correo.html).not.toContain("<b>Ana</b>");
    expect(correo.html).toContain("&lt;script&gt;");
  });

  it("verificación de la dirección nueva: enlace de un solo uso", () => {
    const correo = buildEmailVerificationEmail({
      verifyUrl: URL_CONFIRMA,
      name: null,
    });
    expect(correo.subject).toContain("Confirma tu nuevo correo");
    expect(correo.html).toContain("Hola,");
    expect(correo.text).toContain(URL_CONFIRMA);
    expect(correo.text).toContain("1 hora");
    expect(correo.text).toContain("sin tu confirmación");
  });

  it("aviso al correo actual: menciona la dirección nueva y el enlace al panel", () => {
    const correo = buildEmailChangeNoticeEmail({
      newEmail: "nueva@test.com",
      dashboardUrl: "https://saludmental-venezuela.com/pro/dashboard",
    });
    expect(correo.subject).toContain("Solicitud de cambio de correo");
    expect(correo.text).toContain("nueva@test.com");
    expect(correo.html).toContain("/pro/dashboard");
    expect(correo.html).toContain("no se aplica hasta que lo confirmes");
  });

  it("contraseña cambiada: menciona el cierre de sesiones", () => {
    const correo = buildPasswordChangedEmail({
      dashboardUrl: "https://saludmental-venezuela.com/pro/dashboard",
    });
    expect(correo.subject).toContain("contraseña");
    expect(correo.text).toContain("cerramos las demás sesiones");
    expect(correo.text).toContain("Si no hiciste este cambio");
  });

  it("teléfonos: lista los nuevos números", () => {
    const correo = buildPhoneChangedEmail({
      dashboardUrl: "https://saludmental-venezuela.com/pro/dashboard",
      phone: "+58 412 1234567",
      landline: null,
      name: "Ana",
    });
    expect(correo.subject).toContain("datos de contacto");
    expect(correo.html).toContain("Hola Ana,");
    expect(correo.text).toContain("WhatsApp: +58 412 1234567");
    expect(correo.text).toContain("públicos");
  });

  it("teléfonos: caso sin números (se quitaron) sin frases vacías", () => {
    const correo = buildPhoneChangedEmail({
      dashboardUrl: "https://saludmental-venezuela.com/pro/dashboard",
      phone: null,
      landline: null,
    });
    expect(correo.text).toContain("Quitamos los teléfonos");
    expect(correo.text).not.toContain("Ahora son:");
  });
});
