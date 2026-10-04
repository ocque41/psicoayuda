import { describe, expect, it } from "vitest";
import { decideE2eeGate, type E2eeGateInput } from "@/shared/e2ee-gating";

const base: E2eeGateInput = {
  role: "seeker",
  proVisitor: false,
  hasLocalIdentity: false,
  accountPublicKey: null,
  localPublicKey: null,
  envelopes: 0,
};

function decide(overrides: Partial<E2eeGateInput>) {
  return decideE2eeGate({ ...base, ...overrides });
}

describe("regla del código de recuperación dentro de la sala", () => {
  it("la persona sin nada de este chat recibe su código al crear la clave", () => {
    expect(decide({})).toEqual({
      restore: false,
      create: true,
      showCode: true,
      notice: null,
    });
  });

  it("la persona con historial cifrado y sin clave restaura (no crea)", () => {
    expect(decide({ envelopes: 3 })).toEqual({
      restore: true,
      create: false,
      showCode: false,
      notice: null,
    });
  });

  it("la persona con clave en el dispositivo no ve ningún aviso", () => {
    expect(
      decide({
        hasLocalIdentity: true,
        localPublicKey: "k1",
        envelopes: 3,
      }),
    ).toEqual({
      restore: false,
      create: false,
      showCode: false,
      notice: null,
    });
  });

  it("la clave de la contraparte NO impide crear la clave de la persona", () => {
    expect(decide({ accountPublicKey: "peer-del-profesional" })).toMatchObject({
      create: true,
      showCode: true,
    });
  });

  it("el profesional con clave en su cuenta y sin clave local NO rota: pide el código (uno para todo)", () => {
    expect(
      decide({
        role: "professional",
        proVisitor: true,
        accountPublicKey: "pro-key",
      }),
    ).toEqual({
      restore: true,
      create: false,
      showCode: false,
      notice: null,
    });
  });

  it("el profesional sin clave ni cuenta publicada arranca sin aviso", () => {
    expect(decide({ role: "professional", proVisitor: true })).toEqual({
      restore: false,
      create: true,
      showCode: false,
      notice: null,
    });
  });

  it("el profesional cuya clave local difiere de la de su cuenta ve aviso (no muro)", () => {
    expect(
      decide({
        role: "professional",
        proVisitor: true,
        hasLocalIdentity: true,
        localPublicKey: "local-distinta",
        accountPublicKey: "cuenta",
      }),
    ).toEqual({
      restore: false,
      create: false,
      showCode: false,
      notice: "mismatch",
    });
  });

  it("su clave local coincide con la de la cuenta: sin interrupciones", () => {
    expect(
      decide({
        role: "professional",
        proVisitor: true,
        hasLocalIdentity: true,
        localPublicKey: "misma",
        accountPublicKey: "misma",
      }),
    ).toEqual({
      restore: false,
      create: false,
      showCode: false,
      notice: null,
    });
  });

  it("la vista 'como la persona' con historial pide el código del profesional (keystore completo)", () => {
    expect(
      decide({
        role: "seeker",
        proVisitor: true,
        accountPublicKey: "pro-key",
        envelopes: 2,
      }),
    ).toEqual({
      restore: true,
      create: false,
      showCode: false,
      notice: null,
    });
  });

  it("la vista 'como la persona' sin historial crea su clave en silencio", () => {
    expect(
      decide({
        role: "seeker",
        proVisitor: true,
        accountPublicKey: "pro-key",
        envelopes: 0,
      }),
    ).toEqual({
      restore: false,
      create: true,
      showCode: false,
      notice: null,
    });
  });

  it("una persona con clave previa pero sin historial tampoco ve nada", () => {
    expect(
      decide({ hasLocalIdentity: true, localPublicKey: "k", envelopes: 0 }),
    ).toMatchObject({ restore: false, create: false, notice: null });
  });

  it("el profesional NUNCA rota su clave en silencio cuando la cuenta ya tiene una", () => {
    // Rotar rompería el historial en todos sus dispositivos: o la clave local
    // coincide (nada), o difiere (aviso), o falta (se pide el código).
    for (const hasLocalIdentity of [true, false]) {
      for (const envelopes of [0, 5]) {
        const decision = decide({
          role: "professional",
          proVisitor: true,
          accountPublicKey: "pro-key",
          hasLocalIdentity,
          localPublicKey: hasLocalIdentity ? "otra" : null,
          envelopes,
        });
        expect(decision.create).toBe(false);
      }
    }
    // Primera vez (ni cuenta ni dispositivo): ahí sí se crea, no hay historial.
    expect(
      decide({ role: "professional", proVisitor: true, accountPublicKey: null })
        .create,
    ).toBe(true);
  });
});
