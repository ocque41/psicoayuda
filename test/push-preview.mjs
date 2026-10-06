import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Loopback-only UI fixture. No Next build, DB, session or notification provider.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const directory = await mkdtemp(join(tmpdir(), "nido-push-preview-"));
const server = createServer(async (request, response) => {
  const name =
    new URL(request.url || "/", "http://127.0.0.1").pathname.slice(1) ||
    "index.html";
  if (!/^(index\.html|fixture\.(js|css))$/.test(name)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader(
    "Content-Type",
    name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  response.setHeader("Cache-Control", "no-store");
  try {
    response.end(await readFile(join(directory, name)));
  } catch {
    response.writeHead(500).end();
  }
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
try {
  await esbuild.build({
    entryPoints: [join(root, "src/tests/fixtures/push-browser.tsx")],
    outfile: join(directory, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"),
    nodePaths: [join(root, "node_modules")],
  });
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nido · Avisos ficticios</title><link rel="stylesheet" href="fixture.css"></head><body style="margin:0;font-family:system-ui;background:#f5f3ee"><div id="root"></div><script src="fixture.js"></script></body></html>',
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}`,
      fixture:
        "PushPreferencesPanel real; permisos, proveedor y sesión simulados",
    }),
  );
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  await close();
  throw error;
}
