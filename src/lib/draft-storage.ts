// Borradores locales con CADUCIDAD. localStorage sobrevive al cierre de pestaña
// (lo que queremos: volver al mismo dispositivo y no perder lo escrito), pero un
// residuo eterno es una fuga en dispositivos compartidos (cibercafés, móviles
// prestados — escenario real del público de Nido). El TTL acota la ventana.
//
// REGLA: no metas PII fuerte (correo, nombre, ubicación) en un borrador del lado
// del formulario de ayuda: ese formulario es público (sin sesión), así que el
// siguiente usuario del mismo navegador lo recuperaría. Guarda solo lo no
// identificable. (Ver auditoría de seguridad 2026-07-01.)

type Envelope<T> = { t: number; v: T };

export function saveDraft(key: string, value: unknown): void {
  try {
    const envelope: Envelope<unknown> = { t: Date.now(), v: value };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // localStorage no disponible (modo privado/lleno): el borrador es un extra.
  }
}

/** Devuelve el borrador si existe y no ha caducado; si caducó o es ilegible, lo
 * borra y devuelve null. Entradas viejas sin sello de tiempo se tratan como
 * caducadas (auto-limpieza del formato anterior). */
export function loadDraft<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope<T>>;
    if (typeof parsed?.t !== "number" || Date.now() - parsed.t > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return (parsed.v ?? null) as T | null;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // noop
    }
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}
