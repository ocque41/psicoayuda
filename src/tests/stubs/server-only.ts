// Test stub: `server-only` throws when imported outside a server bundle, which
// breaks unit tests that import server modules. Vitest aliases the package to
// this no-op so the pure helpers in those modules can be tested directly.
export {};
