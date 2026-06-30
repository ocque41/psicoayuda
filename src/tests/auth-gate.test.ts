import { describe, expect, it } from "vitest";
import {
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
import {
  authorizeConnection,
  makeOnBeforeConnect,
  professionalConnectionAllows,
  seekerSessionAllows,
} from "@/server/auth-gate";

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

describe("seekerSessionAllows (kill-switch de WebSocket)", () => {
  const now = 1000;

  it("permite cuando no hay fila (se apoya en el token ya validado)", () => {
    expect(seekerSessionAllows(null, now)).toBe(true);
  });

  it("permite sesión vigente y conversación abierta", () => {
    expect(
      seekerSessionAllows(
        { revoked_at: null, expires_at: now + 1000, status: "open" },
        now,
      ),
    ).toBe(true);
  });

  it("bloquea sesión revocada", () => {
    expect(
      seekerSessionAllows(
        { revoked_at: now - 1, expires_at: now + 1000, status: "open" },
        now,
      ),
    ).toBe(false);
  });

  it("bloquea sesión expirada", () => {
    expect(
      seekerSessionAllows(
        { revoked_at: null, expires_at: now, status: "open" },
        now,
      ),
    ).toBe(false);
  });

  it("bloquea conversación cerrada o anonimizada", () => {
    expect(
      seekerSessionAllows(
        { revoked_at: null, expires_at: now + 1000, status: "closed" },
        now,
      ),
    ).toBe(false);
    expect(
      seekerSessionAllows(
        { revoked_at: null, expires_at: now + 1000, status: "anonymized" },
        now,
      ),
    ).toBe(false);
  });
});

describe("professionalConnectionAllows (kill-switch del profesional)", () => {
  it("permite cuando no hay fila (se apoya en el token ya validado)", () => {
    expect(professionalConnectionAllows(null)).toBe(true);
  });

  it("permite conversación abierta y profesional activo", () => {
    expect(
      professionalConnectionAllows({
        conversation_status: "open",
        professional_status: "approved",
      }),
    ).toBe(true);
  });

  it("bloquea conversación cerrada o anonimizada", () => {
    expect(
      professionalConnectionAllows({
        conversation_status: "closed",
        professional_status: "approved",
      }),
    ).toBe(false);
    expect(
      professionalConnectionAllows({
        conversation_status: "anonymized",
        professional_status: "approved",
      }),
    ).toBe(false);
  });

  it("bloquea profesional suspendido", () => {
    expect(
      professionalConnectionAllows({
        conversation_status: "open",
        professional_status: "suspended",
      }),
    ).toBe(false);
  });
});

describe("makeOnBeforeConnect (guard de Origin)", () => {
  // env sin DB: el kill-switch de sesión es best-effort y permite, así que estos
  // tests aíslan el comportamiento del guard de Origin.
  const env = {
    // Literal allowlisted en scripts/secret-scan.mjs (no es un secreto real).
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "https://nido.example",
  };
  const lobby = { party: "conversation", name: CONV };
  // makeOnBeforeConnect usa Date.now() real, así que el token necesita una
  // expiración real en el futuro.
  function freshSeekerCookie() {
    const now = Date.now();
    const token = mintSeekerToken(
      {
        sid: "seek_1",
        conversationId: CONV,
        role: "seeker",
        iat: now,
        exp: now + 3_600_000,
      },
      SECRET,
    );
    return `${SEEKER_COOKIE}=${token}`;
  }
  function upgrade(headers: Record<string, string>) {
    return new Request("https://nido.example/parties/conversation/conv_1", {
      headers: { Upgrade: "websocket", ...headers },
    });
  }

  it("autoriza cuando el Origin coincide con BETTER_AUTH_URL", async () => {
    const result = await makeOnBeforeConnect(env)(
      upgrade({ Origin: "https://nido.example", Cookie: freshSeekerCookie() }),
      lobby,
    );
    expect(result).toBeInstanceOf(Request);
    expect((result as Request).headers.get("x-nido-role")).toBe("seeker");
  });

  it("autoriza cuando falta el header Origin (upgrade same-origin)", async () => {
    const result = await makeOnBeforeConnect(env)(
      upgrade({ Cookie: freshSeekerCookie() }),
      lobby,
    );
    expect(result).toBeInstanceOf(Request);
  });

  it("rechaza con 403 cuando el Origin no coincide (anti-CSWSH)", async () => {
    const result = await makeOnBeforeConnect(env)(
      upgrade({ Origin: "https://evil.example", Cookie: freshSeekerCookie() }),
      lobby,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("rechaza con 403 sin token aunque el Origin sea válido", async () => {
    const result = await makeOnBeforeConnect(env)(
      upgrade({ Origin: "https://nido.example" }),
      lobby,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
});
