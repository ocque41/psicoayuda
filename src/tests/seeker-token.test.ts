import { describe, expect, it } from "vitest";
import {
  mintSeekerToken,
  type SeekerTokenPayload,
  verifySeekerToken,
} from "@/lib/seeker-token";

const SECRET = "test-secret-abc-123";
const NOW = 1_000_000;

function payload(over?: Partial<SeekerTokenPayload>): SeekerTokenPayload {
  return {
    sid: "seek_abc",
    conversationId: "conv_xyz",
    role: "seeker",
    iat: NOW,
    exp: NOW + 60_000,
    ...over,
  };
}

describe("seeker token", () => {
  it("mint -> verify hace round-trip", () => {
    const token = mintSeekerToken(payload(), SECRET);
    const verified = verifySeekerToken(token, SECRET, NOW);
    expect(verified).not.toBeNull();
    expect(verified?.sid).toBe("seek_abc");
    expect(verified?.conversationId).toBe("conv_xyz");
  });

  it("rechaza firma manipulada", () => {
    const token = mintSeekerToken(payload(), SECRET);
    const [body] = token.split(".");
    const tampered = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifySeekerToken(tampered, SECRET, NOW)).toBeNull();
  });

  it("rechaza cuerpo manipulado (cambia conversationId)", () => {
    const token = mintSeekerToken(payload(), SECRET);
    const evil = mintSeekerToken(
      payload({ conversationId: "conv_evil" }),
      SECRET,
    );
    const [, sig] = token.split(".");
    const [evilBody] = evil.split(".");
    expect(verifySeekerToken(`${evilBody}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("rechaza secreto incorrecto", () => {
    const token = mintSeekerToken(payload(), SECRET);
    expect(verifySeekerToken(token, "otro-secreto", NOW)).toBeNull();
  });

  it("rechaza token expirado", () => {
    const token = mintSeekerToken(payload({ exp: NOW - 1 }), SECRET);
    expect(verifySeekerToken(token, SECRET, NOW)).toBeNull();
  });

  it("rechaza tokens malformados", () => {
    expect(verifySeekerToken("", SECRET, NOW)).toBeNull();
    expect(verifySeekerToken("sin-punto", SECRET, NOW)).toBeNull();
    expect(verifySeekerToken("a.", SECRET, NOW)).toBeNull();
    expect(verifySeekerToken(".b", SECRET, NOW)).toBeNull();
  });
});
