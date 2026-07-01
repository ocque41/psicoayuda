import { describe, expect, it } from "vitest";
import type { FeedProfessional } from "@/lib/feed";
import {
  blobMatchesQuery,
  buildSearchBlob,
  detectCrisis,
  queryTokens,
} from "@/lib/search";

// Profesional mínimo: buildSearchBlob solo lee estos campos de búsqueda.
function fakePro(overrides: Partial<FeedProfessional> = {}): FeedProfessional {
  return {
    id: "1",
    name: "Ana",
    city: "Caracas",
    country: "Venezuela",
    supportAreas: ["ansiedad_depresion"],
    languages: ["es"],
    shortBio: "",
    crisisExperience: false,
    ...overrides,
  } as FeedProfessional;
}

describe("queryTokens", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(queryTokens("Niño")).toEqual(["nino"]);
  });

  it("descarta palabras vacías y de relleno de intención", () => {
    expect(queryTokens("no puedo dormir")).toEqual(["dormir"]);
    expect(queryTokens("problemas de pareja")).toEqual(["pareja"]);
    expect(queryTokens("control de la ira")).toEqual(["ira"]);
    expect(queryTokens("manejo de la ansiedad")).toEqual(["ansiedad"]);
    expect(queryTokens("busco psicólogo")).toEqual(["psicologo"]);
  });
});

describe("términos cabecera: todo voluntario debe aparecer", () => {
  const blob = buildSearchBlob(fakePro());
  // Los términos por los que el sitio quiere posicionar #1 en Venezuela: si el
  // directorio devolviera cero para estos, el SEO no sirve de nada.
  for (const q of [
    "salud mental",
    "ayuda psicológica",
    "psicólogo",
    "psicólogo gratis",
    "terapia online",
    "psicólogo a distancia",
    "salud mental venezuela",
  ]) {
    it(`encuentra profesionales para "${q}"`, () => {
      expect(blobMatchesQuery(blob, q)).toBe(true);
    });
  }
});

describe("sinónimos: cada síntoma enruta a su especialidad", () => {
  const anx = buildSearchBlob(
    fakePro({ supportAreas: ["ansiedad_depresion"] }),
  );
  const fam = buildSearchBlob(fakePro({ supportAreas: ["familia_pareja"] }));
  const kids = buildSearchBlob(
    fakePro({ supportAreas: ["infancia_adolescencia"] }),
  );

  it("burnout / insomnio / fobia social / ira / estrés económico → ansiedad_depresion", () => {
    for (const q of [
      "burnout",
      "no puedo dormir",
      "fobia social",
      "control de la ira",
      "estrés económico",
    ]) {
      expect(blobMatchesQuery(anx, q)).toBe(true);
    }
  });

  it("problemas de pareja → familia_pareja", () => {
    expect(blobMatchesQuery(fam, "problemas de pareja")).toBe(true);
  });

  it("psicólogo infantil / niños → infancia_adolescencia", () => {
    expect(blobMatchesQuery(kids, "psicólogo infantil")).toBe(true);
    expect(blobMatchesQuery(kids, "niños")).toBe(true);
  });
});

describe("detección de crisis (seguridad)", () => {
  it("se dispara con expresiones explícitas de autolesión/suicidio", () => {
    for (const q of [
      "quiero morir",
      "me quiero morir",
      "suicidio",
      "quiero cortarme",
      "no quiero vivir",
      "acabar con mi vida",
    ]) {
      expect(detectCrisis(q)).toBe(true);
    }
  });

  it("no se dispara con consultas normales", () => {
    for (const q of ["ansiedad", "duelo", "hola", "psicólogo para niños"]) {
      expect(detectCrisis(q)).toBe(false);
    }
  });
});
