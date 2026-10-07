import { describe, expect, it } from "vitest";
import { captureOnboardingAnswers } from "@/components/onboarding/capture-answers";

function form(
  controls: { field: string; value: string; excluded?: boolean }[],
) {
  return {
    querySelectorAll: () =>
      controls.map((control) => ({
        getAttribute: () => control.field,
        value: control.value,
        matches: () => Boolean(control.excluded),
      })),
  } as unknown as HTMLFormElement;
}

describe("respuestas visibles del onboarding", () => {
  it("captura nombre y país autocompletados sin eventos antes de desmontar, sin mutar estado", () => {
    const previous = { displayName: "Nombre inicial", country: "VE", step: 0 };
    expect(
      captureOnboardingAnswers(
        form([
          { field: "displayName", value: "Alias ficticio visible" },
          { field: "country", value: "ES" },
        ]),
        previous,
      ),
    ).toEqual({
      displayName: "Alias ficticio visible",
      country: "ES",
      step: 0,
    });
    expect(previous).toEqual({
      displayName: "Nombre inicial",
      country: "VE",
      step: 0,
    });
  });

  it("captura también el borrado de una respuesta para que la validación no use el valor anterior", () => {
    expect(
      captureOnboardingAnswers(form([{ field: "fullName", value: "" }]), {
        fullName: "Nombre anterior",
      }),
    ).toEqual({ fullName: "" });
  });

  it("no añade credenciales/contacto a un snapshot seguro ni infiere consentimiento o adjuntos", () => {
    const safe = {
      fullName: "Ficticio",
      privacyAccepted: false,
      supportAreas: ["ansiedad_depresion"],
    };
    expect(
      captureOnboardingAnswers(
        form([
          { field: "licenseNumber", value: "CREDENCIAL_FICTICIA" },
          { field: "contactEmail", value: "ficticio@example.test" },
          { field: "privacyAccepted", value: "on" },
          { field: "supportAreas", value: "otra_area" },
          { field: "fullName", value: "archivo", excluded: true },
        ]),
        safe,
      ),
    ).toBe(safe);
  });

  it("sin controles nuevos conserva el snapshot y los espacios del valor visible", () => {
    const previous = { displayName: "Nombre" };
    expect(captureOnboardingAnswers(null, previous)).toBe(previous);
    expect(
      captureOnboardingAnswers(
        form([{ field: "displayName", value: "Nombre" }]),
        previous,
      ),
    ).toBe(previous);
    expect(
      captureOnboardingAnswers(
        form([{ field: "displayName", value: "  Alias visible  " }]),
        previous,
      ).displayName,
    ).toBe("  Alias visible  ");
  });
});
