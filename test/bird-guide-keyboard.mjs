import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const browser = process.env.NIDO_GUIDE_BROWSER || "agent-browser";
const run = promisify(execFile);
const session = `nido-keyboard-${crypto.randomUUID()}`;
const artifacts = process.env.NIDO_GUIDE_ARTIFACT_DIR;
const checks = [];
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
    ["--session", session, "--json", ...args],
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
async function geometry() {
  return evaluate(
    `const p=document.querySelector('[role=dialog]'),b=[...p.querySelectorAll('button')].find(b=>b.textContent.includes('Siguiente')),r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),inside:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight};`,
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
  for (const [width, height, reduced] of [
    [1280, 800, false],
    [390, 844, false],
    [320, 700, false],
    [320, 700, true],
  ]) {
    const mode = `${width}x${height}${reduced ? "-reducido" : ""}`;
    await cli("set", "viewport", String(width), String(height));
    await cli(
      "set",
      "media",
      "light",
      reduced ? "reduced-motion" : "no-preference",
    );
    await cli("open", url);
    await cli("click", "#demo-home button[aria-expanded=false]");
    for (let i = 0; i < 10; i++)
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
      "document.querySelector('span[data-step]')?.dataset.step==='recordatorios-privacidad'",
    );
    await until(
      "document.activeElement.textContent.includes('Sólo lo necesario')",
    );
    await delay(700);
    const initial = await geometry();
    await check(
      `${mode}: explicación identificada y alcanzable con Tab`,
      async () => {
        const semantics = await evaluate(
          `const p=document.querySelector('[role=dialog]'),d=p.querySelector('section[tabindex]');return {found:!!d,tabIndex:d?.tabIndex,label:d?.getAttribute('aria-labelledby')===p.getAttribute('aria-labelledby')};`,
        );
        assert.deepEqual(semantics, {
          found: true,
          tabIndex: 0,
          label: true,
        });
        await cli("press", "Tab");
        assert.equal(
          await evaluate("return document.activeElement.tagName;"),
          "SECTION",
        );
        assert.equal(
          await evaluate(
            "return getComputedStyle(document.activeElement).outlineStyle!== 'none';",
          ),
          true,
        );
      },
    );
    await check(
      `${mode}: Fin y flechas leen el texto sin mover página ni avance`,
      async () => {
        const page = await evaluate("return scrollY;");
        const overflow = await evaluate(
          "return document.activeElement.scrollHeight>document.activeElement.clientHeight;",
        );
        if (overflow) {
          await cli("press", "End");
          await until(
            "document.activeElement.scrollTop>0 && Math.abs(document.activeElement.scrollHeight-document.activeElement.clientHeight-document.activeElement.scrollTop)<=1",
          );
        } else
          assert.equal(
            await evaluate("return document.activeElement.scrollTop;"),
            0,
          );
        assert.equal(await evaluate("return scrollY;"), page);
        const lastLine = await evaluate(
          `const d=document.activeElement,p=d.querySelector('p'),dr=d.getBoundingClientRect(),pr=p.getBoundingClientRect();return pr.bottom<=dr.bottom+1;`,
        );
        assert.equal(lastLine, true);
        assert.deepEqual(await geometry(), initial);
        if (overflow) {
          await cli("press", "Home");
          await until("document.activeElement.scrollTop===0");
          await cli("press", "ArrowDown");
          await until("document.activeElement.scrollTop>0");
        }
        assert.equal(await evaluate("return scrollY;"), page);
        await capture(`${mode}-lectura-teclado`);
      },
    );
    await check(
      `${mode}: avanzar reinicia la lectura y conserva acciones y cierre`,
      async () => {
        await cli("press", "ArrowRight");
        await until(
          "document.querySelector('span[data-step]')?.dataset.step==='recordatorios-desactivar' && document.activeElement.tagName==='H2'",
        );
        assert.equal(
          await evaluate(
            "return document.querySelector('[role=dialog] section[tabindex]').scrollTop;",
          ),
          0,
        );
        assert.deepEqual(await geometry(), initial);
        if (reduced)
          assert.equal(
            await evaluate("return window.demoPreview.motion.active;"),
            0,
          );
        await cli("press", "Tab");
        await cli("press", "Tab");
        assert.equal(
          await evaluate("return document.activeElement.textContent.trim();"),
          "Anterior",
        );
        await cli("press", "Tab");
        assert.equal(
          await evaluate("return document.activeElement.textContent.trim();"),
          "Siguiente",
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
    environment:
      "BirdGuide y PracticeDemo reales, ejemplos ficticios, Chrome aislado, sin BD ni proveedores",
  };
  if (artifacts)
    await writeFile(
      join(artifacts, "checks.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await capture("fallo-teclado").catch(() => {});
  throw error;
} finally {
  await cli("close").catch(() => {});
  server.kill("SIGTERM");
}
