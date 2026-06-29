// Bindings del Worker disponibles dentro del Durable Object y el custom worker.
export interface Env {
  DB: D1Database;
  Conversation: DurableObjectNamespace;
  ASSETS?: Fetcher;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  INTERNAL_NOTIFY_SECRET?: string;
}
