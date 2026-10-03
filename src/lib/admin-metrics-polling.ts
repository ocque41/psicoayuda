import { type AdminMetrics, isAdminMetrics } from "@/shared/admin-metrics";

const REFRESH_MS = 30_000;
const TIMEOUT_MS = 20_000;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 120_000;

export type MetricsPollingState = {
  loading: boolean;
  error: "unavailable" | "unauthorized" | null;
  nextRetryMs: number | null;
};
export type MetricsPoller = {
  refresh: () => void;
  retry: () => void;
  pause: () => void;
  stop: () => void;
};

/** Una petición por panel; al ocultarse o desmontarse no queda trabajo activo. */
export function createMetricsPoller({
  onData,
  onState,
  isVisible,
  fetcher = fetch,
}: {
  onData: (metrics: AdminMetrics) => void;
  onState: (state: MetricsPollingState) => void;
  isVisible: () => boolean;
  fetcher?: typeof fetch;
}): MetricsPoller {
  let stopped = false;
  let denied = false;
  let failures = 0;
  let epoch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: { cancel: () => void } | undefined;
  let state: MetricsPollingState = {
    loading: false,
    error: null,
    nextRetryMs: null,
  };

  function publish(next: MetricsPollingState) {
    state = next;
    onState(next);
  }
  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function cancelActive() {
    epoch += 1;
    active?.cancel();
    active = undefined;
  }
  function schedule(delay: number) {
    clearTimer();
    if (!stopped && !denied && isVisible()) {
      timer = setTimeout(refresh, delay);
    }
  }

  async function load() {
    const current = ++epoch;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelDeadline: () => void = () => {};
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("metrics_timeout"));
      }, TIMEOUT_MS);
      cancelDeadline = () => {
        clearTimeout(timeout);
        controller.abort();
        reject(new DOMException("Aborted", "AbortError"));
      };
    });
    active = { cancel: cancelDeadline };
    publish({ ...state, loading: true, nextRetryMs: null });
    let nextDelay: number | null = null;
    let retryAfter = 0;
    const currentRequest = () => !stopped && current === epoch;
    try {
      const response = await Promise.race([
        fetcher("/api/admin/metrics", {
          cache: "no-store",
          signal: controller.signal,
        }),
        deadline,
      ]);
      if (!currentRequest()) return;
      if (response.status === 401 || response.status === 403) {
        denied = true;
        publish({ loading: false, error: "unauthorized", nextRetryMs: null });
        return;
      }
      const retrySeconds = Number(response.headers.get("Retry-After"));
      if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
        retryAfter = Math.min(RETRY_MAX_MS, retrySeconds * 1000);
      }
      if (!response.ok) throw new Error("metrics_http_error");
      const body: unknown = await Promise.race([response.json(), deadline]);
      if (!currentRequest()) return;
      if (!isAdminMetrics(body)) throw new Error("metrics_invalid_response");
      failures = 0;
      denied = false;
      onData(body);
      publish({ loading: false, error: null, nextRetryMs: null });
      nextDelay = REFRESH_MS;
    } catch {
      if (!currentRequest()) return;
      failures += 1;
      nextDelay = Math.max(
        retryAfter,
        Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(failures - 1, 5)),
      );
      publish({ loading: false, error: "unavailable", nextRetryMs: nextDelay });
    } finally {
      clearTimeout(timeout);
      if (currentRequest()) {
        active = undefined;
        if (nextDelay !== null) schedule(nextDelay);
      }
    }
  }

  function refresh() {
    if (stopped || denied || active || !isVisible()) return;
    clearTimer();
    void load();
  }
  return {
    refresh,
    retry() {
      if (stopped || active) return;
      denied = false;
      failures = 0;
      refresh();
    },
    pause() {
      clearTimer();
      cancelActive();
      if (!stopped) publish({ ...state, loading: false, nextRetryMs: null });
    },
    stop() {
      stopped = true;
      clearTimer();
      cancelActive();
    },
  };
}
