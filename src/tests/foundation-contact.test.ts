import { describe, expect, it } from "vitest";
import { buildFoundationContactEmail } from "@/lib/email-templates";
import { foundationContactSchema } from "@/lib/validation";

describe("foundationContactSchema", () => {
  it("acepta datos válidos, recorta y normaliza el correo", () => {
    const parsed = foundationContactSchema.safeParse({
      contactName: "  Ana Pérez ",
      organizationName: "Fundación Ayuda",
      email: "Contacto@Fundacion.ORG",
      website: "fundacion.org",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("contacto@fundacion.org");
      expect(parsed.data.contactName).toBe("Ana Pérez");
      expect(parsed.data.website).toBe("fundacion.org");
      expect(parsed.data.message).toBeUndefined();
    }
  });

  it("exige contacto, organización y correo válido", () => {
    expect(
      foundationContactSchema.safeParse({ organizationName: "F", email: "x" })
        .success,
    ).toBe(false);
    expect(
      foundationContactSchema.safeParse({
        contactName: "Ana",
        organizationName: "Fundación X",
        email: "no-es-correo",
      }).success,
    ).toBe(false);
  });

  it("web y mensaje son opcionales", () => {
    const parsed = foundationContactSchema.safeParse({
      contactName: "Ana",
      organizationName: "Fundación X",
      email: "a@b.com",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("buildFoundationContactEmail", () => {
  it("incluye organización, contacto y correo en html y texto", () => {
    const mail = buildFoundationContactEmail({
      contactName: "Ana Pérez",
      organizationName: "Fundación Ayuda",
      email: "ana@fundacion.org",
    });
    expect(mail.subject).toContain("Fundación Ayuda");
    expect(mail.html).toContain("Ana Pérez");
    expect(mail.html).toContain("ana@fundacion.org");
    expect(mail.text).toContain("Fundación Ayuda");
    expect(mail.text).toContain("ana@fundacion.org");
  });

  it("pone Reply-To al correo de la organización para responder directo", () => {
    const mail = buildFoundationContactEmail({
      contactName: "Ana",
      organizationName: "F",
      email: "ana@fundacion.org",
    });
    expect(mail.headers["Reply-To"]).toBe("ana@fundacion.org");
  });

  it("normaliza el enlace web sin esquema a https", () => {
    const mail = buildFoundationContactEmail({
      contactName: "Ana",
      organizationName: "F",
      email: "a@b.com",
      website: "fundacion.org",
    });
    expect(mail.html).toContain('href="https://fundacion.org"');
  });

  it("escapa HTML para evitar inyección", () => {
    const mail = buildFoundationContactEmail({
      contactName: "<script>x</script>",
      organizationName: "<img src=x onerror=alert(1)>",
      email: "a@b.com",
    });
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<img src=x");
  });
});
