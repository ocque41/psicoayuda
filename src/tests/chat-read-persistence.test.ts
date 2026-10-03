import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadPersistence } from "@/app/c/[conversationId]/chat-read-persistence";

describe("persistencia de lectura visible", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    vi.useFakeTimers();
    const write = vi.fn();
    if (kind === "red") write.mockRejectedValueOnce(new Error("offline"));
    else write.mockResolvedValueOnce({ ok: false });
    write.mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    await queue.record(100);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await queue.retry();
    await queue.record(99);
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 100,
    ]);
  });

  it("reintenta el retraso confirmado a los 250 y 1000 ms y detiene al guardar", async () => {
    vi.useFakeTimers();
    const write = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    const pending = queue.record(100);
    await vi.advanceTimersByTimeAsync(249);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(write).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 100, 100,
    ]);
    expect(vi.getTimerCount()).toBe(0);
    await queue.retry();
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("agrupa en la marca más alta sin adelantar la espera ni solapar llamadas", async () => {
    vi.useFakeTimers();
    let resolveRetry!: (value: { ok: boolean }) => void;
    const write = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            resolveRetry = resolve;
          }),
      )
      .mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    const first = queue.record(100);
    await vi.advanceTimersByTimeAsync(100);
    const second = queue.record(200);
    const third = queue.record(300);
    await vi.advanceTimersByTimeAsync(149);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 300,
    ]);
    const fourth = queue.record(500);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(write).toHaveBeenCalledTimes(2);
    resolveRetry({ ok: true });
    await Promise.all([first, second, third, fourth]);
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 300, 500,
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("agota dos reintentos y conserva la marca para la siguiente vuelta visible", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue({ ok: false, retryable: true });
    const queue = createReadPersistence(write);
    const pending = queue.record(100);
    await vi.advanceTimersByTimeAsync(1_250);
    await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    write.mockResolvedValue({ ok: true });
    await queue.retry();
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 100, 100, 100,
    ]);
    await queue.retry();
    expect(write).toHaveBeenCalledTimes(4);
  });

  it.each([
    "red",
    "revocación",
  ])("detiene los reintentos si aparece un fallo de %s después del retraso", async (kind) => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValueOnce({ ok: false, retryable: true });
    if (kind === "red") write.mockRejectedValue(new Error("offline"));
    else write.mockResolvedValue({ ok: false });
    const queue = createReadPersistence(write);
    const pending = queue.record(100);
    await vi.advanceTimersByTimeAsync(250);
    await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancela el timer al desmontar y conserva pendientes sin nuevas escrituras", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue({ ok: false, retryable: true });
    const queue = createReadPersistence(write);
    const pending = queue.record(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(1);
    queue.pause();
    await pending;
    await queue.record(200);
    await queue.retry();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    write.mockResolvedValue({ ok: true });
    await queue.resume();
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 200,
    ]);
  });

  it("reactiva la misma cola en StrictMode sin solapar una escritura anterior", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: { ok: boolean; retryable: boolean }) => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean; retryable: boolean }>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({ ok: true });
    const queue = createReadPersistence(write);
    const first = queue.record(100);
    queue.pause();
    const remounted = queue.resume();
    const second = queue.record(200);
    expect(write).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: false, retryable: true });
    await Promise.all([first, second, remounted]);
    expect(write.mock.calls.map(([timestamp]) => timestamp)).toEqual([
      100, 200,
    ]);
    expect(vi.getTimerCount()).toBe(0);
    await queue.resume();
    await queue.retry();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("descarta la espera anterior al cambiar de conversación", async () => {
    vi.useFakeTimers();
    const oldWrite = vi.fn().mockResolvedValue({ ok: false, retryable: true });
    const oldQueue = createReadPersistence(oldWrite);
    const pending = oldQueue.record(100);
    await vi.advanceTimersByTimeAsync(100);
    oldQueue.pause();
    const nextWrite = vi.fn().mockResolvedValue({ ok: true });
    const nextQueue = createReadPersistence(nextWrite);
    await nextQueue.record(200);
    await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(oldWrite).toHaveBeenCalledTimes(1);
    expect(nextWrite.mock.calls.map(([timestamp]) => timestamp)).toEqual([200]);
    expect(vi.getTimerCount()).toBe(0);
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
