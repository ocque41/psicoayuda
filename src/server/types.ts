// Bindings generados desde wrangler.jsonc; secretos opcionales del chat se añaden
// aparte. El runtime de prueba puede proporcionar solo los usados por su Worker.
export interface Env extends WorkerBindings {
  INTERNAL_NOTIFY_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}
