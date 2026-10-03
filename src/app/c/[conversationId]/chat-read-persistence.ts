/** Guarda sólo la marca de lectura. El contenido del chat no sale de E2EE. */
export function createReadPersistence(
  write: (timestamp: number) => Promise<{ ok: boolean }>,
) {
  let pending = 0;
  let saved = 0;
  let running: Promise<void> | null = null;

  function retry(): Promise<void> {
    if (running) return running;
    if (pending <= saved) return Promise.resolve();
    running = (async () => {
      while (pending > saved) {
        const timestamp = pending;
        try {
          if (!(await write(timestamp)).ok) return;
          saved = timestamp;
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
    record(timestamp: number): Promise<void> {
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
        return Promise.resolve();
      pending = Math.max(pending, timestamp);
      return retry();
    },
  };
}
