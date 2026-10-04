import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const browser = process.env.NIDO_GUIDE_BROWSER || "agent-browser";
const run = promisify(execFile);
const session = `nido-workspace-guide-${crypto.randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "nido-workspace-guide-"));
const artifacts = process.env.NIDO_GUIDE_ARTIFACT_DIR;
const checks = [];
let launched = false;
async function cli(...args) {
  const { stdout } = await run(
    browser,
    ["--session", session, "--json", ...args],
    { encoding: "utf8", timeout: 45000 },
  );
  const response = JSON.parse(stdout);
  assert.equal(response.success, true, JSON.stringify(response));
  return response.data;
}
async function evaluate(code) {
  return (await cli("eval", `(()=>{${code}})()`)).result;
}
async function until(predicate) {
  const end = Date.now() + 12000;
  while (!(await evaluate(`return !!(${predicate});`))) {
    if (Date.now() > end) throw new Error(`No se cumplió: ${predicate}`);
    await delay(60);
  }
}
async function check(name, action) {
  await action();
  checks.push(name);
  console.error(name);
}
async function capture(name) {
  if (!artifacts) return;
  await mkdir(artifacts, { recursive: true });
  await cli("screenshot", join(artifacts, `${name}.png`));
}
async function geometry() {
  return evaluate(
    `const nav=document.getElementById('practice-navigation'),p=document.querySelector('[role=dialog]'),b=document.querySelector('span[data-step]');const nr=nav.getBoundingClientRect(),pr=p.getBoundingClientRect(),br=b.getBoundingClientRect();return {panelBottom:pr.bottom,navTop:nr.top,scroll:scrollY,clear:pr.bottom<=nr.top-10,birdClear:br.bottom<=nr.top-10,inside:pr.top>=70&&pr.left>=0&&pr.right<=innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,hit:[...nav.querySelectorAll('a')].filter(a=>{const r=a.getBoundingClientRect();return r.left>=nr.left&&r.right<=nr.right;}).every(a=>{const r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})};`,
  );
}
async function settle() {
  // Dejar que React publique el nuevo destino y que la guía lo mida antes
  // de comprobar el estado: el paso anterior puede estar todavía en reposo.
  await evaluate(
    "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));",
  );
  await until(
    "document.querySelector('span[data-step]') && ['rest','idle'].includes(document.querySelector('span[data-step]').dataset.phase)",
  );
}
async function next() {
  await cli(
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Siguiente",
    "--exact",
  );
}
const navigation = `import {useSyncExternalStore} from 'react';
const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn)};
export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>'/pro/pacientes/ficticio')};`;
const link = `import {createElement} from 'react';export default function Link({href,prefetch,scroll,onClick,...props}){return createElement('a',{...props,href,onClick:e=>{onClick?.(e);if(e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,'',href);dispatchEvent(new Event('popstate'));}})}`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const name = /^\/(fixture\.(js|css)|global\.css)$/.test(pathname)
    ? pathname.slice(1)
    : "index.html";
  response.setHeader(
    "Content-Type",
    name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  response.end(await readFile(join(directory, name)));
});
try {
  await esbuild.build({
    entryPoints: [join(root, "src/tests/fixtures/workspace-guide-browser.tsx")],
    outfile: join(directory, "fixture.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"),
    nodePaths: [join(root, "node_modules")],
    plugins: [
      {
        name: "local-navigation",
        setup(build) {
          build.onResolve(
            { filter: /^next\/(link|navigation)$/ },
            ({ path }) => ({ path, namespace: "fixture-next" }),
          );
          build.onLoad(
            { filter: /.*/, namespace: "fixture-next" },
            ({ path }) => ({
              contents: path === "next/link" ? link : navigation,
              loader: "js",
              resolveDir: root,
            }),
          );
        },
      },
    ],
  });
  await writeFile(
    join(directory, "global.css"),
    (await readFile(join(root, "src/app/globals.css"), "utf8")).replace(
      '@import "tailwindcss";',
      "",
    ),
  );
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nido · Guía y navegación real, prueba local</title><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>',
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/pro/pacientes/ficticio`;
  launched = true;
  await cli("open", url);
  await cli("set", "viewport", "390", "844");
  await cli("snapshot", "-i");
  await cli(
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Conocer este espacio con el pajarito",
    "--exact",
  );
  await settle();
  await check(
    "la guía de navegación no desplaza la página ni tapa la barra móvil real",
    async () => {
      const g = await geometry();
      await capture("01-navegacion-movil");
      console.error(JSON.stringify(g));
      assert.equal(g.scroll, 0);
      assert.ok(
        g.clear && g.birdClear && g.inside && g.hit && !g.overflow,
        JSON.stringify(g),
      );
    },
  );
  await next();
  await until(
    "document.querySelector('span[data-step]')?.dataset.step==='sesiones'",
  );
  await settle();
  await check(
    "una ficha alta deja accesible el menú al pie, sin cubrir el ave",
    async () => {
      const g = await geometry();
      assert.ok(
        g.clear && g.birdClear && g.inside && g.hit && !g.overflow,
        JSON.stringify(g),
      );
      await capture("02-ficha-movil");
    },
  );
  await check(
    "editar conserva foco y borrador con la guía abierta",
    async () => {
      await cli("fill", "#fixture-draft", "Borrador ficticio de navegación");
      assert.equal(
        await evaluate(
          "return document.activeElement.id==='fixture-draft'&&document.activeElement.value==='Borrador ficticio de navegación';",
        ),
        true,
      );
    },
  );
  await check(
    "viewport más bajo mantiene panel y navegación separados",
    async () => {
      await cli("set", "viewport", "390", "640");
      await until(
        "document.querySelector('[role=dialog]').getBoundingClientRect().bottom<=document.getElementById('practice-navigation').getBoundingClientRect().top-10",
      );
      const g = await geometry();
      assert.ok(
        g.clear && g.birdClear && g.inside && g.hit && !g.overflow,
        JSON.stringify(g),
      );
      await capture("03-movil-bajo");
    },
  );
  await check(
    "minimizar y restaurar mantienen la reserva del menú",
    async () => {
      await cli(
        "find",
        "role",
        "button",
        "click",
        "--name",
        "Minimizar guía",
        "--exact",
      );
      assert.ok((await geometry()).clear);
      await cli(
        "find",
        "role",
        "button",
        "click",
        "--name",
        "Mostrar guía",
        "--exact",
      );
      await until(
        "document.querySelector('[role=dialog]').getBoundingClientRect().bottom<=document.getElementById('practice-navigation').getBoundingClientRect().top-10",
      );
    },
  );
  await check(
    "una ruta pulsada desde el menú real desmonta la guía anterior",
    async () => {
      await cli("click", "#practice-navigation a[href='/pro/consulta']");
      await until(
        "location.pathname==='/pro/consulta'&&!document.querySelector('[role=dialog]')",
      );
    },
  );
  await check(
    "movimiento reducido mantiene navegación, foco y geometría",
    async () => {
      await cli("set", "media", "light", "reduced-motion");
      await cli("open", url);
      await cli("snapshot", "-i");
      await cli(
        "find",
        "role",
        "button",
        "click",
        "--name",
        "Conocer este espacio con el pajarito",
        "--exact",
      );
      await settle();
      const g = await geometry();
      assert.ok(g.clear && g.birdClear && g.hit, JSON.stringify(g));
      assert.equal(
        await evaluate(
          "return document.querySelector('span[data-step]').getAnimations({subtree:true}).length===0;",
        ),
        true,
      );
      await cli("press", "Escape");
      await until("!document.querySelector('[role=dialog]')");
      assert.equal(
        await evaluate(
          "return document.activeElement.getAttribute('aria-expanded')==='false';",
        ),
        true,
      );
    },
  );
  await check(
    "escritorio conserva la navegación lateral y la ficha editable",
    async () => {
      await cli("set", "viewport", "1280", "900");
      await cli("set", "media", "light", "no-preference");
      await cli("open", url);
      await cli("snapshot", "-i");
      await cli(
        "find",
        "role",
        "button",
        "click",
        "--name",
        "Conocer este espacio con el pajarito",
        "--exact",
      );
      await settle();
      await next();
      await settle();
      assert.equal(
        await evaluate(
          "const p=document.querySelector('[role=dialog]').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.top>=70&&p.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth;",
        ),
        true,
      );
      await capture("04-escritorio");
    },
  );
  const result = {
    checks: checks.length,
    passed: checks,
    scope:
      "WorkspaceNav y PracticeGuide reales, objetivos estáticos, sin BD ni red externa",
  };
  if (artifacts)
    await writeFile(
      join(artifacts, "checks.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (launched) await cli("close").catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
