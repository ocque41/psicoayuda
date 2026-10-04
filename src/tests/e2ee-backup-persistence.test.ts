import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStoredRecoveryCode: vi.fn(),
  createRecoveryBackup: vi.fn(),
  refreshRecoveryBackup: vi.fn(),
}));
vi.mock("@/lib/e2ee-client", () => mocks);

import { persistRecoveryBackup } from "@/lib/e2ee-backup";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStoredRecoveryCode.mockResolvedValue(null);
  mocks.createRecoveryBackup.mockResolvedValue({
    code: "fictional-code",
    id: "fictional-id",
    wrapped: "ciphertext",
  });
});
describe("confirmación del respaldo recuperable", () => {
  it("no revela un código si el servidor rechaza el guardado", async () => {
    expect(
      await persistRecoveryBackup(
        "seeker",
        vi.fn(async () => ({ ok: false })),
      ),
    ).toEqual({ ok: false });
  });
  it("no declara éxito ante una excepción", async () => {
    expect(
      await persistRecoveryBackup(
        "professional",
        vi.fn(async () => {
          throw new Error("offline");
        }),
      ),
    ).toEqual({ ok: false });
  });
  it("un reintento actualiza con el mismo código y sólo lo devuelve tras confirmación", async () => {
    mocks.getStoredRecoveryCode.mockResolvedValue("same-code");
    mocks.refreshRecoveryBackup.mockResolvedValue({
      id: "same-id",
      wrapped: "updated-ciphertext",
    });
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    expect(await persistRecoveryBackup("professional", save)).toEqual({
      ok: false,
    });
    expect(await persistRecoveryBackup("professional", save)).toEqual({
      ok: true,
      code: "same-code",
      created: false,
    });
    expect(save).toHaveBeenNthCalledWith(
      2,
      "same-id",
      "updated-ciphertext",
      "professional",
    );
    expect(mocks.createRecoveryBackup).not.toHaveBeenCalled();
  });
  it("el primer código requiere una escritura positiva", async () => {
    expect(
      await persistRecoveryBackup("seeker", async () => ({ ok: true })),
    ).toEqual({ ok: true, code: "fictional-code", created: true });
  });
});
