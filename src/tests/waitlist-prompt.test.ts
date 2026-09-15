import { describe, expect, it } from "vitest";
import {
  buildWaitlistPromptPayload,
  isWaitlistPromptPayload,
  WAITLIST_PROMPT_MARKER,
  WAITLIST_PROMPT_VERSION,
} from "@/shared/waitlist-prompt";

describe("payload de la tarjeta de lista de espera", () => {
  it("se construye y se reconoce", () => {
    const payload = buildWaitlistPromptPayload();
    expect(JSON.parse(payload)).toEqual({
      nido: WAITLIST_PROMPT_MARKER,
      v: WAITLIST_PROMPT_VERSION,
    });
    expect(isWaitlistPromptPayload(payload)).toBe(true);
  });

  it("no confunde texto humano ni JSON ajeno", () => {
    expect(isWaitlistPromptPayload("Hola, ¿cómo estás?")).toBe(false);
    expect(isWaitlistPromptPayload("{}")).toBe(false);
    expect(isWaitlistPromptPayload('{"nido":"otra-cosa","v":1}')).toBe(false);
    expect(
      isWaitlistPromptPayload('{"nido":"nido:waitlist-prompt","v":2}'),
    ).toBe(false);
    expect(
      isWaitlistPromptPayload('{"nido":"nido:waitlist-prompt","v":1} extra'),
    ).toBe(false);
    expect(isWaitlistPromptPayload("")).toBe(false);
    expect(isWaitlistPromptPayload(null)).toBe(false);
    expect(isWaitlistPromptPayload(undefined)).toBe(false);
  });
});
