import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountSessionCallbackUrl,
  accountSessionDestination,
} from "@/lib/account-session-callback";

const mocks = vi.hoisted(() => ({ session: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import AccountSessionReady from "@/app/auth/session-ready/page";

beforeEach(() => vi.resetAllMocks());
describe("retorno de autenticación externa", () => {
  it("conserva destinos internos y la conversión de alta, sin redirecciones externas ni ciclos", () => {
    const destination = "/pro/dashboard?conversion=signup#cuenta";
    const callback = new URL(
      accountSessionCallbackUrl(destination),
      "https://nido.local",
    );
    expect(callback.pathname).toBe("/auth/session-ready");
    expect(callback.searchParams.get("destino")).toBe(destination);
    for (const invalid of [
      undefined,
      ["/mi"],
      "https://external.test",
      "//external.test",
      "/\\external.test",
      "/mi\n",
      "/auth/session-ready",
      "/x/../auth/session-ready",
    ])
      expect(accountSessionDestination(invalid)).toBe("/empezar");
    expect(accountSessionDestination("/mi?pagina=2")).toBe("/mi?pagina=2");
  });

  it("sólo monta el anuncio del retorno después de una sesión real y no expone su identidad", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "fictional-private-owner" },
    });
    const result = await AccountSessionReady({
      searchParams: Promise.resolve({ destino: "/mi" }),
    });
    expect(result.props).toEqual({ destination: "/mi" });
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sin sesión redirige al acceso sin anunciar una autenticación exitosa", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirect");
    });
    await expect(
      AccountSessionReady({
        searchParams: Promise.resolve({ destino: "/mi" }),
      }),
    ).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/entrar");
  });
});
