import { describe, expect, it } from "vitest";
import {
  insideWorkHours,
  localToUtc,
  moneyCents,
  patientSchema,
} from "@/lib/practice/domain";
import {
  type OrientationInput,
  orient,
  recommend,
} from "@/lib/practice/orientation";

const input: OrientationInput = {
  text: "Me preocupa mi ansiedad y la ruptura con mi pareja",
  country: "Venezuela",
  language: "es",
  ageGroup: "adult",
  immediateDanger: "no",
  forWhom: "self",
};
describe("orientación sin diagnóstico", () => {
  it.each([
    "Quiero suicidarme",
    "he intentado quitarme la vida",
    "me hago autolesiones",
    "deseo acabar conmigo",
    "mi amigo tiene pensamientos suicidas",
  ])("antepone atención humana a recomendaciones: %s", (text) => {
    const r = recommend({ ...input, text }, []);
    expect(r.safetySignal).toBe(true);
    expect(r.recommendations).toEqual([]);
  });
  it("no atribuye seguridad por ausencia de palabras", () => {
    const r = orient({ ...input, text: "hola" });
    expect(r).not.toHaveProperty("riskScore");
    expect(r).not.toHaveProperty("diagnosis");
  });
  it("una duda explícita de seguridad interrumpe el catálogo", () =>
    expect(orient({ ...input, immediateDanger: "unsure" }).safetySignal).toBe(
      true,
    ));
  it("marca revisión para menores y perinatalidad", () => {
    expect(orient({ ...input, ageGroup: "minor" }).needsHumanReview).toBe(true);
    expect(
      orient({ ...input, text: "Estoy embarazada y abrumada" })
        .needsHumanReview,
    ).toBe(true);
  });
  it("excluye perfiles sin país revisado, idioma, cupo o atención a menores", () => {
    const base = {
      id: "p",
      name: "Profesional",
      languages: ["es"],
      supportAreas: ["ansiedad_depresion"],
      eligibleCountries: ["Venezuela"],
      available: true,
      supportsMinors: false,
    };
    expect(recommend(input, [base]).recommendations).toHaveLength(1);
    expect(
      recommend(input, [{ ...base, eligibleCountries: ["España"] }])
        .recommendations,
    ).toEqual([]);
    expect(
      recommend(input, [{ ...base, available: false }]).recommendations,
    ).toEqual([]);
    expect(
      recommend(input, [{ ...base, languages: ["en"] }]).recommendations,
    ).toEqual([]);
    expect(
      recommend({ ...input, ageGroup: "minor" }, [base]).recommendations,
    ).toEqual([]);
  });
});
describe("agenda entre países", () => {
  it("convierte Caracas y Madrid a un instante único", () => {
    expect(localToUtc("2026-10-02T10:00", "America/Caracas")).toBe(
      "2026-10-02T14:00:00.000Z",
    );
    expect(localToUtc("2026-10-02T16:00", "Europe/Madrid")).toBe(
      "2026-10-02T14:00:00.000Z",
    );
  });
  it("rechaza hora inexistente y ambigua en cambios de horario", () => {
    expect(localToUtc("2026-03-29T02:30", "Europe/Madrid")).toBeNull();
    expect(localToUtc("2026-10-25T02:30", "Europe/Madrid")).toBeNull();
  });
  it("rechaza zona inventada y fechas imposibles", () => {
    expect(localToUtc("2026-02-30T10:00", "UTC")).toBeNull();
    expect(localToUtc("2026-10-02T10:00", "Fake/Zone")).toBeNull();
  });
  it("respeta offsets fraccionarios, DST de media hora y cambio de fecha", () => {
    expect(localToUtc("2026-10-02T10:00", "Asia/Kathmandu")).toBe(
      "2026-10-02T04:15:00.000Z",
    );
    expect(localToUtc("2026-10-02T10:00", "Pacific/Chatham")).toBe(
      "2026-10-01T20:15:00.000Z",
    );
    expect(localToUtc("2026-10-04T02:15", "Australia/Lord_Howe")).toBeNull();
    expect(localToUtc("2026-04-05T01:45", "Australia/Lord_Howe")).toBeNull();
    expect(localToUtc("2011-12-30T10:00", "Pacific/Apia")).toBeNull();
  });
  it("horarios respetan zona local y límite de fin", () => {
    expect(
      insideWorkHours(
        Date.parse("2026-10-02T07:30:00Z"),
        "Europe/Madrid",
        9,
        18,
      ),
    ).toBe(true);
    expect(
      insideWorkHours(
        Date.parse("2026-10-02T16:00:00Z"),
        "Europe/Madrid",
        9,
        18,
      ),
    ).toBe(false);
  });
  it("guarda importes enteros y requiere autorización de contacto", () => {
    expect(moneyCents("19,99")).toBe(1999);
    expect(
      patientSchema.safeParse({
        name: "Alias",
        email: "",
        country: "Venezuela",
        timeZone: "UTC",
        program: "general",
      }).success,
    ).toBe(false);
  });
});
