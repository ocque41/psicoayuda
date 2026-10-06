import { describe, expect, it } from "vitest";
import {
  buildProfessionalInvitation,
  buildProfessionalReferralWhatsAppUrl,
  type ProfessionalInvitationSource,
} from "@/lib/contact-messages";
import { MEMBERSHIP_PLAN, TRIAL_DAYS } from "@/lib/practice/membership-plan";

describe("invitación al software profesional", () => {
  it.each([
    ["admission", "panel_admision"],
    ["professional", "panel_profesional"],
  ] as const)("%s conserva el registro y la campaña sin identidad de quien invita", (source, content) => {
    const invitation = buildProfessionalInvitation({
      siteUrl: "https://nido.example.invalid",
      source,
    });
    const registration = new URL(invitation.registrationUrl);
    expect(registration.pathname).toBe("/pro");
    expect(Object.fromEntries(registration.searchParams)).toEqual({
      modo: "registro",
      utm_source: "nido",
      utm_medium: "referral",
      utm_campaign: "referidos_profesionales",
      utm_content: content,
    });
    expect(invitation.message).toContain(invitation.registrationUrl);
    expect(invitation.message).toContain(`${TRIAL_DAYS} días gratis`);
    expect(invitation.message).toContain("sin tarjeta y sin cobro automático");
    expect(invitation.message).toContain(
      `${MEMBERSHIP_PLAN.priceLabel} al mes, sólo si decides contratarlo`,
    );
    expect(invitation.message).toContain("revisión profesional habitual");
    expect(invitation.message).toContain("Tras la aprobación de tu perfil");
    expect(invitation.message).toContain("antes de publicar tu perfil");
    expect(invitation.message).toContain("Ayuda Terremoto");
    expect(invitation.message).toContain(
      "apoyo psicológico gratuito por separado",
    );
    expect(invitation.message).not.toMatch(/\b(?:Paola|Superadmin|S\.L\.)\b/);
  });

  it("todos los canales preparan exactamente el mensaje mostrado y el correo no incluye destinatario", () => {
    const invitation = buildProfessionalInvitation({
      siteUrl: "https://nido.example.invalid",
      source: "admission",
    });
    const whatsapp = new URL(invitation.whatsappUrl);
    const email = new URL(invitation.emailUrl);
    expect(whatsapp.origin).toBe("https://wa.me");
    expect(whatsapp.searchParams.get("text")).toBe(invitation.message);
    expect(email.protocol).toBe("mailto:");
    expect(email.pathname).toBe("");
    expect(email.searchParams.get("subject")).toBe("Te invito a probar Nido");
    expect(email.searchParams.get("body")).toBe(invitation.message);
  });

  it("no hereda credenciales, relatos, datos de cuenta o fragmentos de la URL base", () => {
    const invitation = buildProfessionalInvitation({
      siteUrl:
        "https://fictional-user:fictional-password@nido.example.invalid/private?email=persona%40example.invalid#nota-ficticia",
      source: "admission",
    });
    const registration = new URL(invitation.registrationUrl);
    expect(registration.origin).toBe("https://nido.example.invalid");
    expect(registration.username).toBe("");
    expect(registration.password).toBe("");
    expect(registration.hash).toBe("");
    expect(JSON.stringify(invitation)).not.toMatch(
      /fictional-user|fictional-password|persona|nota-ficticia|private/,
    );
  });

  it("conserva el enlace anterior de WhatsApp con su campaña y moderniza el contenido", () => {
    const message = new URL(
      buildProfessionalReferralWhatsAppUrl("https://nido.example.invalid"),
    ).searchParams.get("text");
    const link = message?.split("\n").at(-1);
    expect(link).toBeTruthy();
    expect(new URL(link || "").searchParams.get("utm_source")).toBe("whatsapp");
    expect(new URL(link || "").searchParams.get("utm_campaign")).toBe(
      "referidos_profesionales",
    );
    expect(new URL(link || "").searchParams.get("utm_content")).toBe(
      "panel_profesional",
    );
    expect(message).toContain("notas por sesión");
    expect(message).not.toContain("quieran acompañar gratis y a distancia");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,fixture",
    "file:///tmp/fixture",
  ])("rechaza bases ajenas a HTTP(S): %s", (siteUrl) => {
    expect(() =>
      buildProfessionalInvitation({ siteUrl, source: "admission" }),
    ).toThrow("No se pudo preparar");
  });

  it("un origen de campaña recibido fuera del vocabulario no llega al enlace", () => {
    expect(() =>
      buildProfessionalInvitation({
        siteUrl: "https://nido.example.invalid",
        source: "email@example.invalid" as ProfessionalInvitationSource,
      }),
    ).toThrow("No se pudo preparar");
  });
});
