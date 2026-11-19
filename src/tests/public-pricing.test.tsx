import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfessionalLanding from "@/app/para-psicologos/page";
import FreeAccessGuide from "@/app/recursos/psicologo-online-gratis-venezuela/page";
import SafetyPage from "@/app/seguridad/page";
import TermsPage from "@/app/terminos/page";
import { publicPricingCopy } from "@/lib/practice/public-pricing";

vi.mock("@/components/click-tracker", () => ({ trackConversion: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

function text(element: React.ReactElement) {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}
const pages = () =>
  [
    ProfessionalLanding(),
    SafetyPage(),
    TermsPage(),
    FreeAccessGuide(),
  ] as React.ReactElement[];

describe("precios de la web pública", () => {
  it("con el cobro apagado conserva exactamente los textos publicados", () => {
    vi.stubEnv("NIDO_PUBLIC_PRICING", "legacy");
    const [landing, safety, terms, guide] = pages().map(text);
    expect(landing).toContain(" Prueba de 90 días ");
    expect(landing).toContain(" Sin tarjeta ");
    expect(landing).toContain(
      "Empieza con 90 días del software sin tarjeta. Después, 10 USD al mes si decides suscribirte. La prueba no inicia cobros automáticamente.",
    );
    expect(safety).toContain(
      "El software para profesionales tiene un plan de 10 USD al mes y una prueba de 90 días sin tarjeta tras la aprobación del perfil. Ese plan no fija el precio de las consultas.",
    );
    expect(terms).toContain(
      "La prueba del software profesional dura 90 días desde su activación y no inicia cobros por sí sola. Contratar una suscripción requiere aceptar el importe y la frecuencia. Los servicios",
    );
    expect(guide).toContain(
      "tiene un plan de 10 USD al mes y una prueba de 90 días sin tarjeta, que comienza tras la aprobación del perfil. Ese plan corresponde",
    );
  });

  it("con el cobro encendido muestra los importes reales y ninguna prueba para altas nuevas", () => {
    vi.stubEnv("NIDO_PUBLIC_PRICING", "live");
    const all = pages().map(text).join(" ");
    expect(all).not.toContain("10 USD");
    expect(all).not.toContain("sin tarjeta");
    expect(all).toContain(
      "14,99 al mes o 99,99 al año, en dólares, euros o libras",
    );
    expect(all).toContain(
      "Los profesionales que ya estaban en Nido antes de la suscripción tienen 90 días gratis",
    );
  });

  it("el build lee el mismo interruptor que el Worker", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const wrangler = readFileSync(
      join(process.cwd(), "wrangler.jsonc"),
      "utf8",
    );
    expect(config).toContain("NIDO_MEMBERSHIP_BILLING_ENABLED");
    expect(config).toContain(
      "env: { NIDO_PUBLIC_PRICING: publicPricingMode() }",
    );
    // Con el cobro encendido en producción, el build muestra los importes reales.
    expect(wrangler).toMatch(/"NIDO_MEMBERSHIP_BILLING_ENABLED":\s*"true"/);
    expect(publicPricingCopy(false).ctaText).toContain("10 USD");
    expect(publicPricingCopy(true).ctaText).toContain("14,99");
  });
});
