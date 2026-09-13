import { describe, expect, it } from "vitest";
import { chooseChatIdentity } from "@/lib/chat-identity";

describe("chooseChatIdentity (prelación única de identidad en la sala)", () => {
  it("sin credenciales devuelve null", () => {
    expect(
      chooseChatIdentity({ professional: false, seeker: false }),
    ).toBeNull();
    expect(
      chooseChatIdentity({ professional: false, seeker: false }, true),
    ).toBeNull();
  });

  it("solo profesional => profesional; solo persona => persona", () => {
    expect(chooseChatIdentity({ professional: true, seeker: false })).toBe(
      "professional",
    );
    expect(chooseChatIdentity({ professional: false, seeker: true })).toBe(
      "seeker",
    );
  });

  it("con AMBAS, gana el profesional por defecto (identidad autenticada)", () => {
    expect(chooseChatIdentity({ professional: true, seeker: true })).toBe(
      "professional",
    );
  });

  it("con AMBAS, `?como=persona` da la vista de la persona", () => {
    expect(chooseChatIdentity({ professional: true, seeker: true }, true)).toBe(
      "seeker",
    );
  });

  it("pedir la vista de persona SIN credencial de persona no la inventa", () => {
    expect(
      chooseChatIdentity({ professional: true, seeker: false }, true),
    ).toBe("professional");
  });
});
