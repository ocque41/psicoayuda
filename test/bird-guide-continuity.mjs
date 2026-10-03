import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const session = `nido-guide-${crypto.randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "nido-guide-regression-"));
const checks = [];
let launched = false;
async function cli(...args) {
  const { stdout } = await runBrowser(
    browser,
    ["--session", session, "--json", ...args],
    { encoding: "utf8", timeout: 15000 },
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
async function next() {
  await evaluate(
    "[...document.querySelector('[role=dialog]').querySelectorAll('button')].find(b=>b.textContent.trim()==='Siguiente').click();",
  );
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
  await cli("open", `http://127.0.0.1:${address.port}/`);
  launched = true;
  await cli("set", "viewport", "390", "844");
  await cli("snapshot", "-i");
  await cli("click", "button[aria-expanded='false']");
  await until("document.querySelector('[role=dialog][data-ready=true]')");
  await check(
    "apertura enfoca el título y mantiene la demo interactiva",
    async () => {
      assert.equal(
        await evaluate(
          "return document.activeElement.tagName==='H2' && document.activeElement.closest('[role=dialog]')?.getAttribute('aria-modal')==='false' && !document.querySelector('[inert]');",
        ),
        true,
      );
    },
  );
  await check(
    "móvil390 sin desbordamiento ni panel fuera de viewport",
    async () => {
      assert.equal(
        await evaluate(
          "const r=document.querySelector('[role=dialog]').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;",
        ),
        true,
      );
    },
  );
  await check(
    "flechas recorren pasos y devuelven foco a su título",
    async () => {
      await cli("press", "ArrowRight");
      await until("document.activeElement.textContent==='Conoce pacientes'");
      await cli("press", "ArrowLeft");
      await until("document.activeElement.textContent==='Conoce agenda'");
    },
  );
  await cli("screenshot", "/tmp/nido-bird-guide-fixture-mobile.png");
  await check(
    "editar la demo no reinicia scroll ni roba foco con props recreadas",
    async () => {
      await cli("click", "#input-agenda");
      const before = await evaluate("return scrollY;");
      await cli("fill", "#input-agenda", "Borrador ficticio intacto");
      assert.equal(
        await evaluate("return document.activeElement.id;"),
        "input-agenda",
      );
      assert.ok(Math.abs((await evaluate("return scrollY;")) - before) < 2);
    },
  );
  await check(
    "minimizar mantiene el objetivo manipulable y restaura descripción",
    async () => {
      await cli("click", "button[aria-label='Minimizar guía']");
      await until("document.querySelector('[role=dialog] [hidden]')");
      await cli("fill", "#input-agenda", "Segundo borrador ficticio");
      await cli("click", "button[aria-label='Mostrar guía']");
      assert.equal(
        await evaluate(
          "return !!document.querySelector('[role=dialog] [hidden]');",
        ),
        false,
      );
    },
  );
  await check(
    "recorre los seis destinos, con scroll y último paso terminable",
    async () => {
      for (const name of [
        "pacientes",
        "notas",
        "mensajes",
        "cobros",
        "cierre",
      ]) {
        await next();
        await until(`document.activeElement.textContent==='Conoce ${name}'`);
        await until(
          `document.getElementById('demo-${name}').getBoundingClientRect().top < innerHeight`,
        );
      }
      assert.equal(
        await evaluate(
          "return [...document.querySelector('[role=dialog]').querySelectorAll('button')].some(b=>b.textContent.trim()==='Terminar');",
        ),
        true,
      );
      assert.deepEqual(
        await evaluate("return window.fixture.steps.slice(-5);"),
        ["pacientes", "notas", "mensajes", "cobros", "cierre"],
      );
    },
  );
  await check("scroll y resize conservan la marca del destino", async () => {
    await cli("set", "viewport", "1280", "900");
    await evaluate("scrollBy(0,80);");
    await until(
      "(()=>{const target=document.getElementById('demo-cierre').getBoundingClientRect();const mark=[...document.querySelectorAll('span[aria-hidden=true]')].find(e=>parseFloat(e.style.width)===target.width+8);return mark && Math.abs(mark.getBoundingClientRect().top-(target.top-4))<2;})()",
    );
    assert.equal(
      await evaluate(
        "const r=document.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;",
      ),
      true,
    );
  });
  await cli("screenshot", "/tmp/nido-bird-guide-fixture-desktop.png");
  await check("Escape cierra, devuelve foco y limpia observers", async () => {
    await cli("press", "Escape");
    await until("!document.querySelector('[role=dialog]')");
    assert.equal(
      await evaluate("return document.activeElement.textContent.trim();"),
      "Conocer mi consulta",
    );
    assert.deepEqual(await evaluate("return window.fixture.resources;"), {
      resize: 0,
      mutation: 0,
      listeners: 0,
    });
  });
  await check(
    "tarjeta móvil alta conserva título y acción; ave completa bajo la cabecera y sobre la guía",
    async () => {
      await cli("set", "viewport", "390", "844");
      await evaluate(
        "const header=document.createElement('header');header.className='topbar';header.id='fixture-navbar';header.textContent='Cabecera ficticia';header.style.cssText='position:fixed;inset:0 0 auto;height:70px;background:#faf6f0;z-index:50';document.body.prepend(header);document.getElementById('demo-agenda').style.minHeight='760px';",
      );
      await cli("click", "button[aria-expanded=false]");
      await until(
        "(()=>{const bird=document.querySelector('span[data-step]');const target=document.getElementById('demo-agenda').getBoundingClientRect();return bird?.dataset.flying==='false' && target.top>=90 && target.top<=120;})()",
      );
      assert.equal(
        await evaluate(
          "const panel=document.querySelector('[role=dialog]').getBoundingClientRect();const target=document.getElementById('demo-agenda');const title=target.querySelector('h2').getBoundingClientRect();const button=target.querySelector('button');const control=button.getBoundingClientRect();const bird=document.querySelector('span[data-step]');const b=bird.getBoundingClientRect();const navbar=document.getElementById('fixture-navbar').getBoundingClientRect();return panel.top>500 && panel.bottom<=innerHeight-10 && title.top>navbar.bottom && title.bottom<panel.top && control.bottom<panel.top && document.elementFromPoint(control.left+control.width/2,control.top+control.height/2)===button && b.top>=navbar.bottom+8 && b.bottom<panel.top && b.left>=0 && b.right<=innerWidth && getComputedStyle(bird).opacity==='1';",
        ),
        true,
      );
      await cli("screenshot", "/tmp/nido-bird-guide-fixture-mobile-tall.png");
      await cli("press", "Escape");
      await until("!document.querySelector('[role=dialog]')");
      await evaluate(
        "document.getElementById('fixture-navbar').remove();document.getElementById('demo-agenda').style.minHeight='220px';window.scrollTo({top:0,behavior:'instant'});",
      );
      await until("scrollY===0");
    },
  );
  await check(
    "objetivo ausente se explica y observer recupera su montaje",
    async () => {
      await evaluate(
        "document.getElementById('demo-agenda').id='demo-temporal';",
      );
      await cli("click", "button[aria-expanded=false]");
      await until(
        "document.querySelector('[role=dialog]')?.textContent.includes('Esta sección no está visible')",
      );
      await evaluate(
        "const el=document.getElementById('demo-temporal');el.id='demo-agenda';el.appendChild(document.createElement('span'));",
      );
      await until(
        "!document.querySelector('[role=dialog]').textContent.includes('Esta sección no está visible')",
      );
      await cli("press", "Escape");
    },
  );
  await check(
    "movimiento reducido elimina vuelo y aleteo sin perder navegación",
    async () => {
      await cli("set", "media", "light", "reduced-motion");
      await cli("click", "button[aria-expanded=false]");
      await until("document.querySelector('[role=dialog][data-ready=true]')");
      assert.equal(
        await evaluate(
          "const bird=document.querySelector('span[data-step]');return matchMedia('(prefers-reduced-motion:reduce)').matches && getComputedStyle(bird).transitionDuration==='0s' && [...bird.querySelectorAll('span')].every(e=>getComputedStyle(e).animationName==='none');",
        ),
        true,
      );
      await cli("press", "ArrowRight");
      await until("document.activeElement.textContent==='Conoce pacientes'");
    },
  );
  await check(
    "desmontar con guía abierta limpia listeners y observers",
    async () => {
      await evaluate("window.fixture.remount();");
      await until("!document.querySelector('[role=dialog]')");
      assert.deepEqual(await evaluate("return window.fixture.resources;"), {
        resize: 0,
        mutation: 0,
        listeners: 0,
      });
      await cli("press", "Escape");
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
  if (launched) {
    await cli("screenshot", "/tmp/nido-bird-guide-fixture-failure.png").catch(
      () => {},
    );
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
