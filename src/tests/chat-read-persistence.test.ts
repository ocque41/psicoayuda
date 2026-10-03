import { describe, expect, it, vi } from "vitest";
import { createReadPersistence } from "@/app/c/[conversationId]/chat-read-persistence";

describe("persistencia de lectura visible", () => {
  it("agrupa las marcas nuevas mientras hay una escritura pendiente", async () => {
    let resolveFirst!: (value: { ok: boolean }) => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    const first = queue.record(100);
    const second = queue.record(200);
    const third = queue.record(300);
    expect(write).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: true });
    await Promise.all([first, second, third]);
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 300,
    ]);
  });

  it.each([
    "rechazo",
    "red",
  ])("conserva la última marca tras fallo de %s sin bucle", async (kind) => {
    const write = vi.fn();
    if (kind === "red") write.mockRejectedValueOnce(new Error("offline"));
    else write.mockResolvedValueOnce({ ok: false });
    write.mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    await queue.record(100);
    expect(write).toHaveBeenCalledTimes(1);
    await queue.retry();
    await queue.record(99);
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 100,
    ]);
  });

  it("ignora marcas inválidas y no vuelve a guardar mensajes ya leídos", async () => {
    const write = vi.fn().mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    for (const value of [NaN, Infinity, -1, 0, 1.5]) await queue.record(value);
    expect(write).not.toHaveBeenCalled();
    await queue.record(100);
    await queue.record(100);
    await queue.record(50);
    await queue.retry();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
