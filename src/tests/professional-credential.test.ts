import { describe, expect, it } from "vitest";
import { professionalSchema } from "@/lib/validation";

// Base válida: satisface todo menos la lógica de credencial (contacto por correo
// público, áreas, conducta). Cada test añade/omite la parte de credencial.
const base = {
  fullName: "Ana Pérez",
  supportAreas: ["orientacion_general"],
  maxActiveRequests: "3",
  emailPublic: "on",
  conductFreeService: "on",
  conductNoClientCapture: "on",
  conductConfidentiality: "on",
  conductNoEmergencyGuarantee: "on",
  conductCompetence: "on",
} as const;

const PDF = "data:application/pdf;base64,AAAA";

describe("professionalSchema — verificación de credencial (una de tres o auxiliar)", () => {
  it("auxiliar no clínico: pasa sin credencial ni universidad", () => {
    const r = professionalSchema.safeParse({
      ...base,
      nonClinicalHelper: "on",
    });
    expect(r.success).toBe(true);
  });

  it("solo número FPV (con universidad): pasa", () => {
    const r = professionalSchema.safeParse({
      ...base,
      university: "Universidad Central de Venezuela",
      fpvNumber: "12345",
    });
    expect(r.success).toBe(true);
  });

  it("solo supervisión (con universidad): pasa", () => {
    const r = professionalSchema.safeParse({
      ...base,
      university: "Universidad Central de Venezuela",
      supervisionInfo: "Supervisada por la Dra. X en el Hospital Y",
    });
    expect(r.success).toBe(true);
  });

  it("comprobante de registro SIN documento: falla", () => {
    const r = professionalSchema.safeParse({
      ...base,
      university: "Universidad Central de Venezuela",
      registrationType: "colegio_psicologos",
    });
    expect(r.success).toBe(false);
  });

  it("comprobante de registro CON documento (PDF): pasa", () => {
    const r = professionalSchema.safeParse({
      ...base,
      university: "Universidad Central de Venezuela",
      registrationType: "colegio_psicologos",
      registrationProofDoc: PDF,
    });
    expect(r.success).toBe(true);
  });

  it("ninguna vía y no auxiliar: falla aunque tenga universidad", () => {
    const r = professionalSchema.safeParse({
      ...base,
      university: "Universidad Central de Venezuela",
    });
    expect(r.success).toBe(false);
  });

  it("clínico con vía pero SIN universidad: falla", () => {
    const r = professionalSchema.safeParse({ ...base, fpvNumber: "12345" });
    expect(r.success).toBe(false);
  });

  it("documento con formato inválido (no imagen/PDF): falla", () => {
    const r = professionalSchema.safeParse({
      ...base,
      university: "Universidad Central de Venezuela",
      registrationType: "inprepsi",
      registrationProofDoc: "data:text/plain;base64,AAAA",
    });
    expect(r.success).toBe(false);
  });
});
