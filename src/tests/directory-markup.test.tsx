import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { metadata as adminMetadata } from "@/app/admin/layout";
import HelpPage, { metadata as helpMetadata } from "@/app/ayuda/page";
import ProfesionalesPage, { metadata } from "@/app/profesionales/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import type { FeedProfessional } from "@/lib/feed";
import type { Organization } from "@/lib/organizations";
import { absoluteUrl } from "@/lib/site";

const fixtures = vi.hoisted(() => ({
  professionals: [] as FeedProfessional[],
  organizations: [] as Organization[],
}));
vi.mock("@/lib/feed", () => ({
  getCachedFeedProfessionals: async () => fixtures.professionals,
}));
vi.mock("@/lib/partners", () => ({
  getCachedPublishedPartners: async () => [],
  partnersToOrganizations: () => [],
}));
vi.mock("@/lib/organizations", async (original) => ({
  ...(await original<typeof import("@/lib/organizations")>()),
  publishedOrganizations: fixtures.organizations,
}));
// La página y el filtrado son reales; se aíslan las tarjetas de sus acciones
// de contacto, sin enviar mensajes ni incluir datos de personas reales.
vi.mock("@/app/profesionales/professional-card", () => ({
  FeedProfessionalCard: ({
    professional,
  }: {
    professional: FeedProfessional;
  }) => (
    <article data-testid="result">
      <h3>{professional.name}</h3>
    </article>
  ),
}));
vi.mock("@/components/organization-card", () => ({
  OrganizationCard: ({ organization }: { organization: Organization }) => (
    <article data-testid="result">
      <h3>{organization.name}</h3>
    </article>
  ),
}));
vi.mock("@/components/emergency-notice", () => ({
  EmergencyNotice: () => null,
}));
vi.mock("@/components/help-request-form", () => ({
  HelpRequestForm: () => null,
}));
vi.mock("@/components/emergency-resources", () => ({
  EmergencyPriorityBar: () => null,
  EmergencyResourcesDirectory: () => null,
}));
vi.mock("@/components/quick-exit", () => ({
  QuickExit: () => null,
  QuickExitNote: () => null,
}));

const names = [
  "Profesional ficticio Álamo",
  "Profesional ficticio Brezal",
  "Auxiliar ficticio Cedro",
  "Organización ficticia Duna",
  "Organización ficticia Estepa",
];
function pro(
  index: number,
  overrides: Partial<FeedProfessional> = {},
): FeedProfessional {
  return {
    id: `perfil-ficticio-${index}`,
    name: names[index],
    city: null,
    country: null,
    languages: ["es"],
    supportAreas: ["ansiedad_depresion"],
    shortBio: null,
    photo: null,
    phone: null,
    landline: null,
    email: `perfil-${index}@example.test`,
    emailPublic: false,
    crisisExperience: false,
    nonClinicalHelper: false,
    offersPaidServices: false,
    inPersonAvailable: false,
    acceptingRequests: true,
    currentActiveRequests: 0,
    maxActiveRequests: 1,
    ...overrides,
  };
}
beforeEach(() => {
  fixtures.professionals.splice(
    0,
    Infinity,
    pro(0),
    pro(1, { supportAreas: ["duelo"], currentActiveRequests: 1 }),
    pro(2, { nonClinicalHelper: true, supportAreas: ["orientacion_general"] }),
  );
  fixtures.organizations.splice(
    0,
    Infinity,
    {
      id: "org-ficticia-3",
      name: names[3],
      specialties: ["autismo"],
      services: ["psicologia"],
      virtual24h: true,
    },
    {
      id: "org-ficticia-4",
      name: names[4],
      specialties: [],
      services: ["radiologia"],
      virtual24h: false,
    },
  );
});

type ItemList = {
  "@type": string;
  url: string;
  numberOfItems: number;
  itemListElement: { position: number; name: string }[];
};
async function rendered(
  params: Record<string, string | undefined> = {},
  path = "/profesionales",
) {
  const page = path === "/ayuda" ? HelpPage : ProfesionalesPage;
  const html = renderToStaticMarkup(
    await page({ searchParams: Promise.resolve(params) }),
  );
  const visible = [
    ...html.matchAll(/<article data-testid="result"><h3>(.*?)<\/h3>/g),
  ].map((match) => match[1]);
  const schemas: ItemList[] = [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/g,
    ),
  ].map((match) => JSON.parse(match[1]));
  return {
    html,
    visible,
    itemList: schemas.find((node) => node["@type"] === "ItemList"),
    itemLists: schemas.filter((node) => node["@type"] === "ItemList"),
  };
}

