import { describe, expect, it } from "vitest";
import { rankProfessionalsForRequest, scoreProfessional } from "@/lib/matching";

type Candidate = Parameters<typeof scoreProfessional>[0] & { id: string };

function professional(
  overrides: Partial<Candidate> & { id: string },
): Candidate {
  return {
    languages: JSON.stringify(["es"]),
    supportAreas: JSON.stringify(["duelo"]),
    crisisExperience: false,
    currentActiveRequests: 0,
    maxActiveRequests: 3,
    ...overrides,
  };
}

const request = {
  language: "es",
  needCategory: "duelo",
  urgency: "alta",
} as const;

describe("scoreProfessional", () => {
  it("adds language, support area, crisis, and remaining-capacity points", () => {
    const score = scoreProfessional(
      professional({
        id: "a",
        crisisExperience: true,
        currentActiveRequests: 1,
        maxActiveRequests: 3,
      }),
      request,
    );

    // 30 (es) + 20 (duelo) + 10 (crisis + alta) + 2 (free capacity)
    expect(score).toBe(62);
  });

  it("does not add crisis points without high urgency", () => {
    const score = scoreProfessional(
      professional({ id: "a", crisisExperience: true, maxActiveRequests: 1 }),
      { language: "es", needCategory: "duelo", urgency: "media" },
    );

    // 30 (es) + 20 (duelo) + 0 (crisis but not alta) + 1 (free capacity)
    expect(score).toBe(51);
  });
});

describe("rankProfessionalsForRequest", () => {
  it("orders by score descending without a query per request", () => {
    const ranked = rankProfessionalsForRequest(
      [
        professional({ id: "low", languages: JSON.stringify(["en"]) }), // no es
        professional({
          id: "high",
          crisisExperience: true,
          currentActiveRequests: 1,
        }),
        professional({ id: "mid", supportAreas: JSON.stringify([]) }), // no area
      ],
      request,
    );

    expect(ranked.map((entry) => entry.professional.id)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  it("breaks score ties by lower current load", () => {
    const ranked = rankProfessionalsForRequest(
      [
        professional({
          id: "busy",
          currentActiveRequests: 2,
          maxActiveRequests: 5,
        }),
        professional({
          id: "free",
          currentActiveRequests: 0,
          maxActiveRequests: 3,
        }),
      ],
      request,
    );

    // busy: 30 (es) + 20 (duelo) + 3 (5-2 capacity) = 53
    // free: 30 (es) + 20 (duelo) + 3 (3-0 capacity) = 53 → tie, lower load first.
    expect(ranked.map((entry) => entry.professional.id)).toEqual([
      "free",
      "busy",
    ]);
  });

  it("caps results at the requested limit (default 3)", () => {
    const candidates = Array.from({ length: 5 }, (_, index) =>
      professional({ id: `p${index}`, maxActiveRequests: index + 1 }),
    );

    expect(rankProfessionalsForRequest(candidates, request)).toHaveLength(3);
    expect(rankProfessionalsForRequest(candidates, request, 2)).toHaveLength(2);
  });

  it("returns an empty list when there are no candidates", () => {
    expect(rankProfessionalsForRequest([], request)).toEqual([]);
  });
});
