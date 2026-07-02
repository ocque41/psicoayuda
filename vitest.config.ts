import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Los suites que tocan la BD (local.db, SQLite) no pueden correr en
    // workers paralelos: dos escritores simultáneos dan SQLITE_BUSY. Con más
    // de un suite de BD hay que serializar archivos; el total sigue en ~2 s.
    fileParallelism: false,
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/_references/**",
      "**/.claude/**",
      "**/*.workers.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/tests/stubs/server-only.ts"),
    },
  },
});
