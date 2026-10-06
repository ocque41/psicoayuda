import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  authorized: vi.fn(),
  account: vi.fn(),
  revocable: vi.fn(),
  configuration: vi.fn(),
  devices: vi.fn(),
  subscribe: vi.fn(),
  update: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/push/preferences", () => ({
  authorizedPushActor: mocks.authorized,
  authorizedPushAccount: mocks.account,
  revocablePushDevices: mocks.revocable,
  pushConfiguration: mocks.configuration,
  pushDevices: mocks.devices,
  subscribePush: mocks.subscribe,
  updatePushPreferences: mocks.update,
  revokePush: mocks.revoke,
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/push/route";

const actor = {
  userId: "fixture-user",
  sessionId: "fixture-session",
  role: "patient",
};
function request(
  method: string,
  body?: unknown,
  origin = "https://nido.example.invalid",
) {
  return new Request("https://nido.example.invalid/api/push?role=patient", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: actor.userId, emailVerified: true },
    session: { id: actor.sessionId },
  });
  mocks.authorized.mockResolvedValue(true);
  mocks.account.mockResolvedValue(true);
  mocks.revocable.mockResolvedValue([]);
  mocks.configuration.mockResolvedValue(null);
  mocks.devices.mockResolvedValue([]);
});
describe("API Web Push: sesión y privacidad", () => {
  it("rechaza sesión ausente antes de consultar", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request("GET"))).status).toBe(401);
    expect(mocks.devices).not.toHaveBeenCalled();
  });
  it("rechaza correo sin verificar", async () => {
    mocks.session.mockResolvedValue({
      user: { id: actor.userId, emailVerified: false },
      session: { id: actor.sessionId },
    });
    expect((await DELETE(request("DELETE", { all: true }))).status).toBe(401);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("role solicitado no concede permiso", async () => {
    mocks.authorized.mockResolvedValue(false);
    expect((await GET(request("GET"))).status).toBe(403);
    expect(mocks.devices).not.toHaveBeenCalled();
  });
  it("marca las respuestas privadas no-store", async () => {
    const result = await GET(request("GET"));
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await result.json()).toEqual({
      available: false,
      publicKey: null,
      devices: [],
    });
    expect(mocks.devices).toHaveBeenCalledWith(actor);
  });
  it.each([
    POST,
    PATCH,
    DELETE,
  ])("bloquea escritura de otro origen", async (handler) => {
    expect(
      (
        await handler(
          request(
            handler === POST ? "POST" : handler === PATCH ? "PATCH" : "DELETE",
            { all: true },
            "https://evil.invalid",
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it("baja no exige que siga aprobado el perfil ni proveedor disponible", async () => {
    mocks.authorized.mockResolvedValue(false);
    expect((await DELETE(request("DELETE", { all: true }))).status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith(actor, undefined);
  });
  it("no acepta identidad en el cuerpo ni revoke de rol ajeno", async () => {
    expect(
      (await DELETE(request("DELETE", { all: true, userId: "someone-else" })))
        .status,
    ).toBe(400);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("rechaza cuerpos excesivos sin mutaciones", async () => {
    expect(
      (await POST(request("POST", { padding: "x".repeat(9000) }))).status,
    ).toBe(400);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it("error de persistencia no expone detalles internos", async () => {
    mocks.revoke.mockRejectedValue(new Error("secret-fixture-endpoint"));
    const result = await DELETE(request("DELETE", { all: true }));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret-fixture-endpoint");
  });
});
