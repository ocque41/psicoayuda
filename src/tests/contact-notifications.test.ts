import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));

import { notifyAdminContactMessage } from "@/lib/notifications";

describe("avisos del buzón de contacto", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("intenta avisar a las dos administradoras aunque un envío falle", async () => {
    vi.stubEnv("ADMIN_EMAILS", "ocquema@gmail.com,martinezra02@gmail.com");
    mocks.sendEmail
      .mockRejectedValueOnce(new Error("primer buzón no disponible"))
      .mockResolvedValueOnce(undefined);

    await expect(
      notifyAdminContactMessage({
        sourceLabel: "Página de contacto",
        categoryLabel: "Tengo una pregunta",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: "ocquema@gmail.com" }),
    );
    expect(mocks.sendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: "martinezra02@gmail.com" }),
    );
  });

  it("no intenta enviar si no hay administradores configurados", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");

    await expect(
      notifyAdminContactMessage({
        sourceLabel: "Panel profesional",
        categoryLabel: "Algo no funciona",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
