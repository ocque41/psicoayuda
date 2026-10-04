import { describe, expect, it, vi } from "vitest";
import {
  nextOutsideQuietHours,
  type PushPreferences,
  permittedPushEndpoint,
  pushPayloadSchema,
} from "@/lib/push/contract";
import { base64url, decodeBase64url, utf8 } from "@/lib/push/encoding";
import {
  encryptWebPushPayload,
  sendWebPush,
  vapidAuthorization,
} from "@/lib/push/web-push";

const receiver =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const publicKey =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const privateKey = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const auth = "BTBZMqHH6r4Tts7J_aSIgg";
const configuration = {
  publicKey,
  privateKey,
  subject: "mailto:fixture@example.invalid",
};
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fictitious-fixture",
  keys: { p256dh: receiver, auth },
};
const payload = {
  v: 1 as const,
  id: "fictitious_delivery_1234",
  kind: "chat" as const,
  role: "professional" as const,
};
const preferences: PushPreferences = {
  chatEnabled: true,
  appointmentEnabled: true,
  afterSessionEnabled: false,
  offsetMinutes: 60,
  timeZone: "Europe/Madrid",
  quietEnabled: true,
  quietStart: 1320,
  quietEnd: 480,
};

describe("transporte Web Push sin red", () => {
  it("coincide byte a byte con el vector publicado RFC 8291", async () => {
    const raw = decodeBase64url(publicKey);
    const sender: CryptoKeyPair = {
      publicKey: await crypto.subtle.importKey(
        "raw",
        raw,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        [],
      ),
      privateKey: await crypto.subtle.importKey(
        "jwk",
        {
          kty: "EC",
          crv: "P-256",
          x: base64url(raw.slice(1, 33)),
          y: base64url(raw.slice(33)),
          d: privateKey,
        },
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"],
      ),
    };
    const body = await encryptWebPushPayload(
      subscription,
      utf8.encode("When I grow up, I want to be a watermelon"),
      { sender, salt: decodeBase64url("DGv6ra1nlYgDCS1FRnbzlw") },
    );
    expect(base64url(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });
  it("firma VAPID verificable con audiencia del proveedor y vencimiento de una hora", async () => {
    const at = Date.parse("2026-10-04T12:00:00Z");
    const value = await vapidAuthorization(
      subscription.endpoint,
      configuration,
      at,
    );
    const jwt = value.split("t=")[1].split(",")[0];
    const [header, body, signature] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64url(body)));
    expect(claims).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: Math.floor(at / 1000) + 3600,
      sub: configuration.subject,
    });
    const key = await crypto.subtle.importKey(
      "raw",
      decodeBase64url(publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        decodeBase64url(signature),
        utf8.encode(`${header}.${body}`),
      ),
    ).toBe(true);
  });
  it.each([
    "http://fcm.googleapis.com/test",
    "https://127.0.0.1/test",
    "https://[::1]/test",
    "https://localhost/test",
    "https://fcm.googleapis.com.evil.invalid/test",
    "https://evil@fcm.googleapis.com/test",
    "https://fcm.googleapis.com:444/test",
    "https://fcm.googleapis.com/test?url=https://localhost",
    "https://fcm.googleapis.com/test#fragment",
    "https://fcm.googleapis.com/../test",
    "https://push.apple.com/test",
    "https://a.b.push.apple.com/test",
  ])("rechaza destino SSRF %s", (endpoint) =>
    expect(permittedPushEndpoint(endpoint)).toBeNull());
  it.each([
    "https://fcm.googleapis.com/fcm/send/fixture",
    "https://updates.push.services.mozilla.com/wpush/v2/fixture",
    "https://web.push.apple.com/Qfixture",
  ])("admite sólo proveedor conocido %s", (endpoint) =>
    expect(permittedPushEndpoint(endpoint)).toBe(endpoint));
  it("no acepta datos clínicos ni enlaces arbitrarios en el payload", () => {
    expect(
      pushPayloadSchema.safeParse({ ...payload, text: "relato ficticio" })
        .success,
    ).toBe(false);
    expect(
      pushPayloadSchema.safeParse({
        ...payload,
        url: "https://example.invalid",
      }).success,
    ).toBe(false);
  });
  it("envía cifrado, sin redirecciones, con Topic estable y TTL acotado", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 201 }),
    );
    expect(
      await sendWebPush(subscription, payload, 300, {
        configuration,
        fetch: fetcher,
      }),
    ).toEqual({ ok: true });
    const init = fetcher.mock.calls[0][1];
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    expect(new TextDecoder().decode(init?.body as Uint8Array)).not.toContain(
      payload.id,
    );
    const headers = init?.headers as Record<string, string>;
    expect(headers.TTL).toBe("300");
    expect(headers.Topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((init?.body as Uint8Array).length).toBe(614);
  });
  it.each([
    [410, "expired", false],
    [404, "expired", false],
    [429, "temporary", true],
    [503, "temporary", true],
    [403, "rejected", false],
  ])("clasifica respuesta %i", async (status, code, retryable) => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: Number(status) }),
    );
    expect(
      await sendWebPush(subscription, payload, 60, {
        configuration,
        fetch: fetcher,
      }),
    ).toEqual({ ok: false, code, retryable });
  });
  it("un endpoint inválido nunca alcanza fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      (
        await sendWebPush(
          { ...subscription, endpoint: "https://localhost/secret" },
          payload,
          60,
          { configuration, fetch: fetcher },
        )
      ).ok,
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("atraviesa el cambio de horario de invierno sin inventar horas", () => {
    const at = Date.parse("2026-10-24T22:00:00Z");
    const next = nextOutsideQuietHours(preferences, at);
    expect(new Date(next || 0).toISOString()).toBe("2026-10-25T07:00:00.000Z");
  });
  it("atraviesa el cambio de horario de verano", () => {
    expect(
      new Date(
        nextOutsideQuietHours(
          preferences,
          Date.parse("2026-03-28T23:00:00Z"),
        ) || 0,
      ).toISOString(),
    ).toBe("2026-03-29T06:00:00.000Z");
  });
});
