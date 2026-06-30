import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Config para los tests que corren DENTRO de workerd (miniflare) vía el pool de
// Cloudflare. Vitest 4 eliminó `test.poolOptions`: el pool se registra ahora como
// plugin (`cloudflareTest(...)`) con las opciones que antes vivían en
// `poolOptions.workers` (ver el codemod vitest-v3-to-v4 del propio paquete).
export default defineConfig({
  plugins: [
    cloudflareTest({
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
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["test/**/*.workers.test.ts"],
  },
});
