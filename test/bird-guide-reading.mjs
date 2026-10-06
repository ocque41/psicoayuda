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
const session = `nido-reading-${crypto.randomUUID()}`;
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
async function settled() {
  await until(
    "document.querySelector('span[data-step]')?.dataset.readingTarget && ['rest','idle'].includes(document.querySelector('span[data-step]').dataset.phase)",
  );
}
const tourSteps = [
  "inicio",
  "agenda",
  "pacientes",
  "notas",
  "mensajes",
  "cobros",
  "recordatorios",
  "recordatorios-consentimiento",
  "recordatorios-anticipaciones",
  "recordatorios-zona",
  "recordatorios-privacidad",
  "recordatorios-desactivar",
  "cierre",
];
async function continuousTour() {
  let initial;
  for (const [index, step] of tourSteps.entries()) {
    await until(
      `document.querySelector('span[data-step]')?.dataset.step===${JSON.stringify(step)} && document.querySelector('[role=dialog]')?.dataset.ready==='true'`,
    );
    await evaluate(
      "return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));",
    );
    const position = await evaluate(`
      const panel=document.querySelector('[role=dialog]');
      const button=[...panel.querySelectorAll('button')].find(b=>/Siguiente|Terminar/.test(b.textContent));
      const r=button.getBoundingClientRect();
      const trigger=document.querySelector('#demo-home button[aria-expanded]');
      return {x:r.x,y:r.y,width:r.width,height:r.height,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),triggerVisible:trigger.getClientRects().length>0,count:panel.textContent.includes('${index + 1}/${tourSteps.length}'),inside:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight};
    `);
    assert.equal(position.triggerVisible, index === 0, `Disparador en ${step}`);
    assert.ok(
      position.hit && position.inside && position.count,
      `${step}: ${JSON.stringify(position)}`,
    );
    if (!initial) initial = position;
    for (const key of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(position[key] - initial[key]) <= 1,
        `${step} desplaza ${key}: ${position[key]} frente a ${initial[key]}`,
      );
    await cli(
      "find",
      "role",
      "button",
      "click",
      "--name",
      index === tourSteps.length - 1 ? "Terminar" : "Siguiente",
      "--exact",
    );
  }
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
  await cli("click", "nav a[href='#demo-home']");
  await cli("click", "#demo-home button[aria-expanded=false]");
  await settled();
}
async function geometry() {
  return evaluate(
    `const b=document.querySelector('span[data-step]'),r=document.getElementById(b.dataset.readingTarget),p=document.querySelector('[role=dialog]');const br=b.getBoundingClientRect(),rr=r.getBoundingClientRect(),pr=p.getBoundingClientRect();const intersects=br.right>pr.left&&br.left<pr.right&&br.bottom>pr.top&&br.top<pr.bottom;return {target:r.id,inside:br.left>=0&&br.right<=innerWidth&&br.top>=0&&br.bottom<=innerHeight,gutter:br.right<=rr.left+parseFloat(getComputedStyle(r).paddingInlineStart),panelClear:!intersects,overflow:document.documentElement.scrollWidth>innerWidth};`,
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
  await cli("open", url);
  await cli("set", "viewport", "1280", "800");
  await cli("snapshot", "-i");
  await check(
    "preview monta PracticeDemo con su navegación y controles",
    async () => {
      assert.equal(
        await evaluate(
          "return !!document.querySelector('nav[aria-label=\"Secciones de la demostración\"]') && document.getElementById('demo-home').textContent.includes('Todo listo');",
        ),
        true,
      );
    },
  );
  await cli("click", "button[aria-expanded=false]");
  await settled();
  await check(
    "aterriza junto al texto, en su margen y dentro del viewport",
    async () => {
      const g = await geometry();
      assert.ok(
        g.inside && g.gutter && g.panelClear && !g.overflow,
        JSON.stringify(g),
      );
      assert.equal(
        await evaluate(
          "const t=document.getElementById('demo-home-title').getBoundingClientRect(),p=document.querySelector('[role=dialog]').getBoundingClientRect();return t.bottom<=p.top||t.right<=p.left;",
        ),
        true,
      );
      await capture("01-lectura-escritorio");
    },
  );
  await check(
    "vuela automáticamente hacia otra lectura con arco visible",
    async () => {
      const initial = await evaluate(
        "return document.querySelector('span[data-step]').dataset.readingTarget;",
      );
      await until(
        `window.demoPreview.motion.paths.some(p=>p.target && p.target!==${JSON.stringify(initial)})`,
      );
      assert.equal(
        await evaluate(
          `return window.demoPreview.motion.paths.some(p=>{if(!p.target||p.target===${JSON.stringify(initial)})return false;const pts=p.frames.map(k=>new DOMMatrixReadOnly(k.transform)),a=pts[0],z=pts.at(-1);return Math.hypot(z.m41-a.m41,z.m42-a.m42)>50 && pts.some(q=>Math.abs((z.m41-a.m41)*(q.m42-a.m42)-(z.m42-a.m42)*(q.m41-a.m41))>100) && p.duration>0&&p.duration<=1000;});`,
        ),
        true,
      );
      await settled();
      await capture("02-segunda-lectura");
    },
  );
  await check(
    "un solo inicio recorre los trece pasos con Siguiente estable en escritorio",
    continuousTour,
  );
  await check(
    "todas las secciones y los temas de recordatorios tienen lecturas alcanzables",
    async () => {
      for (const section of [
        "agenda",
        "pacientes",
        "mensajes",
        "cobros",
        "recordatorios",
      ]) {
        await cli("click", `nav a[href='#demo-${section}']`);
        await until(
          `document.querySelector('span[data-step]')?.dataset.step===${JSON.stringify(section)}`,
        );
        await settled();
        const g = await geometry();
        assert.ok(
          g.inside && g.gutter && g.panelClear && !g.overflow,
          `${section}: ${JSON.stringify(g)}`,
        );
        await capture(`seccion-${section}`);
      }
      for (let index = 0; index < 6; index++) {
        const before = await evaluate(
          "return document.querySelector('span[data-step]').dataset.step;",
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
          `document.querySelector('span[data-step]')?.dataset.step!==${JSON.stringify(before)}`,
        );
        await settled();
        const g = await geometry();
        assert.ok(
          g.inside && g.gutter && g.panelClear && !g.overflow,
          `${index}: ${JSON.stringify(g)}`,
        );
      }
    },
  );
  await check(
    "cambiar de sección lleva el ave a las explicaciones nuevas",
    async () => {
      await cli("click", "nav a[href='#demo-notas']");
      await until(
        "document.querySelector('span[data-step]')?.dataset.step==='notas'",
      );
      await settled();
      assert.ok((await geometry()).target.startsWith("demo-notes-"));
      await capture("03-notas");
    },
  );
  await check(
    "al escribir pausa los viajes sin cambiar el foco ni el borrador",
    async () => {
      await cli(
        "fill",
        "#demo-notas textarea",
        "Apunte ficticio para probar el vuelo",
      );
      await until(
        "document.querySelector('span[data-step]').dataset.flying==='false'",
      );
      const initial = await evaluate(
        "return {paths:window.demoPreview.motion.paths.length,scroll:scrollY};",
      );
      await delay(6500);
      assert.deepEqual(
        await evaluate(
          "return {paths:window.demoPreview.motion.paths.length,scroll:scrollY};",
        ),
        initial,
      );
      assert.equal(
        await evaluate(
          "return document.activeElement.matches('textarea')&&document.activeElement.value==='Apunte ficticio para probar el vuelo';",
        ),
        true,
      );
    },
  );
  await check("un diálogo abierto pausa el recorrido automático", async () => {
    await evaluate(
      "document.activeElement.blur();const d=document.createElement('dialog');d.id='reading-test-dialog';d.innerHTML='<button>Volver a la demo</button>';document.body.append(d);d.showModal();",
    );
    const initial = await evaluate(
      "return window.demoPreview.motion.paths.length;",
    );
    await delay(6500);
    assert.equal(
      await evaluate("return window.demoPreview.motion.paths.length;"),
      initial,
    );
    await evaluate("document.getElementById('reading-test-dialog').remove();");
  });
  await check(
    "móvil conserva el margen de lectura y los controles de la guía",
    async () => {
      await cli("set", "viewport", "390", "844");
      await cli("open", url);
      await cli("snapshot", "-i");
      await cli("click", "button[aria-expanded=false]");
      await settled();
      const g = await geometry();
      assert.ok(
        g.inside && g.gutter && g.panelClear && !g.overflow,
        JSON.stringify(g),
      );
      assert.equal(
        await evaluate(
          "const p=document.querySelector('[role=dialog]').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.top>=0&&p.bottom<=innerHeight;",
        ),
        true,
      );
      await capture("04-lectura-movil");
    },
  );
  await check(
    "un solo inicio recorre los trece pasos con Siguiente estable en móvil",
    continuousTour,
  );
  await check(
    "en 320px el avance sigue fijo y el inicio sólo aparece en Mi consulta",
    async () => {
      await cli("set", "viewport", "320", "700");
      await cli("open", url);
      await cli("click", "#demo-home button[aria-expanded=false]");
      await continuousTour();
      await capture("05-recorrido-320");
    },
  );
  await check(
    "movimiento reducido conserva la guía sin viajes ni gestos",
    async () => {
      await cli("set", "media", "light", "reduced-motion");
      await delay(500);
      const initial = await evaluate(
        "return window.demoPreview.motion.paths.length;",
      );
      await delay(6000);
      assert.equal(
        await evaluate("return window.demoPreview.motion.paths.length;"),
        initial,
      );
      assert.equal(
        await evaluate(
          "return window.demoPreview.motion.active===0&&window.demoPreview.pendingTimers()===0;",
        ),
        true,
      );
    },
  );
  await check("cerrar libera viajes y timers y devuelve el foco", async () => {
    await cli("press", "Escape");
    await until("!document.querySelector('[role=dialog]')");
    assert.equal(
      await evaluate(
        "return window.demoPreview.motion.active===0&&window.demoPreview.pendingTimers()===0&&document.activeElement.getAttribute('aria-expanded')==='false';",
      ),
      true,
    );
  });
  await check("el preview sólo carga recursos del servidor local", async () => {
    assert.equal(
      await evaluate(
        "return performance.getEntriesByType('resource').every(r=>new URL(r.name).origin===location.origin);",
      ),
      true,
    );
  });
  const result = {
    checks: checks.length,
    passed: checks,
    environment:
      "PracticeDemo existente, React real, loopback, ejemplos locales",
  };
  if (artifacts)
    await writeFile(
      join(artifacts, "checks.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await capture("fallo-recorrido").catch(() => {});
  if (artifacts)
    await writeFile(
      join(artifacts, "failure.json"),
      JSON.stringify(
        await evaluate(
          `const b=document.querySelector('span[data-step]'),p=document.querySelector('[role=dialog]');return {bird:b?.dataset,panel:p?.getBoundingClientRect().toJSON(),scroll:scrollY,viewport:{width:innerWidth,height:innerHeight},reading:[...document.querySelectorAll('[id]')].filter(e=>e.id.includes('title')||e.id.includes('text')||e.id.includes('context')).map(e=>({id:e.id,rect:e.getBoundingClientRect().toJSON()}))};`,
        ),
        null,
        2,
      ),
    ).catch(() => {});
  throw error;
} finally {
  await cli("close").catch(() => {});
  server.kill("SIGTERM");
}
