import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// La demo real en React, sólo en loopback: sin Next, BD ni proveedores.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const port = Number(process.env.NIDO_GUIDE_PREVIEW_PORT || 8798);
if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535)
  throw new Error("Puerto de preview inválido");
const directory = await mkdtemp(join(tmpdir(), "nido-guide-preview-"));
const regression = process.env.NIDO_GUIDE_PREVIEW_FIXTURE === "bird";
const practice = process.env.NIDO_GUIDE_PREVIEW_FIXTURE === "practice";
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  if (
    practice &&
    ["/api/auth/get-session", "/api/admin/status"].includes(pathname)
  ) {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        pathname.endsWith("get-session")
          ? { user: { id: "fixture-professional" } }
          : { isAdmin: false, isAdmissionReviewer: false },
      ),
    );
    return;
  }
  const name =
    pathname === "/" || (practice && pathname.startsWith("/pro/"))
      ? "index.html"
      : pathname.slice(1);
  if (pathname === "/brand/nido-icon-128.png") {
    response.setHeader("Content-Type", "image/png");
    response.end(await readFile(join(root, "public/brand/nido-icon-128.png")));
    return;
  }
  if (!/^(index\.html|demo-global\.css|fixture\.(js|css))$/.test(name)) {
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
    entryPoints: [
      join(
        root,
        practice
          ? "src/tests/fixtures/practice-guide-entry-browser.tsx"
          : regression
            ? "src/tests/fixtures/bird-guide-browser.tsx"
            : "src/tests/fixtures/practice-demo-browser.tsx",
      ),
    ],
    outfile: join(directory, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"),
    nodePaths: [join(root, "node_modules")],
    plugins: [
      {
        name: "next-preview-dom",
        setup(build) {
          if (practice) {
            build.onResolve(
              { filter: /^@\/app\/actions-chat-session$/ },
              () => ({ path: "fixture-action", namespace: "preview-dom" }),
            );
          }
          build.onResolve(
            { filter: /^next\/(link|image|navigation)$/ },
            ({ path }) => ({
              path,
              namespace: "preview-dom",
            }),
          );
          build.onLoad(
            { filter: /.*/, namespace: "preview-dom" },
            ({ path }) => ({
              contents:
                path === "fixture-action"
                  ? 'export async function clearChatSessionCookies(){throw new Error("Fixture sin acciones de servidor")}'
                  : path === "next/navigation"
                    ? 'import {useSyncExternalStore} from "react";const subscribe=fn=>{window.addEventListener("popstate",fn);return()=>window.removeEventListener("popstate",fn)};export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>"/pro/consulta")};export function useSearchParams(){return new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search,()=>""))}'
                    : practice && path === "next/link"
                      ? 'import {createElement} from "react";export default function Link({href,prefetch,onClick,...props}){return createElement("a",{...props,href,onClick:e=>{onClick?.(e);if(e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,"",href);dispatchEvent(new Event("popstate"));}})}'
                      : path === "next/link"
                        ? 'import {createElement} from "react";export default function Link({href,prefetch,...props}){return createElement("a",{...props,href});}'
                        : 'import {createElement} from "react";export default function Image({src,priority,quality,unoptimized,fill,loader,...props}){return createElement("img",{...props,src});}',
              loader: "js",
              resolveDir: root,
            }),
          );
        },
      },
    ],
  });
  await writeFile(
    join(directory, "demo-global.css"),
    (await readFile(join(root, "src/app/globals.css"), "utf8")).replace(
      '@import "tailwindcss";',
      "",
    ),
  );
  await writeFile(
    join(directory, "index.html"),
    practice
      ? '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nido · Guía profesional, fixture local</title><link rel="stylesheet" href="/demo-global.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'
      : '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nido · Demo con pajarito</title><link rel="stylesheet" href="demo-global.css"><link rel="stylesheet" href="fixture.css"></head><body><main id="root"></main><script src="fixture.js"></script></body></html>',
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}/?windows=1`,
      fixture: practice
        ? "PracticeGuide, AppFrame y navegación reales; sesión/objetivos ficticios"
        : regression
          ? "BirdGuide de regresión"
          : "PracticeDemo real, ejemplos locales, pajarito entre lecturas",
    }),
  );
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
} catch (error) {
  await close();
  throw error;
}
