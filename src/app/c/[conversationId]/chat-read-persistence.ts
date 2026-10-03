/** Guarda sólo la marca de lectura. El contenido del chat no sale de E2EE. */
export function createReadPersistence(
  write: (timestamp: number) => Promise<{ ok: boolean; retryable?: boolean }>,
) {
  let pending = 0;
  let saved = 0;
  let running: Promise<void> | null = null;
  let active = true;
  let generation = 0;
  let cancelDelay: (() => void) | null = null;
  const retryDelays = [250, 1_000];

  function waitForRetry(delay: number, runGeneration: number) {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        cancelDelay = null;
        resolve(active && generation === runGeneration);
      }, delay);
      cancelDelay = () => {
        clearTimeout(timer);
        cancelDelay = null;
        resolve(false);
      };
    });
  }

  function retry(): Promise<void> {
    if (running) return running;
    if (!active || pending <= saved) return Promise.resolve();
    const runGeneration = generation;
    running = (async () => {
      let retryCount = 0;
      while (active && generation === runGeneration && pending > saved) {
        const timestamp = pending;
        try {
          const result = await write(timestamp);
          if (result.ok) saved = Math.max(saved, timestamp);
          if (!active || generation !== runGeneration) return;
          if (result.ok) continue;
          // Sólo el retraso confirmado de metadatos D1 admite dos reintentos.
          // Una marca nueva durante la espera se agrupa en el siguiente envío.
          if (result.retryable !== true || retryCount >= retryDelays.length)
            return;
          if (!(await waitForRetry(retryDelays[retryCount++], runGeneration)))
            return;
        } catch {
          // Una caída de red conserva la marca pendiente para la próxima
          // conexión o vuelta a la pestaña, sin crear un bucle de reintentos.
          return;
        }
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    retry,
    pause() {
      active = false;
      generation += 1;
      cancelDelay?.();
    },
    resume(): Promise<void> {
      if (active) return Promise.resolve();
      active = true;
      const resumeGeneration = generation;
      // StrictMode puede reactivar esta misma cola antes de que termine la
      // escritura anterior. Esperarla evita solapar llamadas o perder pendientes.
      return (running ?? Promise.resolve()).then(() => {
        if (active && generation === resumeGeneration) return retry();
      });
    },
    record(timestamp: number): Promise<void> {
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
        return Promise.resolve();
      pending = Math.max(pending, timestamp);
      return retry();
    },
  };
}
