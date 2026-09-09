import { describe, expect, it } from "vitest";
import {
  ANONYMIZE_AFTER_DAYS,
  CLOSE_AFTER_DAYS,
  retentionThresholds,
} from "@/lib/retention";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("retention thresholds", () => {
  const now = new Date("2026-06-29T12:00:00.000Z");

  it("uses the privacy-policy windows (30 / 90 days)", () => {
    expect(CLOSE_AFTER_DAYS).toBe(30);
    expect(ANONYMIZE_AFTER_DAYS).toBe(90);
  });

  it("computes close/anonymize cutoffs relative to now", () => {
    const { closeBefore, anonymizeBefore } = retentionThresholds(now);

    expect(closeBefore).toBe(
      new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    );
    expect(anonymizeBefore).toBe(
      new Date(now.getTime() - 90 * DAY_MS).toISOString(),
    );
    // Concrete anchors so a regression in the math is obvious.
    expect(closeBefore).toBe("2026-05-30T12:00:00.000Z");
    expect(anonymizeBefore).toBe("2026-03-31T12:00:00.000Z");
  });

  it("closes requests older than 30 days but not fresher ones", () => {
    const { closeBefore } = retentionThresholds(now);
    const stale = new Date(now.getTime() - 31 * DAY_MS).toISOString();
    const fresh = new Date(now.getTime() - 29 * DAY_MS).toISOString();

    expect(stale < closeBefore).toBe(true);
    expect(fresh < closeBefore).toBe(false);
  });

  it("anonymizes requests older than 90 days but not 89-day-old ones", () => {
    const { anonymizeBefore } = retentionThresholds(now);
    const stale = new Date(now.getTime() - 91 * DAY_MS).toISOString();
    const fresh = new Date(now.getTime() - 89 * DAY_MS).toISOString();

    expect(stale < anonymizeBefore).toBe(true);
    expect(fresh < anonymizeBefore).toBe(false);
  });

  it("keeps the anonymize window strictly older than the close window", () => {
    const { closeBefore, anonymizeBefore } = retentionThresholds(now);
    expect(anonymizeBefore < closeBefore).toBe(true);
  });
});
