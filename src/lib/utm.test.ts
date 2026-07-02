import { describe, expect, it } from "vitest";
import { withUtm } from "@/lib/utm";

describe("withUtm", () => {
  it("preserva el ?text= de wa.me y añade los UTM con &", () => {
    const url = withUtm("https://wa.me/584121234567?text=Hola", {
      medium: "whatsapp",
      campaign: "profesionales",
    });
    expect(url).toBe(
      "https://wa.me/584121234567?text=Hola&utm_source=saludmental-venezuela.com&utm_medium=whatsapp&utm_campaign=profesionales",
    );
  });

  it("añade ?utm_* a una web sin querystring (medium por defecto)", () => {
    expect(withUtm("https://ejemplo.com", { campaign: "emergencia" })).toBe(
      "https://ejemplo.com?utm_source=saludmental-venezuela.com&utm_medium=referral&utm_campaign=emergencia",
    );
  });

  it("respeta un querystring existente añadiendo con &", () => {
    const url = withUtm("https://ejemplo.com/x?a=1", { campaign: "aliados" });
    expect(url.startsWith("https://ejemplo.com/x?a=1&utm_source=")).toBe(true);
  });

  it("incluye utm_content solo si se pasa", () => {
    expect(withUtm("https://ejemplo.com", { content: "card" })).toContain(
      "utm_content=card",
    );
    expect(withUtm("https://ejemplo.com")).not.toContain("utm_content");
  });

  it("no toca tel:, mailto: ni rutas internas/relativas", () => {
    expect(withUtm("tel:+584121234567")).toBe("tel:+584121234567");
    expect(withUtm("mailto:hola@ejemplo.com")).toBe("mailto:hola@ejemplo.com");
    expect(withUtm("/ayuda")).toBe("/ayuda");
    expect(withUtm("#formulario")).toBe("#formulario");
  });
});
