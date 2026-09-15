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
    });
  });

  it("la persona con historial cifrado y sin clave restaura (no crea)", () => {
    expect(decide({ envelopes: 3 })).toEqual({
      restore: true,
      create: false,
      showCode: false,
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
    });
  });

  it("la clave de la contraparte NO impide crear la clave de la persona", () => {
    expect(decide({ accountPublicKey: "peer-del-profesional" })).toMatchObject({
      create: true,
      showCode: true,
    });
  });

  it("el profesional sin clave en este dispositivo pide código (no puede leer ni escribir)", () => {
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
    });
  });

  it("el profesional con historial cifrado y sin clave también pide código", () => {
    expect(
      decide({ role: "professional", proVisitor: true, envelopes: 7 }),
    ).toEqual({ restore: true, create: false, showCode: false });
  });

  it("el profesional en un chat vacío sin clave publicada arranca sin código", () => {
    expect(decide({ role: "professional", proVisitor: true })).toEqual({
      restore: false,
      create: true,
      showCode: false,
    });
  });

  it("el profesional cuya clave local difiere de la de su cuenta pide código", () => {
    expect(
      decide({
        role: "professional",
        proVisitor: true,
        hasLocalIdentity: true,
        localPublicKey: "local-distinta",
        accountPublicKey: "cuenta",
      }),
    ).toEqual({ restore: true, create: false, showCode: false });
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
    });
  });

  it("la vista 'como la persona' del profesional crea en silencio, sin código", () => {
    expect(
      decide({
        role: "seeker",
        proVisitor: true,
        accountPublicKey: "pro-key",
        envelopes: 2,
      }),
    ).toEqual({
      restore: false,
      create: true,
      showCode: false,
    });
  });

  it("una persona con clave previa pero sin historial tampoco ve nada", () => {
    expect(
      decide({ hasLocalIdentity: true, localPublicKey: "k", envelopes: 0 }),
    ).toMatchObject({ restore: false, create: false });
  });
});
