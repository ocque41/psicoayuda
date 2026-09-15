import { describe, expect, it } from "vitest";
import {
  mintProfessionalInboxToken,
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
import {
  authorizeConnection,
  makeOnBeforeConnect,
  professionalCanSend,
  professionalConnectionAllows,
  seekerCanSend,
  seekerSessionAllows,
} from "@/server/auth-gate";
import type { Env } from "@/server/types";

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

  it("con AMBAS credenciales gana el profesional (igual que la página)", () => {
    const both = `${proCookie()}; ${seekerCookie()}`;
    expect(authorizeConnection(both, CONV, SECRET, NOW)).toEqual({
      role: "professional",
      id: "pro_1",
    });
  });

  it("con AMBAS y `?como=persona` conecta como la persona", () => {
    const both = `${proCookie()}; ${seekerCookie()}`;
    expect(authorizeConnection(both, CONV, SECRET, NOW, true)).toEqual({
      role: "seeker",
      id: "seek_1",
    });
  });

  it("`?como=persona` sin credencial de persona no inventa el rol", () => {
    expect(authorizeConnection(proCookie(), CONV, SECRET, NOW, true)).toEqual({
      role: "professional",
      id: "pro_1",
    });
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
        {
          revoked_at: null,
          expires_at: now + 1000,
          status: "open",
          anonymized_at: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("bloquea sesión revocada", () => {
    expect(
      seekerSessionAllows(
        {
          revoked_at: now - 1,
          expires_at: now + 1000,
          status: "open",
          anonymized_at: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it("bloquea sesión expirada", () => {
    expect(
      seekerSessionAllows(
        {
          revoked_at: null,
          expires_at: now,
          status: "open",
          anonymized_at: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it("permite conversación CERRADA (leer y reabrir); bloquea la anonimizada", () => {
    expect(
      seekerSessionAllows(
        {
          revoked_at: null,
          expires_at: now + 1000,
          status: "closed",
          anonymized_at: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      seekerSessionAllows(
        {
          revoked_at: null,
          expires_at: now + 1000,
          status: "closed",
          anonymized_at: now - 1,
        },
        now,
      ),
    ).toBe(false);
  });
});

describe("seekerCanSend (lectura vs escritura)", () => {
  const base = {
    revoked_at: null,
    expires_at: Date.now() + 1000,
    anonymized_at: null,
  };
  it("escribir solo con conversación abierta", () => {
    expect(seekerCanSend(null)).toBe(true);
    expect(seekerCanSend({ ...base, status: "open" })).toBe(true);
    expect(seekerCanSend({ ...base, status: "closed" })).toBe(false);
    expect(seekerCanSend({ ...base, status: "closed", anonymized_at: 1 })).toBe(
      false,
    );
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
        anonymized_at: null,
      }),
    ).toBe(true);
  });

  it("permite conversación CERRADA (leer y reabrir); bloquea la anonimizada", () => {
    expect(
      professionalConnectionAllows({
        conversation_status: "closed",
        professional_status: "approved",
        anonymized_at: null,
      }),
    ).toBe(true);
    expect(
      professionalConnectionAllows({
        conversation_status: "closed",
        professional_status: "approved",
        anonymized_at: 1,
      }),
    ).toBe(false);
  });

  it("bloquea profesional suspendido", () => {
    expect(
      professionalConnectionAllows({
        conversation_status: "open",
        professional_status: "suspended",
        anonymized_at: null,
      }),
    ).toBe(false);
  });
});

describe("professionalCanSend (lectura vs escritura)", () => {
  it("escribir solo con conversación abierta", () => {
    expect(professionalCanSend(null)).toBe(true);
    expect(
      professionalCanSend({
        conversation_status: "open",
        professional_status: "approved",
        anonymized_at: null,
      }),
    ).toBe(true);
    expect(
      professionalCanSend({
        conversation_status: "closed",
        professional_status: "approved",
        anonymized_at: null,
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

  it("`?como=persona` en la URL del WebSocket conecta con la identidad de la persona", async () => {
    const pro = mintProfessionalToken(
      {
        professionalId: "pro_1",
        conversationId: CONV,
        role: "professional",
        iat: Date.now(),
        exp: Date.now() + 3_600_000,
      },
      SECRET,
    );
    const cookie = `${PRO_COOKIE}=${pro}; ${freshSeekerCookie()}`;
    const request = new Request(
      `https://nido.example/parties/conversation/conv_1?como=persona`,
      {
        headers: {
          Upgrade: "websocket",
          Origin: "https://nido.example",
          Cookie: cookie,
        },
      },
    );
    const result = await makeOnBeforeConnect(env)(request, lobby);
    expect(result).toBeInstanceOf(Request);
    expect((result as Request).headers.get("x-nido-role")).toBe("seeker");
  });

  it("sin `?como=persona` con ambas cookies conecta como profesional", async () => {
    const pro = mintProfessionalToken(
      {
        professionalId: "pro_1",
        conversationId: CONV,
        role: "professional",
        iat: Date.now(),
        exp: Date.now() + 3_600_000,
      },
      SECRET,
    );
    const cookie = `${PRO_COOKIE}=${pro}; ${freshSeekerCookie()}`;
    const result = await makeOnBeforeConnect(env)(
      upgrade({ Origin: "https://nido.example", Cookie: cookie }),
      lobby,
    );
    expect(result).toBeInstanceOf(Request);
    expect((result as Request).headers.get("x-nido-role")).toBe("professional");
  });
});

describe("conexiones de AVISOS del profesional (gate)", () => {
  // Env con una D1 mínima: el gate de avisos exige comprobar la propiedad de la
  // sala, así que aquí SÍ necesitamos filas (a diferencia del resto de tests).
  const lobby = { party: "conversation", name: CONV };

  function freshInboxCookie(professionalId = "pro_1") {
    const now = Date.now();
    const token = mintProfessionalInboxToken(
      {
        professionalId,
        role: "inbox",
        iat: now,
        exp: now + 3_600_000,
      },
      SECRET,
    );
    return `${PRO_INBOX_COOKIE}=${token}`;
  }

  function inboxUpgrade(cookie: string, name: string = CONV) {
    return new Request(
      `https://nido.example/parties/conversation/${name}?avisos=1`,
      {
        headers: {
          Upgrade: "websocket",
          Origin: "https://nido.example",
          Cookie: cookie,
        },
      },
    );
  }

  function fakeD1(
    row: {
      owner_id: string | null;
      status: string | null;
      anonymized_at: number | null;
      deleted_at: number | null;
      professional_status: string | null;
    } | null,
  ) {
    return {
      prepare: () => ({
        bind: () => ({ first: async () => row }),
      }),
    } as unknown as Env["DB"];
  }

  const baseEnv = {
    // Literal allowlisted en scripts/secret-scan.mjs (no es un secreto real).
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "https://nido.example",
  };

  it("autoriza al profesional en su propia sala, en solo lectura", async () => {
    const env = {
      ...baseEnv,
      DB: fakeD1({
        owner_id: "pro_1",
        status: "open",
        anonymized_at: null,
        deleted_at: null,
        professional_status: "approved",
      }),
    };
    const result = await makeOnBeforeConnect(env)(
      inboxUpgrade(freshInboxCookie()),
      lobby,
    );
    expect(result).toBeInstanceOf(Request);
    const request = result as Request;
    expect(request.headers.get("x-nido-role")).toBe("professional");
    expect(request.headers.get("x-nido-informer")).toBe("1");
    expect(request.headers.get("x-nido-can-send")).toBe("0");
  });

  it("rechaza (403) una sala que no es suya", async () => {
    const env = {
      ...baseEnv,
      DB: fakeD1({
        owner_id: "pro_OTRO",
        status: "open",
        anonymized_at: null,
        deleted_at: null,
        professional_status: "approved",
      }),
    };
    const result = await makeOnBeforeConnect(env)(
      inboxUpgrade(freshInboxCookie()),
      lobby,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("rechaza (403) si la cuenta está suspendida, la sala está en papelera o anonimizada", async () => {
    const cases = [
      { professional_status: "suspended" },
      { deleted_at: Date.now() },
      { anonymized_at: Date.now() },
    ];
    for (const extra of cases) {
      const env = {
        ...baseEnv,
        DB: fakeD1({
          owner_id: "pro_1",
          status: "open",
          anonymized_at: null,
          deleted_at: null,
          professional_status: "approved",
          ...extra,
        }),
      };
      const result = await makeOnBeforeConnect(env)(
        inboxUpgrade(freshInboxCookie()),
        lobby,
      );
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    }
  });

  it("sin D1 no se autorizan avisos (una sala ajena no puede colarse)", async () => {
    const result = await makeOnBeforeConnect(baseEnv)(
      inboxUpgrade(freshInboxCookie()),
      lobby,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("un token de avisos caducado o de otra firma cae a la autorización normal", async () => {
    const expired = mintProfessionalInboxToken(
      {
        professionalId: "pro_1",
        role: "inbox",
        iat: NOW,
        exp: NOW - 1,
      },
      SECRET,
    );
    const result = await makeOnBeforeConnect(baseEnv)(
      inboxUpgrade(`${PRO_INBOX_COOKIE}=${expired}`),
      lobby,
    );
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
});
