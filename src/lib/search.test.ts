import { describe, expect, it } from "vitest";
import type { FeedProfessional } from "@/lib/feed";
import type { Organization } from "@/lib/organizations";
import {
  blobMatchesQuery,
  buildOrgSearchBlob,
  buildSearchBlob,
  detectCrisis,
  matchesFilters,
  organizationMatchesSupport,
  professionalMatchesSupport,
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

// Organización mínima especializada en autismo (el caso real del equipo).
function fakeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Centro Ejemplo",
    tagline: "Especialistas en autismo",
    specialties: ["autismo"],
    services: ["psiquiatria", "neuropsicologia", "pediatria"],
    virtual24h: true,
    ...overrides,
  } as Organization;
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
    "psicoterapia",
    "consejería",
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

  it("burnout / insomnio / fobia social / ira / estrés económico / ánimo bajo → ansiedad_depresion", () => {
    for (const q of [
      "burnout",
      "no puedo dormir",
      "fobia social",
      "control de la ira",
      "estrés económico",
      "desánimo",
      "desmotivación",
      "llorar",
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

describe("matchesFilters (especialidad + disponible ahora)", () => {
  const pro = fakePro({
    supportAreas: ["ansiedad_depresion", "duelo"],
    acceptingRequests: true,
    currentActiveRequests: 1,
    maxActiveRequests: 3,
  } as Partial<FeedProfessional>);

  it("un filtro vacío no restringe", () => {
    expect(matchesFilters(pro, {})).toBe(true);
  });

  it("especialidad: coincide solo si el pro tiene esa área", () => {
    expect(matchesFilters(pro, { area: "ansiedad_depresion" })).toBe(true);
    expect(matchesFilters(pro, { area: "duelo" })).toBe(true);
    expect(matchesFilters(pro, { area: "adicciones" })).toBe(false);
  });

  it("disponible ahora: exige cupo libre y aceptar solicitudes", () => {
    expect(matchesFilters(pro, { onlyAvailable: true })).toBe(true);
    const full = fakePro({
      acceptingRequests: true,
      currentActiveRequests: 3,
      maxActiveRequests: 3,
    } as Partial<FeedProfessional>);
    expect(matchesFilters(full, { onlyAvailable: true })).toBe(false);
    const paused = fakePro({
      acceptingRequests: false,
      currentActiveRequests: 0,
      maxActiveRequests: 3,
    } as Partial<FeedProfessional>);
    expect(matchesFilters(paused, { onlyAvailable: true })).toBe(false);
  });

  it("combina especialidad y disponibilidad con AND", () => {
    expect(matchesFilters(pro, { area: "duelo", onlyAvailable: true })).toBe(
      true,
    );
    expect(
      matchesFilters(pro, { area: "adicciones", onlyAvailable: true }),
    ).toBe(false);
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

describe("búsqueda de organizaciones", () => {
  const blob = buildOrgSearchBlob(fakeOrg());

  it("encuentra la organización por su enfoque y sinónimos", () => {
    for (const q of ["autismo", "tea", "espectro autista", "asperger"]) {
      expect(blobMatchesQuery(blob, q)).toBe(true);
    }
  });

  it("encuentra la organización por sus servicios y sinónimos", () => {
    for (const q of ["psiquiatría", "neuropsicología", "pediatra"]) {
      expect(blobMatchesQuery(blob, q)).toBe(true);
    }
  });

  it("indexa la modalidad 24h y los términos genéricos", () => {
    expect(blobMatchesQuery(blob, "24 horas")).toBe(true);
    expect(blobMatchesQuery(blob, "centro")).toBe(true);
  });

  it("indexa la descripción (p. ej. de una fundación)", () => {
    const withDesc = buildOrgSearchBlob(
      fakeOrg({
        description: "primeros auxilios psicológicos en emergencias",
      }),
    );
    expect(blobMatchesQuery(withDesc, "primeros auxilios")).toBe(true);
    expect(blobMatchesQuery(withDesc, "emergencias")).toBe(true);
  });
});

describe("filtros del directorio de apoyo unificado", () => {
  const org = fakeOrg();
  const psy = fakePro({ id: "p", nonClinicalHelper: false });
  const aux = fakePro({ id: "a", nonClinicalHelper: true });

  it("el tipo separa personas de organizaciones", () => {
    expect(professionalMatchesSupport(psy, { type: "psicologo" })).toBe(true);
    expect(professionalMatchesSupport(aux, { type: "psicologo" })).toBe(false);
    expect(professionalMatchesSupport(aux, { type: "auxiliar" })).toBe(true);
    expect(professionalMatchesSupport(psy, { type: "organizacion" })).toBe(
      false,
    );
    expect(organizationMatchesSupport(org, { type: "organizacion" })).toBe(
      true,
    );
    expect(organizationMatchesSupport(org, { type: "psicologo" })).toBe(false);
  });

  it("el tema por enfoque/servicio solo aplica a organizaciones", () => {
    expect(organizationMatchesSupport(org, { topic: "spec:autismo" })).toBe(
      true,
    );
    expect(
      organizationMatchesSupport(org, { topic: "svc:neuropsicologia" }),
    ).toBe(true);
    expect(organizationMatchesSupport(org, { topic: "svc:radiologia" })).toBe(
      false,
    );
    // Un servicio/enfoque de organización excluye a las personas.
    expect(professionalMatchesSupport(psy, { topic: "spec:autismo" })).toBe(
      false,
    );
    // Un área de persona excluye a las organizaciones.
    expect(
      organizationMatchesSupport(org, { topic: "area:ansiedad_depresion" }),
    ).toBe(false);
  });

  it("el área de persona filtra por especialidad del profesional", () => {
    expect(
      professionalMatchesSupport(psy, { topic: "area:ansiedad_depresion" }),
    ).toBe(true);
    expect(professionalMatchesSupport(psy, { topic: "area:duelo" })).toBe(
      false,
    );
  });

  it("'solo disponibles' mantiene organizaciones 24h y descarta el resto", () => {
    expect(organizationMatchesSupport(org, { onlyAvailable: true })).toBe(true);
    expect(
      organizationMatchesSupport(fakeOrg({ virtual24h: false }), {
        onlyAvailable: true,
      }),
    ).toBe(false);
  });
});
