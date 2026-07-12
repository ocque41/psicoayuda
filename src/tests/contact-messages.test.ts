import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAbuseContactEmail,
  getPrivacyContactEmail,
  getPublicContactEmails,
} from "@/lib/contact";
import {
  buildPreparedEmailUrl,
  buildProfessionalNewUserCallbackUrl,
  buildProfessionalReferralWhatsAppUrl,
  contactCategoryLabels,
  PROFESSIONAL_CONTACT_LIMIT_PER_HOUR,
  PUBLIC_CONTACT_LIMIT_PER_HOUR,
  professionalContactFormInput,
} from "@/lib/contact-messages";
import { buildContactMessageAlertEmail } from "@/lib/email-templates";
import { contactMessageSchema, contactStatusSchema } from "@/lib/validation";

describe("contactMessageSchema", () => {
  it("normaliza un mensaje válido y mantiene las categorías en español", () => {
    const parsed = contactMessageSchema.parse({
      category: "improvement",
      name: "  Ana Pérez  ",
      email: "  ANA@EJEMPLO.COM ",
      message: "  Me gustaría proponer una mejora sencilla.  ",
    });

    expect(parsed).toEqual({
      category: "improvement",
      name: "Ana Pérez",
      email: "ana@ejemplo.com",
      message: "Me gustaría proponer una mejora sencilla.",
    });
    expect(contactCategoryLabels.improvement).toBe(
      "Quiero proponer una mejora",
    );
  });

  it("rechaza categorías inventadas, mensajes muy cortos y estados inválidos", () => {
    expect(
      contactMessageSchema.safeParse({
        category: "technical_bug",
        email: "a@b.com",
        message: "Muy corto",
      }).success,
    ).toBe(false);
    expect(contactStatusSchema.safeParse("deleted").success).toBe(false);
  });

  it("limita el mensaje a 2000 caracteres", () => {
    expect(
      contactMessageSchema.safeParse({
        category: "question",
        email: "a@b.com",
        message: "a".repeat(2001),
      }).success,
    ).toBe(false);
  });
});

describe("enlaces de contacto y crecimiento", () => {
  it("crea una invitación de WhatsApp con registro y campaña medible", () => {
    const href = buildProfessionalReferralWhatsAppUrl(
      "https://saludmental-venezuela.com",
    );
    const message = new URL(href).searchParams.get("text") ?? "";

    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(message).toContain("Formo parte de Nido");
    expect(message).toContain("/pro?modo=registro");
    expect(message).toContain("utm_source=whatsapp");
    expect(message).toContain("utm_campaign=referidos_profesionales");
    expect(message).toContain("utm_content=panel_profesional");
  });

  it("marca solo las altas sociales profesionales como registro", () => {
    expect(buildProfessionalNewUserCallbackUrl("/pro/onboarding")).toBe(
      "/pro/onboarding?conversion=signup",
    );
    expect(
      buildProfessionalNewUserCallbackUrl("/pro/onboarding?paso=perfil"),
    ).toBe("/pro/onboarding?paso=perfil&conversion=signup");
    expect(buildProfessionalNewUserCallbackUrl("/admin")).toBe("/admin");
  });

  it("prepara el asunto y cuerpo del correo", () => {
    const href = buildPreparedEmailUrl(
      "equipo@example.com",
      "Pregunta sobre Nido",
      "Hola, equipo",
    );
    expect(href).toBe(
      "mailto:equipo@example.com?subject=Pregunta+sobre+Nido&body=Hola%2C+equipo",
    );
  });
});

describe("identidad y límites", () => {
  it("ignora el nombre y correo enviados por el navegador profesional", () => {
    expect(
      professionalContactFormInput(
        {
          category: "problem",
          message: "Mensaje válido para el equipo",
          name: "Nombre suplantado",
          email: "suplantado@example.com",
        },
        { name: "Ana verificada", email: "ana@example.com" },
      ),
    ).toMatchObject({
      name: "Ana verificada",
      email: "ana@example.com",
    });
  });

  it("mantiene los límites acordados para público y profesionales", () => {
    expect(PUBLIC_CONTACT_LIMIT_PER_HOUR).toBe(3);
    expect(PROFESSIONAL_CONTACT_LIMIT_PER_HOUR).toBe(5);
  });
});

describe("correos públicos y aviso interno", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("publica solo la lista dedicada y no depende de ADMIN_EMAILS", () => {
    vi.stubEnv("PUBLIC_CONTACT_EMAILS", " UNO@EJEMPLO.COM, dos@ejemplo.com ");
    vi.stubEnv("ADMIN_EMAILS", "privado@ejemplo.com");
    expect(getPublicContactEmails()).toEqual([
      "uno@ejemplo.com",
      "dos@ejemplo.com",
    ]);
  });

  it("nunca muestra un dominio de ejemplo si faltan variables", () => {
    vi.stubEnv("PUBLIC_CONTACT_EMAILS", "");
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "");
    vi.stubEnv("ABUSE_CONTACT_EMAIL", "");
    expect(getPrivacyContactEmail()).toBe("ocquema@gmail.com");
    expect(getAbuseContactEmail()).toBe("ocquema@gmail.com");
    expect(getPublicContactEmails()).toEqual([
      "ocquema@gmail.com",
      "martinezra02@gmail.com",
    ]);
  });

  it("el aviso no incluye datos personales y escapa contenido manipulable", () => {
    const mail = buildContactMessageAlertEmail({
      adminUrl: "https://example.com/admin#contactos",
      sourceLabel: "<Página pública>",
      categoryLabel: "<Algo no funciona>",
    });
    expect(mail.html).toContain("&lt;Página pública&gt;");
    expect(mail.html).not.toContain("<Página pública>");
    expect(mail.text).toContain("panel protegido");
  });
});
