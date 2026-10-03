import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMetricsPoller,
  type MetricsPoller,
  type MetricsPollingState,
} from "@/lib/admin-metrics-polling";
import type { AdminMetrics } from "@/shared/admin-metrics";

function metrics(total = 42): AdminMetrics {
  return {
    generatedAt: 1_790_000_000_000,
    total,
    last24: total,
    approvedPros: 2,
    inPersonPros: 1,
    requests: 3,
    windows: (["24h", "7d", "30d"] as const).map((key) => ({
      key,
      label: key,
      total,
      professionalContacts: 1,
      allyContacts: 0,
      ctas: 0,
      leads: 0,
      signups: 0,
      emailClicks: 0,
      contactForms: 0,
      referralShares: 0,
      referralSignups: 0,
    })),
    bySource: [],
    byCampaign: [],
    byType: [],
    psychologists: [],
    aliados: [],
    contactEmails: [],
    recent: [],
    truncated: {
      bySource: false,
      byCampaign: false,
      byType: false,
      psychologists: false,
      aliados: false,
      contactEmails: false,
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function ok(total = 42) {
  return Response.json(metrics(total));
}
let poller: MetricsPoller;
const fetcher = vi.fn<typeof fetch>();
let visible: boolean;
let lastData: AdminMetrics | undefined;
let lastState: MetricsPollingState | undefined;
let states: MetricsPollingState[];
const onData = vi.fn<(data: AdminMetrics) => void>();
beforeEach(() => {
  vi.useFakeTimers();
  fetcher.mockReset();
  visible = true;
  lastData = undefined;
  lastState = undefined;
  states = [];
  onData.mockReset().mockImplementation((data) => {
    lastData = data;
  });
  poller = createMetricsPoller({
    onData,
    onState: (state) => {
      lastState = state;
      states.push(state);
    },
    isVisible: () => visible,
    fetcher,
  });
});
afterEach(() => {
  poller.stop();
  vi.useRealTimers();
});
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("sondeo de métricas con transporte y reloj simulados", () => {
  it("no solapa refrescos manuales ni repetidos mientras hay una petición activa", async () => {
    const pending = deferred<Response>();
    fetcher.mockReturnValueOnce(pending.promise).mockResolvedValue(ok());
    poller.refresh();
    poller.refresh();
    poller.retry();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    pending.resolve(ok());
    await settle();
    expect(lastData?.total).toBe(42);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("conserva la última lectura y usa backoff hasta recuperarse", async () => {
    fetcher
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(ok(45))
      .mockResolvedValue(ok(46));
    poller.refresh();
    await settle();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lastData?.total).toBe(42);
    expect(lastState).toMatchObject({
      error: "unavailable",
      loading: false,
      nextRetryMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(lastData?.total).toBe(42);
    expect(lastState?.nextRetryMs).toBe(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lastData?.total).toBe(45);
    expect(lastState?.error).toBeNull();
    expect(onData.mock.calls.map(([data]) => data.total)).toEqual([42, 45]);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("respeta Retry-After con un máximo de dos minutos", async () => {
    fetcher
      .mockResolvedValueOnce(
        new Response(null, { status: 503, headers: { "Retry-After": "300" } }),
      )
      .mockResolvedValue(ok());
    poller.refresh();
    await settle();
    expect(lastState?.nextRetryMs).toBe(120_000);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(lastData?.total).toBe(42);
  });

  it("acota también el backoff de fallos sucesivos", async () => {
    fetcher.mockRejectedValue(new Error("offline"));
    poller.refresh();
    await settle();
    for (const delay of [
      5_000, 10_000, 20_000, 40_000, 80_000, 120_000, 120_000,
    ]) {
      expect(lastState?.nextRetryMs).toBe(delay);
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(lastState?.nextRetryMs).toBe(120_000);
  });

  it.each([
    "incomplete",
    "negative",
    "invalid-json",
  ])("una respuesta %s no reemplaza datos válidos por ceros", async (kind) => {
    const invalid = metrics(0) as Partial<AdminMetrics>;
    if (kind === "incomplete") delete invalid.windows;
    if (kind === "negative") invalid.total = -1;
    fetcher
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(
        kind === "invalid-json"
          ? new Response("invalid-json")
          : Response.json(invalid),
      );
    poller.refresh();
    await settle();
    poller.refresh();
    await settle();
    expect(lastData?.total).toBe(42);
    expect(lastState?.error).toBe("unavailable");
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("aborta una petición bloqueada al vencerse el plazo y reintenta", async () => {
    fetcher
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(ok());
    poller.refresh();
    const signal = fetcher.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(signal?.aborted).toBe(true);
    expect(lastState).toMatchObject({
      error: "unavailable",
      nextRetryMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(lastData?.total).toBe(42);
  });

  it("el plazo cubre la lectura del cuerpo, aunque los headers ya hayan llegado", async () => {
    const body = deferred<AdminMetrics>();
    const response = ok();
    vi.spyOn(response, "json").mockReturnValueOnce(body.promise);
    fetcher.mockResolvedValueOnce(response);
    poller.refresh();
    await settle();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(lastState?.error).toBe("unavailable");
    body.resolve(metrics());
    await settle();
    expect(onData).not.toHaveBeenCalled();
  });

  it("al ocultar la página aborta, descarta la respuesta vieja y recupera una sola lectura al volver", async () => {
    const pending = deferred<Response>();
    fetcher.mockReturnValueOnce(pending.promise).mockResolvedValue(ok(50));
    poller.refresh();
    const signal = fetcher.mock.calls[0][1]?.signal;
    visible = false;
    poller.pause();
    expect(signal?.aborted).toBe(true);
    pending.resolve(ok(1));
    await settle();
    poller.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onData).not.toHaveBeenCalled();
    visible = true;
    poller.refresh();
    poller.refresh();
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(lastData?.total).toBe(50);
  });

  it("al desmontar aborta y no publica estados ni datos tardíos", async () => {
    const pending = deferred<Response>();
    fetcher.mockReturnValueOnce(pending.promise);
    poller.refresh();
    const count = states.length;
    const signal = fetcher.mock.calls[0][1]?.signal;
    poller.stop();
    pending.resolve(ok());
    await vi.advanceTimersByTimeAsync(120_000);
    expect(signal?.aborted).toBe(true);
    expect(onData).not.toHaveBeenCalled();
    expect(states).toHaveLength(count);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    401, 403,
  ])("un %s detiene el sondeo y permite reintentar tras iniciar sesión", async (status) => {
    fetcher
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(ok(60));
    poller.refresh();
    await settle();
    poller.refresh();
    await settle();
    expect(lastState).toMatchObject({
      error: "unauthorized",
      nextRetryMs: null,
    });
    await vi.advanceTimersByTimeAsync(120_000);
    poller.refresh();
    expect(fetcher).toHaveBeenCalledTimes(2);
    poller.retry();
    await settle();
    expect(lastState?.error).toBeNull();
    expect(lastData?.total).toBe(60);
  });
});
