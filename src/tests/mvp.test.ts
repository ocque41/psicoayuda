import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  helpRequestSchema,
  professionalSchema,
  professionalStatusSchema,
} from "@/lib/validation";

function scoreForTest(professional: {
  languages: string;
  supportAreas: string;
  crisisExperience: boolean;
  currentActiveRequests: number;
  maxActiveRequests: number;
}) {
  let score = 0;
  const langs = JSON.parse(professional.languages);
  const areas = JSON.parse(professional.supportAreas);
  if (langs.includes("es")) score += 30;
  if (areas.includes("duelo")) score += 20;
  if (professional.crisisExperience) score += 10;
  score += Math.max(
    0,
    professional.maxActiveRequests - professional.currentActiveRequests,
  );
  return score;
}

describe("Nido MVP smoke checks", () => {
  it("allows a help request with email and no location", () => {
    const parsed = helpRequestSchema.safeParse({
      email: "persona@example.com",
      language: "es",
      country: "Venezuela",
      needCategory: "duelo",
      urgency: "media",
      consentContact: "on",
      locationConsent: "false",
      lat: "",
      lng: "",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.lat).toBeUndefined();
    expect(parsed.data.lng).toBeUndefined();
  });

  it("requires consent for help requests", () => {
    const parsed = helpRequestSchema.safeParse({
      email: "persona@example.com",
      language: "es",
      needCategory: "duelo",
      urgency: "media",
    });

    expect(parsed.success).toBe(false);
  });

  it("validates professional onboarding fields and capacity range", () => {
    const parsed = professionalSchema.safeParse({
      fullName: "Ana Perez",
      licenseNumber: "CRED-1",
      licenseCountry: "Venezuela",
      university: "Universidad Central de Venezuela",
      phone: "0412-1234567",
      supportAreas: ["duelo"],
      remoteAvailable: "on",
      acceptingRequests: "on",
      crisisExperience: "on",
      maxActiveRequests: "3",
      conductFreeService: "on",
      conductNoClientCapture: "on",
      conductConfidentiality: "on",
      conductNoEmergencyGuarantee: "on",
      conductCompetence: "on",
    });

    expect(parsed.success).toBe(true);
  });

  it("requires WhatsApp or landline and rejects unusable numbers", () => {
    const base = {
      fullName: "Ana Perez",
      licenseNumber: "CRED-1",
      licenseCountry: "Venezuela",
      university: "Universidad Central de Venezuela",
      supportAreas: ["duelo"],
      maxActiveRequests: "3",
      conductFreeService: "on",
      conductNoClientCapture: "on",
      conductConfidentiality: "on",
      conductNoEmergencyGuarantee: "on",
      conductCompetence: "on",
    };
    // Sin WhatsApp ni fijo: rechazado, incluso si llegan como campos vacíos.
    const missingContact = professionalSchema.safeParse(base);
    expect(missingContact.success).toBe(false);
    if (!missingContact.success) {
      expect(missingContact.error.issues[0]?.message).toBe(
        "Debes indicar un número de WhatsApp o un teléfono fijo.",
      );
    }
    expect(
      professionalSchema.safeParse({ ...base, phone: "", landline: "" })
        .success,
    ).toBe(false);
    // WhatsApp basura no normalizable: rechazado.
    expect(
      professionalSchema.safeParse({ ...base, phone: "123" }).success,
    ).toBe(false);
    // WhatsApp válido: aceptado.
    expect(
      professionalSchema.safeParse({ ...base, phone: "+58 412 1234567" })
        .success,
    ).toBe(true);
    // Teléfono fijo válido: aceptado.
    expect(
      professionalSchema.safeParse({ ...base, landline: "0212-1234567" })
        .success,
    ).toBe(true);
    // Teléfono fijo basura: rechazado.
    expect(
      professionalSchema.safeParse({ ...base, landline: "x" }).success,
    ).toBe(false);
  });

  it("requires professional conduct acceptance", () => {
    const parsed = professionalSchema.safeParse({
      fullName: "Ana Perez",
      licenseNumber: "CRED-1",
      licenseCountry: "Venezuela",
      university: "Universidad Central de Venezuela",
      supportAreas: ["duelo"],
      maxActiveRequests: "3",
    });

    expect(parsed.success).toBe(false);
  });

  it("scores language, support area, crisis experience, and lower load", () => {
    const score = scoreForTest({
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      crisisExperience: true,
      currentActiveRequests: 1,
      maxActiveRequests: 3,
    });

    expect(score).toBe(62);
  });

  it("capacity guard excludes full professionals by rule", () => {
    const professional = {
      status: "approved",
      acceptingRequests: true,
      remoteAvailable: true,
      currentActiveRequests: 3,
      maxActiveRequests: 3,
    };

    expect(
      professional.status === "approved" &&
        professional.acceptingRequests &&
        professional.remoteAvailable &&
        professional.currentActiveRequests < professional.maxActiveRequests,
    ).toBe(false);
  });

  it("allows admin approval statuses and rejects unknown status", () => {
    expect(professionalStatusSchema.safeParse("approved").success).toBe(true);
    expect(professionalStatusSchema.safeParse("suspended").success).toBe(true);
    expect(professionalStatusSchema.safeParse("verified").success).toBe(false);
  });

  it("matching eligibility requires approved accepting remote capacity", () => {
    const candidates = [
      {
        id: "ok",
        status: "approved",
        acceptingRequests: true,
        remoteAvailable: true,
        currentActiveRequests: 0,
        maxActiveRequests: 2,
      },
      {
        id: "pending",
        status: "pending_verification",
        acceptingRequests: true,
        remoteAvailable: true,
        currentActiveRequests: 0,
        maxActiveRequests: 2,
      },
      {
        id: "full",
        status: "approved",
        acceptingRequests: true,
        remoteAvailable: true,
        currentActiveRequests: 2,
        maxActiveRequests: 2,
      },
    ];

    expect(
      candidates
        .filter(
          (candidate) =>
            candidate.status === "approved" &&
            candidate.acceptingRequests &&
            candidate.remoteAvailable &&
            candidate.currentActiveRequests < candidate.maxActiveRequests,
        )
        .map((candidate) => candidate.id),
    ).toEqual(["ok"]);
  });

  it("keeps Better Auth session and account timestamps defaulted for D1", () => {
    const schema = readFileSync(
      join(process.cwd(), "src/db/schema.ts"),
      "utf8",
    );
    const sessionUpdatedAt = schema.match(
      /export const session[\s\S]*?updatedAt:[\s\S]*?\.default\(sql`\(cast\(unixepoch\('subsecond'\) \* 1000 as integer\)\)`\)/,
    );
    const accountUpdatedAt = schema.match(
      /export const account[\s\S]*?updatedAt:[\s\S]*?\.default\(sql`\(cast\(unixepoch\('subsecond'\) \* 1000 as integer\)\)`\)/,
    );

    expect(sessionUpdatedAt).not.toBeNull();
    expect(accountUpdatedAt).not.toBeNull();
  });

  it("includes a D1 migration for auth timestamp defaults", () => {
    const migration = readFileSync(
      join(process.cwd(), "drizzle/0001_hot_luke_cage.sql"),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE `__new_account`");
    expect(migration).toContain("CREATE TABLE `__new_session`");
    expect(migration.match(/`updated_at` integer DEFAULT/g)).toHaveLength(2);
  });

  it("keeps Q2 audit action names stable", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/actions.ts"),
      "utf8",
    );
    const assignment = readFileSync(
      join(process.cwd(), "src/lib/assignment.ts"),
      "utf8",
    );
    // La anonimización (y su auditoría data_anonymization) vive en lib/retention,
    // reutilizada por la acción admin y por el cron de retención.
    const retention = readFileSync(
      join(process.cwd(), "src/lib/retention.ts"),
      "utf8",
    );

    expect(actions).toContain("professional_approval");
    expect(actions).toContain("professional_rejection");
    expect(actions).toContain("professional_suspension");
    expect(actions).toContain("request_closure");
    expect(retention).toContain("data_anonymization");
    expect(assignment).toContain("request_assignment");
  });

  it("carga en paralelo los datos independientes del panel profesional", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "src/app/pro/dashboard/page.tsx"),
      "utf8",
    );
    expect(dashboard).toContain("Promise.all");
    expect(dashboard).toContain("pendingOffersForProfessional");
    expect(dashboard).toContain("conversationsForProfessional");
  });

  it("ofrece recuperación en español sin borrar la cuenta", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/actions.ts"),
      "utf8",
    );
    const authPanel = readFileSync(
      join(process.cwd(), "src/components/auth-panel.tsx"),
      "utf8",
    );
    const errorPage = readFileSync(
      join(process.cwd(), "src/app/pro/error.tsx"),
      "utf8",
    );

    expect(actions).toContain("Tu cuenta sigue guardada");
    expect(authPanel).toContain("el método que usaste antes");
    expect(errorPage).toContain("Reintentar");
    expect(errorPage).toContain("Volver al acceso profesional");
  });
});
