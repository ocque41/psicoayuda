import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PsychologistsLandingPage from "@/app/psicologos/page";
import PrivacyAccessGuide from "@/app/recursos/apoyo-emocional-anonimo/page";
import FreeAccessGuide from "@/app/recursos/psicologo-online-gratis-venezuela/page";
import AbroadAccessGuide from "@/app/recursos/venezolanos-en-el-exterior/page";
import {
  GuideJsonLd,
  HomeJsonLd,
  SiteJsonLd,
} from "@/components/structured-data";
import { absoluteUrl, HOME_FAQ, SITE_URL } from "@/lib/site";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
// Conserva AuthPanel real para verificar el botón renderizado, sin proveedor
// remoto ni acciones de cuenta. Ningún evento de acceso se ejecuta en SSR.
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("@/app/actions-account", () => ({ repararRegistroHuerfano: vi.fn() }));
vi.mock("@/components/click-tracker", () => ({ trackConversion: vi.fn() }));

beforeEach(() => {
  mocks.session.mockResolvedValue(null);
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("entrada pública al voluntariado", () => {
  it.each([
    [undefined, undefined, false],
    ["id-ficticio", "", false],
    ["", "secreto-ficticio", false],
    ["   ", "secreto-ficticio", false],
    ["id-ficticio", "   ", false],
    [" id-ficticio ", " secreto-ficticio ", true],
  ])("alinea texto y Google con configuración %s / %s", async (id, secret, enabled) => {
    vi.stubEnv("GOOGLE_CLIENT_ID", id);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", secret);
    const html = renderToStaticMarkup(await PsychologistsLandingPage());
    expect(html.includes("Continuar con Google")).toBe(enabled);
    expect(html.includes("Entras con Google o con tu correo.")).toBe(enabled);
    expect(html).toContain('type="email"');
    expect(html).not.toContain("id-ficticio");
    expect(html).not.toContain("secreto-ficticio");
    if (!enabled) expect(html).toContain("Entras con tu correo.");
  });

  it("explica las notas y separa el programa gratuito del software", async () => {
    const html = renderToStaticMarkup(await PsychologistsLandingPage());
    expect(html).toContain("La atención en este programa es gratuita.");
    expect(html).toContain("notas privadas cifradas en servidor");
    expect(html).toContain("almacenamiento no es cifrado de extremo a extremo");
    expect(html).not.toContain("no guardamos historias clínicas");
    expect(html).toContain('href="/privacidad"');
    expect(html).toContain('href="/para-psicologos"');
    expect(html).toContain("no verifica tu identidad ni tus credenciales");
    expect(html).toContain("Nido no es un servicio de emergencias");
  });

  it("conserva el acceso de una sesión sin volver a mostrar el formulario", async () => {
    mocks.session.mockResolvedValue({ user: { id: "cuenta-ficticia" } });
    const html = renderToStaticMarkup(await PsychologistsLandingPage());
    expect(html).toContain('href="/pro/onboarding"');
    expect(html).toContain('href="/pro/dashboard"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("cuenta-ficticia");
  });
});

type JsonNode = {
  "@type": string;
  url?: string;
  primaryImageOfPage?: { "@type": string; url: string };
  offers?: { price: number; priceCurrency: string; availability?: string };
  potentialAction?: { target: { urlTemplate: string } };
  mainEntity?: { name: string; acceptedAnswer: { text: string } }[];
};
function json(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  const serialized = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  expect(serialized).toBeTruthy();
  return JSON.parse(serialized || "{}");
}

describe("semántica del sitio público", () => {
  it.each([
    ["/recursos/psicologo-online-gratis-venezuela", FreeAccessGuide],
    ["/recursos/apoyo-emocional-anonimo", PrivacyAccessGuide],
    ["/recursos/venezolanos-en-el-exterior", AbroadAccessGuide],
  ])("presenta %s como acceso sin revisión médica ni publicación inventada", (path, Page) => {
    const node = json(<Page />);
    expect(node["@type"]).toBe("WebPage");
    expect(node.url).toBe(absoluteUrl(path));
    expect(node.dateModified).toBe("2026-10-06");
    for (const property of [
      "datePublished",
      "reviewedBy",
      "lastReviewed",
      "audience",
    ]) {
      expect(node).not.toHaveProperty(property);
    }
    expect(renderToStaticMarkup(<Page />)).toContain(
      "Elaboración asistida por IA",
    );
  });

  it("describe la organización y el buscador sin acreditaciones inventadas", () => {
    const nodes: JsonNode[] = json(<SiteJsonLd />)["@graph"];
    const organization = nodes.find((node) => node["@type"] === "Organization");
    expect(organization?.url).toBe(SITE_URL);
    for (const property of [
      "nonprofitStatus",
      "address",
      "aggregateRating",
      "review",
      "hasCredential",
    ])
      expect(organization).not.toHaveProperty(property);
    const website = nodes.find((node) => node["@type"] === "WebSite");
    expect(website?.potentialAction?.target.urlTemplate).toBe(
      `${SITE_URL}/profesionales?q={search_term_string}`,
    );
  });

  it("mantiene portada, servicio gratuito y FAQ coherentes con sus destinos", () => {
    const nodes: JsonNode[] = json(<HomeJsonLd />)["@graph"];
    const page = nodes.find((node) => node["@type"] === "WebPage");
    expect(page?.url).toBe(SITE_URL);
    expect(page?.primaryImageOfPage).toEqual({
      "@type": "ImageObject",
      url: absoluteUrl("/opengraph-image"),
    });
    const service = nodes.find((node) => node["@type"] === "Service");
    expect(service?.url).toBe(absoluteUrl("/ayuda"));
    expect(service?.offers?.price).toBe(0);
    expect(service?.offers).not.toHaveProperty("availability");
    const faq = nodes.find((node) => node["@type"] === "FAQPage");
    expect(
      faq?.mainEntity?.map((item) => ({
        question: item.name,
        answer: item.acceptedAnswer.text,
      })),
    ).toEqual(HOME_FAQ);
  });

  it("no acredita una revisión clínica de las guías", () => {
    const guide = json(
      <GuideJsonLd
        path="/recursos"
        name="Guía ficticia"
        description="Información educativa"
      />,
    );
    expect(guide["@type"]).toBe("MedicalWebPage");
    expect(guide).not.toHaveProperty("lastReviewed");
    expect(guide).not.toHaveProperty("reviewedBy");
  });

  it("ofrece fuentes de IA para software y programa gratuito sin destinos privados", () => {
    const llms = readFileSync(join(process.cwd(), "public/llms.txt"), "utf8");
    const paths = [...llms.matchAll(/\]\((https:[^)]+)\)/g)].map(
      (match) => new URL(match[1]).pathname,
    );
    expect(paths).toContain("/para-psicologos");
    expect(paths).toContain("/ayuda");
    expect(paths).toContain("/psicologos");
    expect(
      paths.some((path) =>
        /^\/(?:pro\/|mi(?:\/|$)|admin|c\/|api\/)/.test(path),
      ),
    ).toBe(false);
    expect(llms).toContain(
      "ese almacenamiento no es cifrado de extremo a extremo",
    );
  });
});
