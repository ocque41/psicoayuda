import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  absoluteUrl,
  HOME_FAQ,
  SITE_DESCRIPTION,
  SITE_TITLE_DEFAULT,
  SITE_URL,
} from "@/lib/site";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("SEO — configuración del sitio", () => {
  it("usa una URL canónica sin barra final", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
    expect(SITE_URL.startsWith("https://")).toBe(true);
  });

  it("apunta el título por defecto a la consulta objetivo", () => {
    expect(SITE_TITLE_DEFAULT.toLowerCase()).toContain("ayuda psicológica");
    expect(SITE_TITLE_DEFAULT.toLowerCase()).toContain("venezuela");
  });

  it("mantiene la descripción dentro del límite indexable (~160)", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(70);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("expone un mínimo de preguntas frecuentes para el FAQPage", () => {
    expect(HOME_FAQ.length).toBeGreaterThanOrEqual(5);
    for (const item of HOME_FAQ) {
      expect(item.question.length).toBeGreaterThan(0);
      expect(item.answer.length).toBeGreaterThan(0);
    }
  });
});

describe("SEO — robots.txt", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

  it("permite el rastreo general", () => {
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
  });

  it("bloquea rutas privadas y transaccionales", () => {
    const disallow = Array.isArray(rules.disallow)
      ? rules.disallow
      : [rules.disallow];
    for (const path of [
      "/admin",
      "/api/",
      "/pro/dashboard",
      "/pro/onboarding",
      "/ayuda/gracias",
    ]) {
      expect(disallow).toContain(path);
    }
  });

  it("declara el sitemap y el host absolutos", () => {
    expect(result.sitemap).toBe(absoluteUrl("/sitemap.xml"));
    expect(result.host).toBe(SITE_URL);
  });
});

describe("SEO — sitemap.xml", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it("incluye todas las rutas públicas indexables", () => {
    for (const path of [
      "/",
      "/ayuda",
      "/recursos",
      "/recursos/psicologo-online-gratis-venezuela",
      "/pro",
      "/privacidad",
      "/terminos",
    ]) {
      expect(urls).toContain(absoluteUrl(path));
    }
  });

  it("excluye rutas privadas o transaccionales", () => {
    expect(urls).not.toContain(absoluteUrl("/admin"));
    expect(urls).not.toContain(absoluteUrl("/pro/dashboard"));
    expect(urls).not.toContain(absoluteUrl("/ayuda/gracias"));
  });

  it("prioriza la portada y declara alternados hreflang", () => {
    const home = entries.find((entry) => entry.url === absoluteUrl("/"));
    expect(home?.priority).toBe(1);
    expect(home?.alternates?.languages?.["es-VE"]).toBe(absoluteUrl("/"));
  });
});

describe("SEO — metadatos del layout raíz", () => {
  const layout = read("src/app/layout.tsx");

  it("define metadataBase, plantilla de título y canonical", () => {
    expect(layout).toContain("metadataBase");
    expect(layout).toContain("template");
    expect(layout).toContain("canonical");
  });

  it("declara Open Graph, Twitter y directivas de robots", () => {
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
    expect(layout).toContain("index: true");
  });

  it("expone el viewport con theme-color de marca", () => {
    expect(layout).toContain("export const viewport");
    expect(layout).toContain("themeColor");
  });

  it("inyecta los datos estructurados del sitio", () => {
    expect(layout).toContain("SiteJsonLd");
  });

  it("soporta la verificación de Google Search Console por variable", () => {
    expect(layout).toContain("verification");
    expect(layout).toContain("SITE_GOOGLE_VERIFICATION");
  });
});

describe("SEO — contenido y datos estructurados de la portada", () => {
  const home = read("src/app/page.tsx");
  const structured = read("src/components/structured-data.tsx");

  it("optimiza el H1 con la consulta objetivo", () => {
    const h1 = home.match(/<h1>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    const text = (h1?.[1] ?? "").toLowerCase();
    expect(text).toContain("ayuda psicológica");
    expect(text).toContain("venezuela");
  });

  it("renderiza la sección de preguntas frecuentes", () => {
    expect(home).toContain("HOME_FAQ");
    expect(home).toContain("HomeJsonLd");
  });

  it("declara los tipos de schema.org esperados (YMYL)", () => {
    expect(structured).toContain('"@type": "NGO"');
    expect(structured).toContain('"@type": "WebSite"');
    expect(structured).toContain('"@type": "Service"');
    expect(structured).toContain('"@type": "FAQPage"');
    expect(structured).toContain('"@type": "MedicalWebPage"');
  });
});

describe("SEO — archivos de metadatos requeridos", () => {
  it("genera sitemap, robots, manifest, iconos e imágenes sociales", () => {
    for (const file of [
      "src/app/sitemap.ts",
      "src/app/robots.ts",
      "src/app/manifest.ts",
      "src/app/icon.svg",
      "src/app/apple-icon.tsx",
      "src/app/opengraph-image.tsx",
      "src/app/twitter-image.tsx",
    ]) {
      expect(existsSync(join(process.cwd(), file))).toBe(true);
    }
  });

  it("marca las rutas privadas como no indexables", () => {
    for (const file of [
      "src/app/ayuda/gracias/page.tsx",
      "src/app/admin/page.tsx",
      "src/app/pro/dashboard/page.tsx",
      "src/app/pro/onboarding/page.tsx",
      "src/app/not-found.tsx",
    ]) {
      expect(read(file)).toContain("index: false");
    }
  });
});

describe("SEO — migas de pan (BreadcrumbList)", () => {
  it("emite datos estructurados BreadcrumbList desde una única fuente", () => {
    const component = read("src/components/breadcrumbs.tsx");
    expect(component).toContain('"@type": "BreadcrumbList"');
    expect(component).toContain('"@type": "ListItem"');
  });

  it("añade migas a las páginas de recursos de cola larga", () => {
    for (const file of [
      "src/app/recursos/psicologo-online-gratis-venezuela/page.tsx",
      "src/app/recursos/ansiedad-despues-del-terremoto/page.tsx",
      "src/app/recursos/duelo-perdida-de-un-ser-querido/page.tsx",
      "src/app/recursos/depresion-senales-y-ayuda/page.tsx",
      "src/app/recursos/ataque-de-panico-que-hacer/page.tsx",
      "src/app/recursos/insomnio-como-dormir-mejor/page.tsx",
      "src/app/recursos/soledad-que-hacer/page.tsx",
      "src/app/recursos/estres-economico-y-salud-mental/page.tsx",
      "src/app/recursos/estres-postraumatico-tept/page.tsx",
      "src/app/recursos/acompanar-a-alguien-en-crisis/page.tsx",
      "src/app/recursos/apoyo-emocional-anonimo/page.tsx",
      "src/app/recursos/ayuda-psicologica-para-ninos/page.tsx",
      "src/app/recursos/venezolanos-en-el-exterior/page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("<Breadcrumbs");
      expect(source).toContain("<GuideJsonLd");
    }
  });
});
