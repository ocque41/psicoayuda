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

// React real, datos ficticios y servidor efímero: no Next, BD ni proveedores.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const browser = process.env.NIDO_GUIDE_BROWSER || "agent-browser";
const runBrowser = promisify(execFile);
const session = `nido-guide-modal-${crypto.randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "nido-guide-regression-"));
const checks = [];
const artifacts = process.env.NIDO_GUIDE_ARTIFACT_DIR;
async function capture(name) {
  if (!artifacts) return;
  await mkdir(artifacts, { recursive: true });
  await cli("screenshot", join(artifacts, `${name}.png`));
}
let launched = false;
async function cli(...args) {
  const { stdout } = await runBrowser(
    browser,
    ["--session", session, "--json", ...args],
    { encoding: "utf8", timeout: args[0] === "open" ? 45000 : 30000 },
  );
  const result = JSON.parse(stdout);
  assert.equal(
    result.success,
    true,
    "Falló la automatización de la guía ficticia",
  );
  return result.data;
}
async function evaluate(code) {
  return (await cli("eval", `(()=>{${code}})()`)).result;
}
async function until(predicate) {
  const end = Date.now() + 8000;
  while (!(await evaluate(`return !!(${predicate});`))) {
    if (Date.now() > end)
      throw new Error("La guía ficticia no completó la transición");
    await delay(30);
  }
}
async function check(name, assertion) {
  await assertion();
  checks.push(name);
}
const server = createServer(async (request, response) => {
  const name = request.url === "/" ? "index.html" : request.url?.slice(1);
  if (!name || !/^(index\.html|fixture\.(js|css))$/.test(name)) {
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
  response.end(await readFile(join(directory, name)));
});
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
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guía ficticia</title><link rel="stylesheet" href="fixture.css"><style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui;background:#faf6f0;color:#2b2723}main{max-width:1080px;margin:auto;padding:24px 16px 180px}label,input{display:block}input{width:100%;margin:8px 0 16px;padding:10px}button{cursor:pointer}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>',
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  launched = true;
  await cli("open", `http://127.0.0.1:${address.port}/`);
  await cli("set", "viewport", "390", "844");
  await cli("snapshot", "-i");
  await cli("click", "button[aria-expanded='false']");
  await until("document.querySelector('[role=dialog][data-ready=true]')");
  await until(
    "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
  );
  await evaluate("window.fixture.control();");
  await check(
    "un modal nativo cancela RAF pendiente y evita RAF por cambios ajenos, conservando foco y reanudación",
    async () => {
      await evaluate(
        "const d=document.createElement('dialog');d.id='fixture-modal';d.innerHTML='<label>Campo modal ficticio<input id=fixture-modal-field></label>';document.body.append(d);",
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      // El modal ya existe: abrirlo sólo cambia el atributo open.
      const queued = await evaluate(
        "const before={...window.fixture.frames};window.dispatchEvent(new Event('resize'));document.getElementById('fixture-modal').showModal();return before;",
      );
      await until(
        "window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
      );
      assert.equal(
        await evaluate("return window.fixture.frames.executed;"),
        queued.executed,
      );
      assert.ok(
        (await evaluate("return window.fixture.frames.cancelled;")) >
          queued.cancelled,
      );
      const frames = await evaluate("return {...window.fixture.frames};");
      await evaluate("return window.fixture.mutateOutsideGuide();");
      assert.deepEqual(
        await evaluate("return {...window.fixture.frames};"),
        frames,
      );
      assert.equal(await evaluate("return window.fixture.pendingFrames();"), 0);
      const created = await evaluate("return window.fixture.motion.created;");
      await delay(1600);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      assert.equal(
        await evaluate("return document.activeElement.id;"),
        "fixture-modal-field",
      );
      await cli("press", "Escape");
      await until("!document.querySelector('dialog[open]')");
      assert.equal(
        await evaluate("return !!document.querySelector('span[data-step]');"),
        true,
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate("document.getElementById('fixture-modal').remove();");
    },
  );
  await check(
    "aria-modal evita RAF ante cambios ajenos y conserva pausa, scroll y foco al cambiar de paso",
    async () => {
      await evaluate(
        "const d=document.createElement('section');d.id='fixture-aria-modal';d.setAttribute('role','dialog');d.innerHTML='<label>Otro campo ficticio<input id=fixture-aria-field></label>';document.body.append(d);",
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate(
        "document.getElementById('fixture-aria-modal').setAttribute('aria-modal','true');document.getElementById('fixture-aria-field').focus({preventScroll:true});",
      );
      await until(
        "window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
      );
      const frames = await evaluate("return {...window.fixture.frames};");
      await evaluate("return window.fixture.mutateOutsideGuide();");
      assert.deepEqual(
        await evaluate("return {...window.fixture.frames};"),
        frames,
      );
      const before = await evaluate(
        "return {created:window.fixture.motion.created,scroll:scrollY};",
      );
      await evaluate("window.fixture.setStep('notas');");
      await until(
        "document.querySelector('span[data-step]')?.dataset.step==='notas'",
      );
      await delay(2100);
      assert.deepEqual(
        await evaluate(
          "return {created:window.fixture.motion.created,scroll:scrollY};",
        ),
        before,
      );
      assert.equal(
        await evaluate("return document.activeElement.id;"),
        "fixture-aria-field",
      );
      // Este modal ARIA ficticio comprueba el manejador; el nativo anterior
      // prueba Escape del navegador con su top-layer y restauración propios.
      await evaluate(
        "document.getElementById('fixture-aria-field').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));",
      );
      assert.equal(
        await evaluate("return !!document.querySelector('span[data-step]');"),
        true,
      );
      await evaluate(
        "document.getElementById('fixture-aria-modal').removeAttribute('aria-modal');",
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate("document.getElementById('fixture-aria-modal').remove();");
    },
  );
  await check(
    "cerrar la guía después del modal limpia RAF, observers, listeners, timers y animaciones sin reinicio tardío",
    async () => {
      await cli("press", "Escape");
      await until(
        "!document.querySelector('span[data-step]') && window.fixture.motion.active===0 && window.fixture.pendingTimers()===0 && window.fixture.pendingFrames()===0",
      );
      const created = await evaluate("return window.fixture.motion.created;");
      await delay(2100);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      assert.deepEqual(await evaluate("return window.fixture.resources;"), {
        resize: 0,
        mutation: 0,
        listeners: 0,
      });
    },
  );
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        passed: checks,
        environment: "ReactDOM real, demo ficticia, sin BD ni proveedores",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ completedChecks: checks }, null, 2));
  if (launched) {
    await capture("failure").catch(() => {});
    console.error(
      await evaluate(
        "return {panel:document.querySelector('[role=dialog]')?.textContent||null,trigger:document.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded'),target:!!document.getElementById('demo-agenda'),temporaryTarget:!!document.getElementById('demo-temporal'),active:document.activeElement?.tagName};",
      ).catch(() => null),
    );
  }
  throw error;
} finally {
  if (launched) await cli("close").catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