describe("catálogo: resultados visibles y JSON-LD", () => {
  it.each([
    { label: "sin filtros", params: {}, expected: names },
    {
      label: "consulta por nombre y acento",
      params: { q: "alamo" },
      expected: [names[0]],
    },
    {
      label: "consulta de organización",
      params: { q: "duna" },
      expected: [names[3]],
    },
    {
      label: "tipo psicólogo",
      params: { tipo: "psicologo" },
      expected: names.slice(0, 2),
    },
    {
      label: "tipo auxiliar",
      params: { tipo: "auxiliar" },
      expected: [names[2]],
    },
    {
      label: "tipo organización",
      params: { tipo: "organizacion" },
      expected: names.slice(3),
    },
    {
      label: "área de apoyo",
      params: { tema: "area:duelo" },
      expected: [names[1]],
    },
    {
      label: "servicio de organización",
      params: { tema: "svc:radiologia" },
      expected: [names[4]],
    },
    {
      label: "enfoque de organización",
      params: { tema: "spec:autismo" },
      expected: [names[3]],
    },
    {
      label: "disponibilidad",
      params: { disp: "1" },
      expected: [names[0], names[2], names[3]],
    },
    {
      label: "filtros combinados",
      params: {
        q: "alamo",
        tipo: "psicologo",
        tema: "area:ansiedad_depresion",
        disp: "1",
      },
      expected: [names[0]],
    },
    {
      label: "tipo desconocido",
      params: { tipo: "desconocido" },
      expected: names,
    },
  ])("$label", async ({ params, expected }) => {
    const result = await rendered(params);
    expect(result.visible).toEqual(expected);
    expect(result.itemList?.itemListElement.map((item) => item.name)).toEqual(
      result.visible,
    );
    expect(result.itemList?.numberOfItems).toBe(result.visible.length);
    expect(
      result.itemList?.itemListElement.map((item) => item.position),
    ).toEqual(expected.map((_, index) => index + 1));
    expect(result.itemList?.url).toBe(absoluteUrl("/profesionales"));
    expect(result.itemLists).toHaveLength(1);
    for (const item of result.itemList?.itemListElement ?? [])
      expect(Object.keys(item).sort()).toEqual(["@type", "name", "position"]);
  });

  it("omite ItemList cuando los filtros no encuentran resultados", async () => {
    const result = await rendered({ q: "consulta-inexistente-ficticia" });
    expect(result.visible).toEqual([]);
    expect(result.itemList).toBeUndefined();
    expect(result.html).toContain("No hay resultados para tu búsqueda");
  });

  it("omite ItemList cuando aún no hay recursos publicados", async () => {
    fixtures.professionals.splice(0);
    fixtures.organizations.splice(0);
    const result = await rendered();
    expect(result.visible).toEqual([]);
    expect(result.itemList).toBeUndefined();
  });

  it("conserva canonical y Open Graph sin consultas ni filtros", () => {
    expect(metadata.alternates?.canonical).toBe("/profesionales");
    expect(metadata.openGraph?.url).toBe("/profesionales");
    expect(helpMetadata.alternates?.canonical).toBe("/ayuda");
    expect(helpMetadata.openGraph?.url).toBe("/ayuda");
  });

  it.each([
    { params: { q: "alamo" }, expected: [names[0]] },
    {
      params: { tipo: "organizacion", tema: "svc:psicologia", disp: "1" },
      expected: [names[3]],
    },
    { params: { q: "consulta-inexistente-ficticia" }, expected: [] },
  ])("Ayuda Terremoto usa un único ItemList de sus resultados: $params", async ({
    params,
    expected,
  }) => {
    const result = await rendered(params, "/ayuda");
    expect(result.visible).toEqual(expected);
    expect(result.itemLists).toHaveLength(expected.length ? 1 : 0);
    if (expected.length) {
      expect(result.itemList?.itemListElement.map((item) => item.name)).toEqual(
        expected,
      );
      expect(result.itemList?.url).toBe(absoluteUrl("/ayuda"));
    }
    expect(result.html).toContain("Gratis");
  });
});

describe("auditoría de destinos administrativos privados", () => {
  it.each([
    "/admin/admision",
    "/admin/crm",
    "/admin/consola",
  ])("%s está cubierta por la política privada del layout", (path) => {
    expect(adminMetadata.robots).toEqual({ index: false, follow: false });
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = Array.isArray(rule.disallow)
      ? rule.disallow
      : [rule.disallow];
    expect(disallow.some((prefix) => prefix && path.startsWith(prefix))).toBe(
      true,
    );
    expect(sitemap().map((entry) => entry.url)).not.toContain(
      absoluteUrl(path),
    );
  });
});
