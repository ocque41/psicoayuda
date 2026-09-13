import { afterEach, describe, expect, it } from "vitest";
import {
  credentialErrorCode,
  planProfessionalEmailSync,
  translateChangeEmailError,
  translateChangePasswordError,
} from "@/lib/credentials";
import {
  getTurnstileConfig,
  interpretTurnstileResponse,
} from "@/lib/turnstile";
import {
  emailChangeSchema,
  passwordChangeSchema,
  phoneUpdateSchema,
} from "@/lib/validation";

describe("planProfessionalEmailSync", () => {
  it("con el mismo correo no hay nada que hacer; sin correo previo se rellena", () => {
    expect(
      planProfessionalEmailSync(
        { professionalEmail: null, contactEmail: null },
        "nueva@test.local",
      ),
    ).toEqual({ email: "nueva@test.local" });
    expect(
      planProfessionalEmailSync(
        { professionalEmail: "ana@test.local", contactEmail: null },
        "ANA@test.local",
      ),
    ).toBeNull();
  });

  it("actualiza el correo del perfil y mueve el de coordinación si lo seguía", () => {
    expect(
      planProfessionalEmailSync(
        { professionalEmail: "ana@test.local", contactEmail: "ana@test.local" },
        "nueva@test.local",
      ),
    ).toEqual({ email: "nueva@test.local", contactEmail: "nueva@test.local" });
  });

  it("respeta un correo de coordinación distinto (elegido a propósito)", () => {
    expect(
      planProfessionalEmailSync(
        {
          professionalEmail: "ana@test.local",
          contactEmail: "coord@test.local",
        },
        "nueva@test.local",
      ),
    ).toEqual({ email: "nueva@test.local" });
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(
      planProfessionalEmailSync(
        {
          professionalEmail: " Ana@Test.local ",
          contactEmail: "ANA@test.local",
        },
        "  Nueva@Test.local  ",
      ),
    ).toEqual({ email: "nueva@test.local", contactEmail: "nueva@test.local" });
  });
});

describe("credentialErrorCode y mensajes humanos", () => {
  it("lee el código desde body.code o desde la raíz", () => {
    expect(credentialErrorCode({ body: { code: "INVALID_PASSWORD" } })).toBe(
      "INVALID_PASSWORD",
    );
    expect(credentialErrorCode({ code: "TOKEN_EXPIRED" })).toBe(
      "TOKEN_EXPIRED",
    );
    expect(credentialErrorCode(new Error("boom"))).toBe("");
    expect(credentialErrorCode(null)).toBe("");
  });

  it("traduce contraseña incorrecta, corta y cuenta de Google", () => {
    expect(
      translateChangePasswordError({ body: { code: "INVALID_PASSWORD" } }),
    ).toContain("contraseña actual no es correcta");
    expect(
      translateChangePasswordError({ body: { code: "PASSWORD_TOO_SHORT" } }),
    ).toContain("8 caracteres");
    expect(
      translateChangePasswordError({
        body: { code: "CREDENTIAL_ACCOUNT_NOT_FOUND" },
      }),
    ).toContain("Google");
  });

  it("traduce correo y fallback genérico en español", () => {
    expect(
      translateChangeEmailError({ body: { code: "CHANGE_EMAIL_DISABLED" } }),
    ).toContain("no está disponible");
    expect(translateChangeEmailError({})).toContain("Inténtalo de nuevo");
  });
});

describe("interpretTurnstileResponse", () => {
  it("acepta success:true y recoge códigos de error", () => {
    expect(interpretTurnstileResponse({ success: true })).toEqual({
      ok: true,
      codes: [],
    });
    expect(
      interpretTurnstileResponse({
        success: false,
        "error-codes": ["invalid-input-response", "timeout-or-duplicate"],
      }),
    ).toEqual({
      ok: false,
      codes: ["invalid-input-response", "timeout-or-duplicate"],
    });
  });

  it("payload inválido no pasa", () => {
    expect(interpretTurnstileResponse(null).ok).toBe(false);
    expect(interpretTurnstileResponse("ok").ok).toBe(false);
  });
});

describe("getTurnstileConfig", () => {
  const originalSiteKey = process.env.TURNSTILE_SITE_KEY;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  const restoreEnv = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  afterEach(() => {
    restoreEnv("TURNSTILE_SITE_KEY", originalSiteKey);
    restoreEnv("TURNSTILE_SECRET_KEY", originalSecret);
  });

  it("solo se activa cuando hay site key Y secreto", () => {
    process.env.TURNSTILE_SITE_KEY = "0xSITE";
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(getTurnstileConfig()).toEqual({ siteKey: "0xSITE", enabled: false });

    process.env.TURNSTILE_SITE_KEY = "";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    expect(getTurnstileConfig()).toEqual({ siteKey: null, enabled: false });

    process.env.TURNSTILE_SITE_KEY = "0xSITE";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    expect(getTurnstileConfig()).toEqual({ siteKey: "0xSITE", enabled: true });
  });
});

describe("emailChangeSchema", () => {
  it("normaliza el correo (trim + minúsculas)", () => {
    const r = emailChangeSchema.safeParse({ newEmail: "  Nueva@Test.COM  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe("nueva@test.com");
  });

  it("rechaza correos inválidos", () => {
    expect(
      emailChangeSchema.safeParse({ newEmail: "sin-arroba" }).success,
    ).toBe(false);
  });

  it("la contraseña vacía se trata como ausente (cuentas de Google)", () => {
    const r = emailChangeSchema.safeParse({
      newEmail: "nueva@test.com",
      currentPassword: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currentPassword).toBeUndefined();
  });
});

describe("passwordChangeSchema", () => {
  it("acepta un cambio válido", () => {
    const r = passwordChangeSchema.safeParse({
      currentPassword: "clave-vieja-1",
      newPassword: "clave-nueva-2",
      confirmPassword: "clave-nueva-2",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza confirmación distinta", () => {
    const r = passwordChangeSchema.safeParse({
      currentPassword: "clave-vieja-1",
      newPassword: "clave-nueva-2",
      confirmPassword: "otra",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza la misma contraseña y las cortas", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "igual-123",
        newPassword: "igual-123",
        confirmPassword: "igual-123",
      }).success,
    ).toBe(false);
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "clave-vieja-1",
        newPassword: "corta",
        confirmPassword: "corta",
      }).success,
    ).toBe(false);
  });
});

describe("phoneUpdateSchema", () => {
  it("acepta teléfonos venezolanos e internacionales", () => {
    const r = phoneUpdateSchema.safeParse({
      phone: "0412-1234567",
      landline: "+57 300 1234567",
    });
    expect(r.success).toBe(true);
  });

  it("acepta vacíos (quitar la vía) pero rechaza basura", () => {
    expect(
      phoneUpdateSchema.safeParse({ phone: "", landline: "" }).success,
    ).toBe(true);
    expect(phoneUpdateSchema.safeParse({ phone: "123" }).success).toBe(false);
  });
});
