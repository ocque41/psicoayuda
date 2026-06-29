import { describe, expect, it } from "vitest";
import {
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
import { authorizeConnection } from "@/server/auth-gate";

const SECRET = "test-secret";
const NOW = 1000;
const CONV = "conv_1";

function seekerCookie(conversationId = CONV, exp = NOW + 1000) {
  const token = mintSeekerToken(
    { sid: "seek_1", conversationId, role: "seeker", iat: NOW, exp },
    SECRET,
  );
  return `${SEEKER_COOKIE}=${token}`;
}

function proCookie(conversationId = CONV, exp = NOW + 1000) {
  const token = mintProfessionalToken(
    {
      professionalId: "pro_1",
      conversationId,
      role: "professional",
      iat: NOW,
      exp,
    },
    SECRET,
  );
  return `${PRO_COOKIE}=${token}`;
}

describe("authorizeConnection", () => {
  it("autoriza al seeker de la sala", () => {
    expect(authorizeConnection(seekerCookie(), CONV, SECRET, NOW)).toEqual({
      role: "seeker",
      id: "seek_1",
    });
  });

  it("autoriza al profesional de la sala", () => {
    expect(authorizeConnection(proCookie(), CONV, SECRET, NOW)).toEqual({
      role: "professional",
      id: "pro_1",
    });
  });

  it("rechaza sin cookie", () => {
    expect(authorizeConnection(null, CONV, SECRET, NOW)).toBeNull();
    expect(authorizeConnection("", CONV, SECRET, NOW)).toBeNull();
  });

  it("rechaza token de OTRA conversación (no cruza salas)", () => {
    expect(
      authorizeConnection(seekerCookie("conv_otra"), CONV, SECRET, NOW),
    ).toBeNull();
    expect(
      authorizeConnection(proCookie("conv_otra"), CONV, SECRET, NOW),
    ).toBeNull();
  });

  it("rechaza token expirado", () => {
    expect(
      authorizeConnection(seekerCookie(CONV, NOW - 1), CONV, SECRET, NOW),
    ).toBeNull();
  });

  it("rechaza firma con secreto incorrecto", () => {
    expect(authorizeConnection(seekerCookie(), CONV, "otro", NOW)).toBeNull();
  });

  it("rechaza cookies basura", () => {
    expect(
      authorizeConnection("nido_seeker=garbage; x=1", CONV, SECRET, NOW),
    ).toBeNull();
  });
});
