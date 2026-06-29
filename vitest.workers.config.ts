import path from "node:path";

// Config para los tests que corren DENTRO de workerd (miniflare) vía el pool de
// Cloudflare. Objeto plano (no defineConfig) para no acoplar a tipos del pool.
const config = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["test/**/*.workers.test.ts"],
    pool: "@cloudflare/vitest-pool-workers",
    poolOptions: {
      workers: {
        singleWorker: true,
        isolatedStorage: true,
        main: "./test/chat-worker.ts",
        miniflare: {
          compatibilityDate: "2026-06-28",
          compatibilityFlags: ["nodejs_compat"],
          durableObjects: {
            Conversation: { className: "Conversation", useSQLite: true },
          },
          bindings: {
            BETTER_AUTH_SECRET: "test-secret",
            BETTER_AUTH_URL: "https://internal.test",
            INTERNAL_NOTIFY_SECRET: "test-secret",
          },
        },
      },
    },
  },
};

export default config;
