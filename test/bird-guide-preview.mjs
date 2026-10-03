import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// La misma fixture de regresión, sólo en loopback: sin Next, BD ni proveedores.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const port = Number(process.env.NIDO_GUIDE_PREVIEW_PORT || 8798);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Puerto de preview inválido");
const directory = await mkdtemp(join(tmpdir(), "nido-guide-preview-"));
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
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
    response.writeHead(500).end("No se pudo leer la fixture local");
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
    entryPoints: [join(root, "src/tests/fixtures/bird-guide-browser.tsx")],
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
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pajarito · Preview local ficticio</title><link rel="stylesheet" href="fixture.css"><style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui;background:#faf6f0;color:#2b2723}main{max-width:1080px;margin:auto;padding:24px 16px 180px}label,input{display:block}input{width:100%;margin:8px 0 16px;padding:10px}button{cursor:pointer}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>',
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${port}/?windows=1`,
      fixture: "BirdGuide real, ejemplos ficticios, una ventana visible",
    }),
  );
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  await close();
  throw error;
}
