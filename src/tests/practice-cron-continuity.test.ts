import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  practice: vi.fn(),
  reminders: vi.fn(),
  calendar: vi.fn(),
}));
vi.mock("@/lib/practice/jobs", () => ({ runPracticeJobs: mocks.practice }));
vi.mock("@/lib/practice/reminders", () => ({
  runAppointmentReminderJobs: mocks.reminders,
}));
vi.mock("@/lib/calendar/sync", () => ({
  syncConnectedGoogleCalendars: mocks.calendar,
}));

import { POST } from "@/app/api/internal/practice/route";

const request = (authorized = true) =>
  new Request("https://example.test/api/internal/practice", {
    method: "POST",
    headers: authorized
      ? { "x-nido-internal": "fictitious-internal-secret" }
      : {},
  });
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("cron privado con trabajos independientes", () => {
  it("rechaza llamadas sin secreto antes de ejecutar tareas", async () => {
    vi.stubEnv("INTERNAL_NOTIFY_SECRET", "fictitious-internal-secret");
    expect((await POST(request(false))).status).toBe(401);
    expect(mocks.reminders).not.toHaveBeenCalled();
    expect(mocks.calendar).not.toHaveBeenCalled();
  });
  it("espera las otras tareas aunque una rechace y no expone detalles", async () => {
    vi.stubEnv("INTERNAL_NOTIFY_SECRET", "fictitious-internal-secret");
    mocks.practice.mockRejectedValueOnce(
      new Error("private-fictitious-detail"),
    );
    mocks.reminders.mockResolvedValueOnce({ dead: 0, sent: 1 });
    let finish: (value: { failed: number }) => void = () => {};
    mocks.calendar.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let complete = false;
    const task = POST(request()).then((response) => {
      complete = true;
      return response;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(complete).toBe(false);
    finish({ failed: 0 });
    const response = await task;
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('"sent":1');
    expect(body).not.toContain("private-fictitious-detail");
    expect(mocks.calendar).toHaveBeenCalledWith(1);
  });
  it("un dead letter es observable sin impedir los otros resultados", async () => {
    vi.stubEnv("INTERNAL_NOTIFY_SECRET", "fictitious-internal-secret");
    mocks.practice.mockResolvedValueOnce({ offered: 2, purged: 1, failed: 0 });
    mocks.reminders.mockResolvedValueOnce({ dead: 1, sent: 0 });
    mocks.calendar.mockResolvedValueOnce({ failed: 0, updated: 1 });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      offered: 2,
      purged: 1,
      reminders: { dead: 1 },
      calendar: { updated: 1 },
    });
  });
});
