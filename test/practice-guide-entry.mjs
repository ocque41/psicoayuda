import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tapFixture } from "./bird-guide-entry.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const browser = process.env.NIDO_GUIDE_BROWSER || "agent-browser";
const run = promisify(execFile);
const session = `nido-practice-entry-${crypto.randomUUID()}`;
const artifacts = process.env.NIDO_GUIDE_ARTIFACT_DIR;
const checks = [];
const evidence = [];
const openingSamples = [];
const extension = await mkdtemp(join(tmpdir(), "nido-guide-zoom-"));
const server = spawn(
  process.execPath,
  [join(root, "test/bird-guide-preview.mjs")],
  {
    cwd: root,
    env: {
      ...process.env,
      NIDO_GUIDE_PREVIEW_PORT: "0",
      NIDO_GUIDE_PREVIEW_FIXTURE: "practice",
    },
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
async function opening() {
  return evaluate(
    "const b=document.querySelector('[data-guide-trigger]'),r=b.getBoundingClientRect(),h=document.querySelector('[data-workspace-header]').getBoundingClientRect(),nav=document.querySelector('.workspace-rail').getBoundingClientRect();return {button:r.toJSON(),header:h.toJSON(),navigation:nav.toJSON(),hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),edgeHits:[r.top+3,r.top+r.height/2,r.bottom-3].map(y=>b.contains(document.elementFromPoint(r.x+r.width/2,y))),inside:r.top>=h.bottom&&r.bottom<=nav.top,marginTop:getComputedStyle(b).scrollMarginTop,marginBottom:getComputedStyle(b).scrollMarginBottom};",
  );
}
async function panel() {
  return evaluate(
    "const p=document.querySelector('[role=dialog]'),r=p.getBoundingClientRect(),reading=p.querySelector('section[tabindex]').getBoundingClientRect();return {panel:r.toJSON(),reading:reading.toJSON(),count:p.querySelector('span').textContent.trim(),overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...p.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return {name:b.getAttribute('aria-label')||b.textContent.trim(),x:q.x,y:q.y,width:q.width,height:q.height,hit:b.contains(document.elementFromPoint(q.x+q.width/2,q.y+q.height/2)),inside:q.left>=0&&q.right<=innerWidth&&q.top>=r.top&&q.bottom<=r.bottom&&q.bottom<=innerHeight};})};",
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

  const routes = [
    ["/pro/consulta", 3],
    ["/pro/pacientes", 4],
    ["/pro/pacientes/persona-ficticia", 3],
    ["/pro/mensajes", 3],
    ["/pro/cobros", 3],
    ["/pro/ajustes", 4],
  ];
  const cases = [
    [320, 240, 1, "click", false],
    [390, 240, 1, "touch", false],
    [640, 480, 2, "click", false],
    [780, 480, 2, "keyboard", false],
    [320, 240, 1, "keyboard", true],
    [390, 240, 1, "touch", true],
  ];
  for (const [width, height, zoom, input, reduced] of cases) {
    const mode = `${width}x${height}-zoom${zoom}-${input}${reduced ? "-reducido" : ""}`;
    let visited = 0;
    for (const [path, total] of routes) {
      const name = `${mode}-${path.split("/").filter(Boolean).slice(1).join("-")}`;
      await cli("set", "viewport", String(width), String(height));
      await cli(
        "set",
        "media",
        "light",
        reduced ? "reduced-motion" : "no-preference",
      );
      const pageUrl = `${origin}${path}?zoom=${zoom}`;
      await cli("open", pageUrl);
      await until(
        `document.documentElement.dataset.browserZoom==='${zoom}' && document.querySelector('[data-guide-trigger]')`,
      );
      assert.deepEqual(await evaluate("return [innerWidth,innerHeight];"), [
        width / zoom,
        height / zoom,
      ]);
      await evaluate(
        "window.entryEvents=[];document.addEventListener('pointerdown',e=>window.entryEvents.push({type:e.pointerType,trusted:e.isTrusted,onTrigger:Boolean(e.target.closest('[data-guide-trigger]'))}),{capture:true});return true;",
      );
      await check(
        `${name}: apertura y disparador completos entre las barras`,
        async () => {
          if (input === "keyboard") {
            await cli("focus", "#contenido");
            for (let tabs = 0; tabs < 24; tabs++) {
              await cli("press", "Tab");
              if (
                await evaluate(
                  "return document.activeElement.matches('[data-guide-trigger]');",
                )
              )
                break;
            }
            assert.equal(
              await evaluate(
                "return document.activeElement.matches('[data-guide-trigger]');",
              ),
              true,
            );
          } else await cli("scrollintoview", "[data-guide-trigger]");
          await settlePageScroll();
          const g = await opening();
          openingSamples.push({ name, path, input, before: g });
          await capture(`${name}-disparador`);
          if (input === "click") await cli("click", "[data-guide-trigger]");
          else if (input === "touch")
            await tapFixture(cli, pageUrl, {
              x: g.button.x + g.button.width / 2,
              y: g.button.y + g.button.height / 2,
            });
          else await cli("press", "Enter");
          await until(
            "document.querySelector('[role=dialog]')?.dataset.ready==='true'",
          );
          const events = await evaluate("return window.entryEvents;");
          openingSamples.at(-1).events = events;
          if (input !== "keyboard")
            assert.ok(
              events.some(
                (e) =>
                  e.trusted &&
                  e.onTrigger &&
                  e.type === (input === "click" ? "mouse" : "touch"),
              ),
              JSON.stringify(events),
            );
          assert.ok(
            g.hit && g.inside && g.edgeHits.every(Boolean),
            `Recorte del disparador: ${JSON.stringify(g)}`,
          );
          assert.equal(await evaluate("return location.pathname;"), path);
        },
      );
      await check(
        `${name}: recorrido contextual, avance, lectura, contraste y cierre`,
        async () => {
          await delay(400);
          const start = await panel();
          const advance = start.buttons.at(-1);
          for (let step = 1; step <= total; step++) {
            const g = await panel();
            evidence.push({ name, step, total, geometry: g });
            assert.ok(
              g.buttons.every((b) => b.hit && b.inside && b.height >= 44),
              JSON.stringify(g),
            );
            assert.ok(g.reading.height > 0 && !g.overflow, JSON.stringify(g));
            assert.ok(g.count.endsWith(`${step}/${total}`), g.count);
            const next = g.buttons.at(-1);
            for (const key of ["x", "y", "width", "height"])
              assert.ok(
                Math.abs(next[key] - advance[key]) <= 1,
                JSON.stringify(g),
              );
            await cli("press", "Tab");
            assert.equal(
              await evaluate("return document.activeElement.tagName;"),
              "SECTION",
            );
            await cli("press", "End");
            await until(
              "Math.abs(document.activeElement.scrollHeight-document.activeElement.clientHeight-document.activeElement.scrollTop)<=1",
            );
            await cli("press", "Tab");
            if (step > 1) await cli("press", "Tab");
            const focus = await evaluate(
              "const s=getComputedStyle(document.activeElement);return {visible:document.activeElement.matches(':focus-visible'),color:s.outlineColor,background:s.backgroundColor};",
            );
            assert.ok(
              focus.visible && focus.color === "rgb(255, 255, 255)",
              JSON.stringify(focus),
            );
            if (reduced)
              assert.equal(
                await evaluate(
                  "return window.practiceGuidePreview.motion.active;",
                ),
                0,
              );
            visited++;
            if (step < total) {
              const before = await evaluate(
                "return document.querySelector('span[data-step]').dataset.step;",
              );
              await cli("press", "Enter");
              await until(
                `document.querySelector('span[data-step]').dataset.step!==${JSON.stringify(before)}`,
              );
              await evaluate(
                "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));",
              );
            }
          }
          await capture(`${name}-fin`);
          await cli("press", "Escape");
          await until("!document.querySelector('[role=dialog]')");
          assert.equal(
            await evaluate(
              "return document.activeElement.matches('[data-guide-trigger]');",
            ),
            true,
          );
          await until(
            "window.practiceGuidePreview.motion.active===0&&window.practiceGuidePreview.pendingTimers()===0",
          );
          assert.equal(await evaluate("return location.pathname;"), path);
        },
      );
    }
    assert.equal(visited, 20, "Se preservan veinte pasos en seis contextos");
  }
  console.log(
    JSON.stringify(
      {
        checks: checks.length,
        passed: checks,
        openingSamples,
        evidence,
        scope:
          "AppFrame/SiteNav/WorkspaceNav/PracticeGuide reales; sesión y objetivos ficticios, navegación Next adaptada, sin DB/proveedores",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await capture("fallo-apertura-crm").catch(() => {});
  if (artifacts)
    await writeFile(
      join(artifacts, "failure.json"),
      JSON.stringify(
        {
          openingSamples,
          evidence,
          opening: await opening().catch(() => null),
          panel: await panel().catch(() => null),
        },
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
