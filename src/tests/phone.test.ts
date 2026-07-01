import { describe, expect, it } from "vitest";
import { toIntlNumber } from "@/lib/phone";

describe("toIntlNumber", () => {
  it("trunk nacional venezolano 0xxx -> +58", () => {
    expect(toIntlNumber("0412-1234567")).toBe("584121234567");
    expect(toIntlNumber("0212 5551234")).toBe("582125551234");
  });

  it("número local sin prefijo asume +58", () => {
    expect(toIntlNumber("412 123 4567")).toBe("584121234567");
  });

  it("ya internacional se respeta", () => {
    expect(toIntlNumber("+58 412 1234567")).toBe("584121234567");
    expect(toIntlNumber("00584121234567")).toBe("584121234567");
    expect(toIntlNumber("584121234567")).toBe("584121234567");
  });

  it("otro país con + se respeta", () => {
    expect(toIntlNumber("+57 300 1234567")).toBe("573001234567");
  });

  it("basura o vacío -> null", () => {
    expect(toIntlNumber("")).toBeNull();
    expect(toIntlNumber(null)).toBeNull();
    expect(toIntlNumber("   ")).toBeNull();
    expect(toIntlNumber("123")).toBeNull(); // demasiado corto
  });
});
