import { describe, expect, it } from "vitest";
import {
  buildAllianceApprovedEmail,
  buildFoundationContactEmail,
} from "@/lib/email-templates";
import {
  allianceStatusSchema,
  foundationContactSchema,
} from "@/lib/validation";

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

  it("acepta web con o sin esquema pero rechaza texto que no es web", () => {
    const base = {
      contactName: "Ana",
      organizationName: "Fundación X",
      email: "a@b.com",
    };
    expect(
      foundationContactSchema.safeParse({
        ...base,
        website: "https://fundacion.org",
      }).success,
    ).toBe(true);
    expect(
      foundationContactSchema.safeParse({
        ...base,
        website: "fundacion.org/aliados",
      }).success,
    ).toBe(true);
    expect(
      foundationContactSchema.safeParse({ ...base, website: "no es una web" })
        .success,
    ).toBe(false);
  });

  it("acepta un teléfono válido y rechaza uno con letras", () => {
    const base = {
      contactName: "Ana",
      organizationName: "Fundación X",
      email: "a@b.com",
    };
    const valid = foundationContactSchema.safeParse({
      ...base,
      phone: "+58 412 1234567",
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.phone).toBe("+58 412 1234567");
    expect(
      foundationContactSchema.safeParse({ ...base, phone: "no-es-un-numero" })
        .success,
    ).toBe(false);
  });
});

describe("allianceStatusSchema", () => {
  it("acepta los estados válidos y rechaza otros", () => {
    expect(allianceStatusSchema.safeParse("pending").success).toBe(true);
    expect(allianceStatusSchema.safeParse("approved").success).toBe(true);
    expect(allianceStatusSchema.safeParse("rejected").success).toBe(true);
    expect(allianceStatusSchema.safeParse("suspended").success).toBe(false);
  });
});

describe("buildAllianceApprovedEmail", () => {
  it("incluye el nombre de la organización y saluda al contacto", () => {
    const mail = buildAllianceApprovedEmail({
      organizationName: "Fundación Ayuda",
      contactName: "Ana Pérez",
    });
    expect(mail.subject).toContain("aliada");
    expect(mail.html).toContain("Fundación Ayuda");
    expect(mail.html).toContain("Ana Pérez");
    expect(mail.text).toContain("Fundación Ayuda");
  });

  it("escapa HTML para evitar inyección", () => {
    const mail = buildAllianceApprovedEmail({
      organizationName: "<img src=x onerror=alert(1)>",
      contactName: "<script>x</script>",
    });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).not.toContain("<script>x</script>");
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

  it("incluye teléfono y el enlace al panel cuando se pasan", () => {
    const mail = buildFoundationContactEmail({
      contactName: "Ana",
      organizationName: "F",
      email: "a@b.com",
      phone: "+58 412 1234567",
      adminUrl: "https://saludmental-venezuela.com/admin",
    });
    expect(mail.html).toContain("+58 412 1234567");
    expect(mail.html).toContain("https://saludmental-venezuela.com/admin");
    expect(mail.text).toContain("+58 412 1234567");
    expect(mail.text).toContain("https://saludmental-venezuela.com/admin");
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
