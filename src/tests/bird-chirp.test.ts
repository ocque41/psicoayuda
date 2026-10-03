import { afterEach, describe, expect, it, vi } from "vitest";
import { playBirdChirp } from "@/lib/practice/bird-chirp";

describe("canto opcional del pajarito", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("no inicia audio en servidor ni en dispositivos sin AudioContext", async () => {
    vi.stubGlobal("window", {});
    expect(await playBirdChirp()).toBe(false);
  });
  it("reproduce tres trinos breves y libera el contexto al terminar", async () => {
    const frequencies: Array<{
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    }> = [];
    const oscillators: Array<{
      onended: null | (() => void);
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const close = vi.fn(async () => {});
    const resume = vi.fn(async () => {});
    const construct = vi.fn();
    class FakeContext {
      state = "running";
      currentTime = 100;
      destination = {};
      resume = resume;
      close = close;
      constructor() {
        construct();
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }
      createOscillator() {
        const frequency = {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        };
        frequencies.push(frequency);
        const oscillator = {
          type: "",
          frequency,
          onended: null as null | (() => void),
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(oscillator);
        return oscillator;
      }
    }
    vi.stubGlobal("window", { AudioContext: FakeContext });
    expect(construct).not.toHaveBeenCalled();
    expect(await playBirdChirp()).toBe(true);
    expect(resume).toHaveBeenCalledOnce();
    expect(oscillators).toHaveLength(3);
    expect(frequencies[0].exponentialRampToValueAtTime).toHaveBeenCalledWith(
      4300,
      100.08999999999999,
    );
    expect(oscillators[2].stop.mock.calls[0][0]).toBeLessThan(101);
    expect(close).not.toHaveBeenCalled();
    oscillators[2].onended?.();
    expect(close).toHaveBeenCalledOnce();
  });
  it("un bloqueo de reproducción devuelve un resultado recuperable y libera audio", async () => {
    const close = vi.fn(async () => {});
    class BlockedContext {
      close = close;
      async resume() {
        throw new Error("bloqueado");
      }
    }
    vi.stubGlobal("window", { AudioContext: BlockedContext });
    expect(await playBirdChirp()).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
});
