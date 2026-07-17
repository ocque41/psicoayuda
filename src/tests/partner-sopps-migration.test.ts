import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0021_add_sopps_partner.sql", import.meta.url),
  "utf8",
);

describe("migración de la organización aliada SOPPS", () => {
  it("es aditiva e idempotente", () => {
    expect(migration).toContain("INSERT OR IGNORE INTO `partners`");
    expect(migration).not.toMatch(/\b(?:DELETE|DROP|ALTER|UPDATE|REPLACE)\b/i);
  });

  it("publica los datos y canales aprobados en el orden correcto", () => {
    expect(migration).toContain("'partner-sopps-peru'");
    expect(migration).toContain("'Sociedad Peruana de Psicoterapeutas'");
    expect(migration).toContain("'Consejería psicológica a través de PAP'");
    expect(migration).toContain("'/partners/sopps.png'");
    expect(migration).toContain('"label":"Paula López de Romaña"');
    expect(migration).toContain('"type":"whatsapp","value":"+51991802871"');
    expect(migration).toContain('"type":"phone","value":"+51991802871"');
    expect(migration).toContain(
      '"type":"email","value":"paulalopezderomana2000@gmail.com"',
    );
    expect(migration).toContain(
      '"type":"website","value":"https://sopps.org/"',
    );
    expect(migration).toContain("'published',110");

    const whatsapp = migration.indexOf('"type":"whatsapp"');
    const phone = migration.indexOf('"type":"phone"');
    const email = migration.indexOf('"type":"email"');
    const website = migration.indexOf('"type":"website"');
    expect(whatsapp).toBeGreaterThan(-1);
    expect(whatsapp).toBeLessThan(phone);
    expect(phone).toBeLessThan(email);
    expect(email).toBeLessThan(website);
  });

  it("incluye el logo oficial aportado", () => {
    const logo = new URL("../../public/partners/sopps.png", import.meta.url);
    expect(existsSync(logo)).toBe(true);
    expect(readFileSync(logo).subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
