import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Local workerd only: same production compatibility settings, no DB or network.
export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      miniflare: {
        compatibilityDate: "2026-06-28",
        compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["src/tests/web-push-transport.test.ts"],
    fileParallelism: false,
  },
});
