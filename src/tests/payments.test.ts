import { afterEach, describe, expect, it } from "vitest";
import {
  getPlatformFeeCents,
  isStripeSupportedCountry,
  stripeCountryCode,
} from "@/lib/payments/config";
import { formatEuros, sessionPackageSchema } from "@/lib/payments/packages";

describe("configuración de pagos", () => {
  afterEach(() => {
    delete process.env.NIDO_PLATFORM_FEE_CENTS;
  });

  it("la comisión por defecto es 5 € (500 céntimos)", () => {
    expect(getPlatformFeeCents()).toBe(500);
  });

  it("permite ajustar la comisión por entorno", () => {
    process.env.NIDO_PLATFORM_FEE_CENTS = "350";
    expect(getPlatformFeeCents()).toBe(350);
  });

  it("ignora valores inválidos y vuelve al default", () => {
    process.env.NIDO_PLATFORM_FEE_CENTS = "no-es-un-numero";
    expect(getPlatformFeeCents()).toBe(500);
  });

  it("países soportados por Stripe Connect (español → ISO)", () => {
    expect(isStripeSupportedCountry("España")).toBe(true);
    expect(stripeCountryCode("España")).toBe("ES");
    expect(isStripeSupportedCountry("Estados Unidos")).toBe(true);
    expect(stripeCountryCode("Estados Unidos")).toBe("US");
    expect(isStripeSupportedCountry("Venezuela")).toBe(false);
    expect(stripeCountryCode("Venezuela")).toBeNull();
    expect(isStripeSupportedCountry(null)).toBe(false);
  });
});

describe("formato de importes", () => {
  it("formatea euros enteros y con decimales", () => {
    expect(formatEuros(2500)).toContain("25");
    expect(formatEuros(2500)).toContain("€");
    expect(formatEuros(2550)).toContain("25");
  });
});

describe("sessionPackageSchema", () => {
  const base = {
    title: "4 sesiones",
    description: "Acompañamiento semanal",
    sessionsCount: "4",
    validityDays: "30",
    priceCents: "25",
  };

  it("convierte el precio en euros a céntimos", () => {
    const result = sessionPackageSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceCents).toBe(2500);
      expect(result.data.sessionsCount).toBe(4);
      expect(result.data.validityDays).toBe(30);
    }
  });

  it("acepta coma decimal y sin vigencia", () => {
    const result = sessionPackageSchema.safeParse({
      ...base,
      priceCents: "25,50",
      validityDays: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceCents).toBe(2550);
      expect(result.data.validityDays).toBeNull();
    }
  });

  it("rechaza precios fuera de rango y títulos muy cortos", () => {
    expect(
      sessionPackageSchema.safeParse({ ...base, priceCents: "5" }).success,
    ).toBe(false);
    expect(
      sessionPackageSchema.safeParse({ ...base, priceCents: "5000" }).success,
    ).toBe(false);
    expect(
      sessionPackageSchema.safeParse({ ...base, title: "ab" }).success,
    ).toBe(false);
    expect(
      sessionPackageSchema.safeParse({ ...base, sessionsCount: "0" }).success,
    ).toBe(false);
  });

  it("convierte una descripción vacía en null", () => {
    const result = sessionPackageSchema.safeParse({ ...base, description: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });
});
