import { beforeEach, describe, expect, it, vi } from "vitest";

const { session, ensureAccount, redirectTo } = vi.hoisted(() => ({
  session: vi.fn(),
  ensureAccount: vi.fn(),
  redirectTo: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: session }));
vi.mock("@/lib/patient/accounts", () => ({
  ensurePatientAccount: ensureAccount,
}));
vi.mock("next/navigation", () => ({ redirect: redirectTo }));

import { requirePatientAccount } from "@/lib/patient/access";

describe("entrada explícita al espacio del paciente", () => {
  beforeEach(() => {
    session.mockReset();
    ensureAccount.mockReset();
    redirectTo.mockClear();
  });
  it("envía una visita sin sesión al acceso general sin crear una cuenta", async () => {
    session.mockResolvedValue(null);
    await expect(requirePatientAccount()).rejects.toThrow("redirect:/entrar");
    expect(ensureAccount).not.toHaveBeenCalled();
  });
  it("envía una cuenta incompleta al onboarding del paciente aunque también tenga recorrido profesional", async () => {
    session.mockResolvedValue({
      user: { id: "fixture-both-roles", name: "Alias ficticio" },
    });
    ensureAccount.mockResolvedValue({
      deletionState: "active",
      onboardingCompletedAt: null,
    });
    await expect(requirePatientAccount()).rejects.toThrow(
      "redirect:/empezar/paciente",
    );
    expect(redirectTo).toHaveBeenCalledExactlyOnceWith("/empezar/paciente");
  });
});
