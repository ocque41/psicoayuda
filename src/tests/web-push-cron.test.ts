import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  practice: vi.fn(),
  email: vi.fn(),
  calendar: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/practice/jobs", () => ({ runPracticeJobs: jobs.practice }));
vi.mock("@/lib/practice/reminders", () => ({
  runAppointmentReminderJobs: jobs.email,
}));
vi.mock("@/lib/calendar/sync", () => ({
  syncConnectedGoogleCalendars: jobs.calendar,
}));
vi.mock("@/lib/push/jobs", () => ({ runWebPushJobs: jobs.push }));

import { POST } from "@/app/api/internal/practice/route";

const request = (key = "fixture-internal") =>
  new Request("https://nido.example.invalid/api/internal/practice", {
    method: "POST",
    headers: { "x-nido-internal": key },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_NOTIFY_SECRET", "fixture-internal");
  jobs.practice.mockResolvedValue({ offered: 0, purged: 0, failed: 0 });
  jobs.email.mockResolvedValue({ sent: 0, dead: 0 });
  jobs.calendar.mockResolvedValue({
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  });
  jobs.push.mockResolvedValue({ enabled: false, failed: 0, complete: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("actual authenticated practice cron with independent Push", () => {
  it("rejects unauthorized invocations without starting any job", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    for (const job of Object.values(jobs)) expect(job).not.toHaveBeenCalled();
  });
  it("keeps email, calendar and practice enabled independently of a disabled Push provider", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      ok: true,
      reminders: { dead: 0 },
      calendar: { failed: 0 },
      push: { enabled: false },
    });
    for (const job of Object.values(jobs)) expect(job).toHaveBeenCalledOnce();
  });
  it.each([
    "practice",
    "email",
    "calendar",
    "push",
  ] as const)("settles all jobs and reports failure when %s rejects", async (name) => {
    jobs[name].mockRejectedValue(new Error("fixture-private-detail"));
    const result = await POST(request());
    expect(result.status).toBe(500);
    const body = await result.json();
    expect(body).toMatchObject({ ok: false });
    expect(JSON.stringify(body)).not.toContain("fixture-private-detail");
    for (const job of Object.values(jobs)) expect(job).toHaveBeenCalledOnce();
  });
  it.each([
    { failed: 1, complete: false, exhausted: true },
    { failed: 0, complete: false, exhausted: true },
    { failed: 1, complete: true, retried: 1 },
    { failed: 1, complete: true, dead: 1 },
  ])("does not claim success for unfinished or failing Push $complete/$failed", async (summary) => {
    jobs.push.mockResolvedValue(summary);
    expect((await POST(request())).status).toBe(500);
  });
});
