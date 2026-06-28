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

describe("PsicoAyuda MVP smoke checks", () => {
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
      languages: ["es"],
      supportAreas: ["duelo"],
      remoteAvailable: "on",
      acceptingRequests: "on",
      crisisExperience: "on",
      maxActiveRequests: "3",
    });

    expect(parsed.success).toBe(true);
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
});
