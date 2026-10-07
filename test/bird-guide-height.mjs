import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const browser = process.env.NIDO_GUIDE_BROWSER || "agent-browser";
const run = promisify(execFile);
const session = `nido-height-${crypto.randomUUID()}`;
const artifacts = process.env.NIDO_GUIDE_ARTIFACT_DIR;
const checks = [];
const evidence = [];
const extension = await mkdtemp(join(tmpdir(), "nido-guide-zoom-"));
const server = spawn(
  process.execPath,
  [join(root, "test/bird-guide-preview.mjs")],
  {
    cwd: root,
    env: { ...process.env, NIDO_GUIDE_PREVIEW_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let errors = "";
server.stderr.on("data", (data) => {
  errors += data;
});
async function cli(...args) {
  const { stdout } = await run(
    browser,
    ["--session", session, "--extension", extension, "--json", ...args],
    {
      timeout: 45000,
      encoding: "utf8",
    },
  );
  const response = JSON.parse(stdout);
  assert.equal(response.success, true, JSON.stringify(response));
  return response.data;
}
async function evaluate(code) {
  return (await cli("eval", `(()=>{${code}})()`)).result;
}
async function until(predicate) {
  const end = Date.now() + 14000;
  while (!(await evaluate(`return !!(${predicate});`))) {
    if (Date.now() > end) throw new Error(`No se cumplió: ${predicate}`);
    await delay(100);
  }
}
async function check(name, assertion) {
  await assertion();
  checks.push(name);
  console.error(name);
}
async function capture(name) {
  if (!artifacts) return;
  await mkdir(artifacts, { recursive: true });
  await cli("screenshot", join(artifacts, `${name}.png`));
}
async function settlePageScroll() {
  let previous = await evaluate("return scrollY;");
  let stable = 0;
  const end = Date.now() + 5000;
  while (stable < 4) {
    await delay(100);
    const current = await evaluate("return scrollY;");
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    assert.ok(
      Date.now() < end,
      "El scroll del destino debe terminar antes de leer",
    );
  }
}
async function keyboardAction(label) {
  await cli(
    "focus",
    `[role=dialog] button[aria-label=${JSON.stringify(label)}]`,
  );
  assert.equal(
    await evaluate("return document.activeElement.getAttribute('aria-label');"),
    label,
  );
  await cli("press", "Enter");
}
async function geometry() {
  return evaluate(
    `const panel=document.querySelector('[role=dialog]'),pr=panel.getBoundingClientRect(),buttons=[...panel.querySelectorAll('button')],region=panel.querySelector('section[tabindex]');const header=document.querySelector('[data-workspace-header]'),navigation=document.querySelector('[data-workspace-navigation]');return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,zoom:Number(document.documentElement.dataset.browserZoom),panel:pr.toJSON(),region:region?.getBoundingClientRect().toJSON(),headerBottom:header.getBoundingClientRect().bottom,navigationBottom:navigation.getBoundingClientRect().bottom,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return {name:b.getAttribute('aria-label')||b.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,inside:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&r.top>=pr.top&&r.bottom<=pr.bottom,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}),overflow:document.documentElement.scrollWidth>innerWidth};`,
  );
}
async function next() {
  const before = await evaluate(
    "return document.querySelector('span[data-step]')?.dataset.step;",
  );
  await cli(
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Siguiente",
    "--exact",
  );
  await until(
    `document.querySelector('span[data-step]')?.dataset.step && document.querySelector('span[data-step]')?.dataset.step!==${JSON.stringify(before)}`,
  );
  await evaluate(
    "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));",
  );
}
try {
  const url = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: server.stdout });
    lines.once("line", (line) => {
      lines.close();
      resolve(JSON.parse(line).url);
    });
    server.once("exit", (code) =>
      reject(new Error(`Preview ${code}: ${errors}`)),
    );
  });
  const origin = new URL(url).origin;
  // Extensión temporal,limitada al loopback propio: setZoom cambia el zoom del navegador.
  await writeFile(
    join(extension, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Nido zoom de fixture",
      version: "1.0",
      host_permissions: ["http://127.0.0.1/*"],
      background: { service_worker: "background.js" },
      content_scripts: [
        {
          matches: ["http://127.0.0.1/*"],
          js: ["content.js"],
          run_at: "document_idle",
        },
      ],
    }),
  );
  await writeFile(
    join(extension, "background.js"),
    `chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message.type!=='fixture-zoom'||!sender.url?.startsWith(${JSON.stringify(`${origin}/`)}))return;const zoom=new URL(sender.url).searchParams.get('zoom')==='2'?2:1;chrome.tabs.setZoom(sender.tab.id,zoom).then(()=>chrome.tabs.getZoom(sender.tab.id)).then(actual=>reply({zoom:actual})).catch(error=>reply({error:String(error)}));return true;});`,
  );
  await writeFile(
    join(extension, "content.js"),
    `chrome.runtime.sendMessage({type:'fixture-zoom'},answer=>{document.documentElement.dataset.browserZoom=String(answer?.zoom||answer?.error||chrome.runtime.lastError?.message||'error');});`,
  );
  const cases = [
    [640, 480, 2, false],
    [320, 240, 1, false],
    [390, 240, 1, false],
    [780, 480, 2, false],
    [1280, 480, 2, false],
    [320, 240, 1, true],
    [780, 480, 2, true],
  ];
  for (const [frameWidth, frameHeight, zoom, reduced] of cases) {
    const mode = `${frameWidth}x${frameHeight}-zoom${zoom}${reduced ? "-reducido" : ""}`;
    await cli("set", "viewport", String(frameWidth), String(frameHeight));
    await cli(
      "set",
      "media",
      "light",
      reduced ? "reduced-motion" : "no-preference",
    );
    await cli("open", `${url}&zoom=${zoom}`);
    await until(`document.documentElement.dataset.browserZoom==='${zoom}'`);
    const viewport = await evaluate(
      "return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio};",
    );
    assert.equal(
      viewport.width,
      frameWidth / zoom,
      "El zoom real debe producir el ancho CSS esperado",
    );
    assert.equal(
      viewport.height,
      frameHeight / zoom,
      "El zoom real debe producir la altura CSS esperada",
    );
    await until(
      "window.demoPreview && document.querySelector('#demo-home button[aria-expanded=false]')",
    );
    await evaluate(
      "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));",
    );
    await cli("focus", "#demo-home button[aria-expanded=false]");
    assert.equal(
      await evaluate(
        "return document.activeElement.matches('#demo-home button[aria-expanded=false]');",
      ),
      true,
    );
    await cli("press", "Enter");
    await until(
      "document.querySelector('[role=dialog]')?.dataset.ready==='true'",
    );
    await delay(400);
    await check(
      `${mode}: todas las acciones quedan visibles y pulsables`,
      async () => {
        const g = await geometry();
        evidence.push({ mode, initial: g });
        await capture(`${mode}-inicio`);
        assert.ok(
          g.buttons.every((b) => b.inside && b.hit && b.height >= 44),
          JSON.stringify(g),
        );
        assert.ok(g.region.height >= 20 && !g.overflow, JSON.stringify(g));
        assert.ok(g.panel.top >= g.navigationBottom, JSON.stringify(g));
      },
    );
    const initial = (await geometry()).buttons.find(
      (b) => b.name === "Siguiente",
    );
    await check(
      `${mode}: trece pasos conservan el avance incluso con título largo`,
      async () => {
        for (let index = 0; index < 12; index++) {
          await next();
          const g = await geometry();
          assert.ok(
            g.buttons.every((b) => b.inside && b.hit),
            JSON.stringify(g),
          );
          const button = g.buttons.find(
            (b) => b.name === "Siguiente" || b.name === "Terminar",
          );
          for (const key of ["x", "y", "width", "height"])
            assert.ok(
              Math.abs(button[key] - initial[key]) <= 1,
              `${mode} desplaza ${key}: ${JSON.stringify(g)}`,
            );
          assert.ok(g.region.height >= 20, JSON.stringify(g));
        }
        await capture(`${mode}-fin`);
      },
    );
    await check(
      `${mode}: lectura, minimizar, restaurar y cerrar funcionan con teclado`,
      async () => {
        await settlePageScroll();
        await cli("press", "Tab");
        await cli("focus", "[role=dialog] h2");
        assert.equal(
          await evaluate(
            "const p=document.querySelector('[role=dialog]'); return p.dataset.constrained==='true' && getComputedStyle(p.querySelector('section[tabindex]')).outlineStyle==='solid';",
          ),
          true,
          "El título compacto conserva una indicación de foco visible en la lectura",
        );
        await cli("press", "Tab");
        assert.equal(
          await evaluate("return document.activeElement.tagName;"),
          "SECTION",
        );
        const page = await evaluate("return scrollY;");
        await cli("press", "End");
        await until(
          "Math.abs(document.activeElement.scrollHeight-document.activeElement.clientHeight-document.activeElement.scrollTop)<=1",
        );
        assert.equal(await evaluate("return scrollY;"), page);
        await capture(`${mode}-lectura-teclado`);
        await keyboardAction("Minimizar guía");
        await until(
          "document.querySelector('[role=dialog] button[aria-label=\"Mostrar guía\"]')",
        );
        const minimized = await geometry();
        assert.ok(
          minimized.buttons
            .filter((b) =>
              ["Mostrar guía", "Cerrar recorrido"].includes(b.name),
            )
            .every((b) => b.hit && b.inside),
          JSON.stringify(minimized),
        );
        await keyboardAction("Mostrar guía");
        await until(
          "document.querySelector('[role=dialog] button[aria-label=\"Minimizar guía\"]')",
        );
        await evaluate(
          "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));",
        );
        const restored = await geometry();
        assert.ok(
          restored.buttons.every((b) => b.hit && b.inside),
          JSON.stringify(restored),
        );
        if (reduced)
          assert.equal(
            await evaluate("return window.demoPreview.motion.active;"),
            0,
          );
        await cli("press", "Escape");
        await until("!document.querySelector('[role=dialog]')");
        assert.equal(
          await evaluate("return document.activeElement.id;"),
          "demo-window-title",
        );
        assert.equal(
          await evaluate(
            "return window.demoPreview.motion.active===0&&window.demoPreview.pendingTimers()===0;",
          ),
          true,
        );
      },
    );
  }
  const result = {
    checks: checks.length,
    passed: checks,
    evidence,
    zoom: "chrome.tabs.setZoom y getZoom en extensión temporal propia,viewport yDPR reales",
    environment:
      "BirdGuide/PracticeDemo reales,loopback,ejemplos ficticios,sin DB/proveedores",
  };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await capture("fallo-altura").catch(() => {});
  if (artifacts)
    await writeFile(
      join(artifacts, "failure.json"),
      JSON.stringify(
        { evidence, current: await geometry().catch(() => null) },
        null,
        2,
      ),
    );
  throw error;
} finally {
  await cli("close").catch(() => {});
  server.kill("SIGTERM");
  await rm(extension, { recursive: true, force: true });
}
