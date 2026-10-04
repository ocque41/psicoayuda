import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    user: {
      id: "test-patient-credentials",
      name: "Persona ficticia",
      email: "persona@example.test",
      emailVerified: true,
    },
  } as {
    user: { id: string; name: string; email: string; emailVerified: boolean };
  } | null,
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
  verifyPassword: vi.fn(),
  revokeOtherSessions: vi.fn(),
  sendEmail: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () => mocks.session,
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      changeEmail: mocks.changeEmail,
      changePassword: mocks.changePassword,
      verifyPassword: mocks.verifyPassword,
      revokeOtherSessions: mocks.revokeOtherSessions,
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: async () => ({ ok: true }),
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/credentials", async (original) => ({
  ...(await original<typeof import("@/lib/credentials")>()),
  hasCredentialPassword: async () => false,
  isCredentialChangeRateLimited: async () => false,
  logCredentialAudit: mocks.audit,
}));

import { changeMyEmail, changeMyPassword } from "@/app/actions-credentials";
import { CredentialSettings } from "@/components/credential-settings";
import { SITE_URL } from "@/lib/site";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = {
    user: {
      id: "test-patient-credentials",
      name: "Persona ficticia",
      email: "persona@example.test",
      emailVerified: true,
    },
  };
  mocks.changeEmail.mockResolvedValue({ status: true });
  mocks.changePassword.mockResolvedValue({ token: "test-local-only" });
  mocks.revokeOtherSessions.mockResolvedValue({ status: true });
  mocks.sendEmail.mockResolvedValue({ ok: true });
});

function emailForm(destination?: string) {
  const form = new FormData();
  form.set("newEmail", "nuevo@example.test");
  if (destination) form.set("credentialReturnTo", destination);
  return form;
}

describe("destinos de seguridad de cuenta", () => {
  it("la confirmación iniciada en ajustes profesionales vuelve al panel de ajustes", async () => {
    expect((await changeMyEmail(null, emailForm("/pro/ajustes")))?.status).toBe(
      "success",
    );
    expect(mocks.changeEmail).toHaveBeenCalledWith({
      body: { newEmail: "nuevo@example.test", callbackURL: "/pro/ajustes" },
      headers: expect.any(Headers),
    });
  });
  it("la confirmación de correo vuelve a preferencias del paciente", async () => {
    expect((await changeMyEmail(null, emailForm("/mi/ajustes")))?.status).toBe(
      "success",
    );
    expect(mocks.changeEmail).toHaveBeenCalledWith({
      body: { newEmail: "nuevo@example.test", callbackURL: "/mi/ajustes" },
      headers: expect.any(Headers),
    });
  });

  it.each([
    undefined,
    "https://externo.example/",
    "//externo.example/",
    "/mi/ajustes?next=https://externo.example/",
    "/pro/ajustes?next=https://externo.example/",
    "/%2fexterno.example/",
  ])("no admite destino externo o arbitrario: %s", async (destination) => {
    await changeMyEmail(null, emailForm(destination));
    expect(mocks.changeEmail.mock.calls[0][0].body.callbackURL).toBe(
      "/pro/dashboard",
    );
  });

  it("el aviso de contraseña del paciente apunta a sus ajustes y revoca las otras sesiones", async () => {
    const form = new FormData();
    form.set("currentPassword", "clave-vieja-1");
    form.set("newPassword", "clave-nueva-2");
    form.set("confirmPassword", "clave-nueva-2");
    form.set("credentialReturnTo", "/mi/ajustes");
    expect((await changeMyPassword(null, form))?.status).toBe("success");
    expect(mocks.revokeOtherSessions).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0][0].html).toContain(
      `${SITE_URL.replace(/\/+$/, "")}/mi/ajustes`,
    );
  });

  it("si falla la revocación, comunica el cambio aplicado sin prometer un cierre ni pedir repetirlo", async () => {
    const form = new FormData();
    form.set("currentPassword", "clave-vieja-1");
    form.set("newPassword", "clave-nueva-2");
    form.set("confirmPassword", "clave-nueva-2");
    form.set("credentialReturnTo", "/mi/ajustes");
    mocks.revokeOtherSessions.mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await changeMyPassword(null, form);
    log.mockRestore();
    expect(result?.status).toBe("success");
    expect(result?.message).toContain("Tu contraseña cambió");
    expect(result?.message).toContain("No pudimos confirmar el cierre");
    expect(result?.message).not.toContain("Cerramos las demás sesiones");
    const notice = mocks.sendEmail.mock.calls[0][0];
    expect(notice.html).toContain("No pudimos confirmar el cierre");
    expect(notice.text).not.toContain("cerramos las demás sesiones");
  });

  it("si falla el aviso, conserva el resultado del cambio y comunica la entrega pendiente", async () => {
    const form = new FormData();
    form.set("currentPassword", "clave-vieja-1");
    form.set("newPassword", "clave-nueva-2");
    form.set("confirmPassword", "clave-nueva-2");
    mocks.sendEmail.mockResolvedValueOnce({ ok: false, skipped: true });
    const result = await changeMyPassword(null, form);
    expect(result?.status).toBe("success");
    expect(result?.message).toContain("No pudimos entregar el aviso");
    expect(result?.message).not.toContain("Te enviamos un aviso");
  });

  it("redirige una acción sin sesión a la entrada genérica", async () => {
    mocks.session = null;
    await expect(changeMyEmail(null, emailForm("/mi/ajustes"))).rejects.toThrow(
      "REDIRECT:/entrar",
    );
    expect(mocks.changeEmail).not.toHaveBeenCalled();
  });
});

describe("controles de acceso compartidos", () => {
  const props = {
    currentEmail: "persona@example.test",
    emailVerified: true,
    hasPassword: true,
    turnstileSiteKey: null,
  };
  it("el paciente ve correo y contraseña, sin publicación de teléfonos ni formulario profesional", () => {
    const html = renderToStaticMarkup(
      <CredentialSettings
        {...props}
        showPhones={false}
        returnTo="/mi/ajustes"
      />,
    );
    expect(html).toContain("Cambiar mi correo");
    expect(html).toContain("Cambiar mi contraseña");
    expect(html).toContain('name="credentialReturnTo" value="/mi/ajustes"');
    expect(html).not.toContain("Teléfonos de contacto");
    expect(html).not.toContain("públicos");
  });
  it("mantiene los teléfonos disponibles por defecto para el profesional", () => {
    expect(renderToStaticMarkup(<CredentialSettings {...props} />)).toContain(
      "Teléfonos de contacto",
    );
  });
});
