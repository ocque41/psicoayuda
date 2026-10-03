import { needLabels } from "@/lib/constants";
import {
  AREA_KEYWORDS,
  detectCrisis,
  normalize as normalizeText,
} from "@/lib/search";

export type OrientationInput = {
  text: string;
  country: string;
  language: string;
  ageGroup: "adult" | "minor";
  immediateDanger: "yes" | "unsure" | "no";
  forWhom: "self" | "other";
};
export type OrientationProfile = {
  id: string;
  name: string;
  supportAreas: string[];
  languages: string[];
  eligibleCountries: string[];
  available: boolean;
  supportsMinors: boolean;
};
export function orient(input: OrientationInput) {
  const text = normalizeText(input.text);
  const safetySignal =
    input.immediateDanger !== "no" ||
    detectCrisis(text) ||
    /acabar conmigo|quitar.{0,12}vida|autolesion|no quiero estar|desaparecer|ya no estar/.test(
      text,
    );
  const areas = Object.entries(AREA_KEYWORDS)
    .filter(([, words]) =>
      normalizeText(words)
        .split(" ")
        .some(
          (word) => word.length > 3 && new RegExp(`\\b${word}\\b`).test(text),
        ),
    )
    .map(([key]) => key);
  if (input.ageGroup === "minor" && !areas.includes("infancia_adolescencia"))
    areas.unshift("infancia_adolescencia");
  const reviewReasons: string[] = [];
  if (safetySignal)
    reviewReasons.push(
      "Se mencionó peligro o autolesión; requiere atención humana.",
    );
  if (input.ageGroup === "minor")
    reviewReasons.push(
      "Es necesario confirmar la edad, representación y condiciones de atención.",
    );
  if (
    /esquizofren|psicosis|psicot|desrealiz|desperson|disocia|embaraz|posparto|postparto|abuso|violencia/.test(
      text,
    )
  )
    reviewReasons.push(
      "Conviene revisar las necesidades y experiencia del profesional antes de conectar.",
    );
  return {
    safetySignal,
    areas: areas.length ? areas : ["orientacion_general"],
    reviewReasons,
    needsHumanReview: reviewReasons.length > 0,
    version: "rules-2026-10-02",
  };
}
export function recommend(
  input: OrientationInput,
  profiles: OrientationProfile[],
) {
  const result = orient(input);
  if (result.safetySignal) return { ...result, recommendations: [] };
  const recommendations = profiles
    .filter(
      (p) =>
        p.available &&
        p.languages.includes(input.language) &&
        p.eligibleCountries.includes(input.country) &&
        (input.ageGroup !== "minor" || p.supportsMinors),
    )
    .map((p) => {
      const matched = p.supportAreas.filter((area) =>
        result.areas.includes(area),
      );
      return {
        id: p.id,
        name: p.name,
        score: matched.length,
        reasons: matched.map(
          (area) => needLabels[area as keyof typeof needLabels] ?? area,
        ),
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3);
  return { ...result, recommendations };
}
