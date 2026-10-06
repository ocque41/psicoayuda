import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), destination: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/push/jobs", () => ({ pushOpenDestination: mocks.destination }));

import { GET } from "@/app/api/push/open/route";

const id = "00000000-0000-4000-8000-000000000001";
const request = (delivery = id) =>
  new Request(
    `https://nido.example.invalid/api/push/open?delivery=${encodeURIComponent(delivery)}`,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: "fixture-user", emailVerified: true },
    session: { id: "fixture-session" },
  });
  mocks.destination.mockResolvedValue("/pro/consulta");
});
describe("abrir aviso no concede acceso", () => {
  it("resuelve únicamente con sesión y correo verificados", async () => {
    const result = await GET(request());
    expect(result.status).toBe(303);
    expect(result.headers.get("Location")).toBe("/pro/consulta");
    expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.destination).toHaveBeenCalledWith(
      "fixture-user",
      "fixture-session",
      id,
    );
  });
  it("sin sesión dirige a entrada sin buscar un evento", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request())).headers.get("Location")).toBe("/entrar");
    expect(mocks.destination).not.toHaveBeenCalled();
  });
  it("rechaza un enlace en lugar del identificador opaco", async () => {
    expect(
      (await GET(request("https://evil.invalid"))).headers.get("Location"),
    ).toBe("/entrar");
    expect(mocks.destination).not.toHaveBeenCalled();
  });
  it("un fallo no filtra registros ni errores privados", async () => {
    mocks.destination.mockRejectedValue(new Error("fictitious-private-data"));
    const result = await GET(request());
    expect(result.headers.get("Location")).toBe("/entrar");
    expect(await result.text()).toBe("");
  });
});
