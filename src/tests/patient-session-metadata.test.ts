import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));

import { GET } from "@/app/api/patient/session/route";

beforeEach(() => vi.resetAllMocks());

describe("sesión mínima del espacio del paciente", () => {
  it("entrega sólo dueño y caducidad de la sesión vigente, sin caché ni secretos", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    mocks.session.mockResolvedValue({
      user: {
        id: "fictional-patient-a",
        email: "PRIVATE_EMAIL",
        password: "PRIVATE_PASSWORD",
      },
      session: { expiresAt, token: "PRIVATE_TOKEN" },
    });
    const response = await GET();
    expect(await response.json()).toEqual({
      userId: "fictional-patient-a",
      expiresAt: expiresAt.getTime(),
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.session).toHaveBeenCalledOnce();
  });
  it("no reutiliza la identidad anterior al cambiar cuenta o desaparecer sesión", async () => {
    mocks.session
      .mockResolvedValueOnce({
        user: { id: "fictional-patient-a" },
        session: { expiresAt: new Date(Date.now() + 60_000) },
      })
      .mockResolvedValueOnce({
        user: { id: "fictional-patient-b" },
        session: { expiresAt: new Date(Date.now() + 60_000) },
      })
      .mockResolvedValueOnce(null);
    expect((await (await GET()).json()).userId).toBe("fictional-patient-a");
    expect((await (await GET()).json()).userId).toBe("fictional-patient-b");
    const response = await GET();
    expect(await response.json()).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("fallos de sesión y caducidad ilegible fallan cerrados sin exponer detalles", async () => {
    mocks.session.mockRejectedValueOnce(new Error("PRIVATE_BACKEND_ERROR"));
    mocks.session.mockResolvedValueOnce({
      user: { id: "fictional-patient-a" },
      session: { expiresAt: new Date(NaN) },
    });
    for (let i = 0; i < 2; i++) {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "No pudimos comprobar tu sesión.",
      });
      expect(response.headers.get("vary")).toBe("Cookie");
    }
  });
});
