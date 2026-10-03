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
const session = `nido-guide-${crypto.randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "nido-guide-regression-"));
const checks = [];
const idleEvidence = [];
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
  launched = true;
  await cli("open", `http://127.0.0.1:${address.port}/`);
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
  await capture("mobile");
  await until(
    "document.querySelector('span[data-step]')?.dataset.flying==='false'",
  );
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
  await capture("desktop");
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
      await capture("mobile-tall");
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
  await cli("set", "media", "light", "no-preference");
  await cli("set", "viewport", "1280", "900");
  await evaluate(
    "window.fixture.control();window.fixture.remount();scrollTo({top:0,behavior:'instant'});",
  );
  await until("document.querySelector('button[aria-expanded=false]')");
  const firstPath = await evaluate(
    "return window.fixture.motion.paths.length;",
  );
  await cli("click", "button[aria-expanded=false]");
  await check(
    "vuelo nativo curvo, orientado y con inclinación finita",
    async () => {
      await until(
        "document.querySelector('span[data-step]')?.dataset.flying==='true'",
      );
      assert.equal(
        await evaluate(
          `const bird=document.querySelector('span[data-step]');const paths=window.fixture.motion.paths.slice(${firstPath});const points=paths[0].transforms.map(t=>new DOMMatrixReadOnly(t));const start=points[0],end=points.at(-1);const curved=points.some(p=>Math.abs((end.m41-start.m41)*(p.m42-start.m42)-(end.m42-start.m42)*(p.m41-start.m41))>12);const tilt=bird.querySelector('span').getAnimations()[0]?.effect.getKeyframes();return bird.dataset.direction==='right' && curved && paths.every(p=>p.duration>0&&p.duration<=1000) && tilt?.some(k=>String(k.transform)!=='rotate(0deg)') && points.every(p=>p.m41>=0&&p.m41+72<=innerWidth&&p.m42>=0&&p.m42+72<=innerHeight);`,
        ),
        true,
      );
    },
  );
  await check(
    "aterrizaje y microvida terminan sin animación en reposo",
    async () => {
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='rest'",
      );
      await until("window.fixture.motion.active===0");
      assert.equal(
        await evaluate(
          "const bird=document.querySelector('span[data-step]');return bird.dataset.flying==='false' && bird.getAnimations({subtree:true}).length===0 && getComputedStyle(bird).willChange==='auto';",
        ),
        true,
      );
    },
  );
  await check(
    "stepId controlado muestra solo una vista y vuela hacia la izquierda",
    async () => {
      const resting = await evaluate(
        "const b=document.querySelector('span[data-step]');return {inline:b.style.transform,computed:getComputedStyle(b).transform,x:b.getBoundingClientRect().x,positioned:b.dataset.positioned};",
      );
      await evaluate(
        "document.getElementById('demo-pacientes').style.width='280px';window.fixture.setStep('pacientes');",
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.step==='pacientes' && document.querySelector('span[data-step]').dataset.flying==='true'",
      );
      const observed = await evaluate(
        "const bird=document.querySelector('span[data-step]');return {direction:bird.dataset.direction,views:[...document.querySelectorAll('main>section')].filter(e=>!e.hidden).length,focus:document.activeElement.textContent,facing:getComputedStyle(bird.firstElementChild.firstElementChild).transform.startsWith('matrix(-1')};",
      );
      assert.deepEqual(
        observed,
        {
          direction: "left",
          views: 1,
          focus: "Conoce pacientes",
          facing: true,
        },
        JSON.stringify({
          resting,
          paths: await evaluate(
            "return window.fixture.motion.paths.slice(-3);",
          ),
        }),
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='rest'",
      );
    },
  );
  await check(
    "ventanas con el mismo anclaje tienen un arco corto; cambio rápido cancela el vuelo anterior",
    async () => {
      const before = await evaluate(
        "return window.fixture.motion.paths.length;",
      );
      await evaluate(
        "document.getElementById('demo-notas').style.width='280px';window.fixture.setStep('notas');",
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.step==='notas' && document.querySelector('span[data-step]').dataset.flying==='true'",
      );
      assert.equal(
        await evaluate(
          `const path=window.fixture.motion.paths[${before}];const points=path.transforms.map(t=>new DOMMatrixReadOnly(t));return Math.hypot(points.at(-1).m41-points[0].m41,points.at(-1).m42-points[0].m42)<20 && points.some(p=>Math.hypot(p.m41-points[0].m41,p.m42-points[0].m42)>8);`,
        ),
        true,
      );
      await evaluate("window.fixture.setStep('mensajes');");
      await until(
        "document.querySelector('span[data-step]')?.dataset.step==='mensajes'",
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='rest' && window.fixture.motion.active===0",
      );
      assert.ok(
        (await evaluate("return window.fixture.motion.paths.length;")) -
          before <=
          16,
      );
    },
  );
  await check(
    "ocultar la página cancela vuelo y microvida sin reactivarlos al volver",
    async () => {
      await evaluate("window.fixture.setStep('cobros');");
      await until(
        "document.querySelector('span[data-step]')?.dataset.flying==='true'",
      );
      await evaluate("window.fixture.setHidden(true);");
      await until("window.fixture.motion.active===0");
      const created = await evaluate("return window.fixture.motion.created;");
      assert.equal(
        await evaluate(
          "const bird=document.querySelector('span[data-step]');return bird.dataset.phase==='rest' && bird.dataset.flying==='false' && bird.getAnimations({subtree:true}).length===0;",
        ),
        true,
      );
      await evaluate("window.fixture.setHidden(null);");
      await delay(140);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
    },
  );
  await check(
    "ahorro de datos y movimiento reducido evitan animaciones nativas",
    async () => {
      const created = await evaluate("return window.fixture.motion.created;");
      await evaluate(
        "Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}});window.fixture.setStep('cierre');",
      );
      await until("document.activeElement.textContent==='Conoce cierre'");
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      await evaluate("Reflect.deleteProperty(navigator,'connection');");
      await cli("set", "media", "light", "reduced-motion");
      await evaluate("window.fixture.setStep('notas');");
      await until("document.activeElement.textContent==='Conoce notas'");
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      await cli("press", "Escape");
      await until(
        "!document.querySelector('[role=dialog]') && window.fixture.motion.active===0",
      );
      assert.deepEqual(await evaluate("return window.fixture.resources;"), {
        resize: 0,
        mutation: 0,
        listeners: 0,
      });
    },
  );
  await cli("set", "media", "light", "no-preference");
  await check(
    "gestos naturales visibles y finitos se repiten con pausas sin mover el anclaje ni el foco",
    async () => {
      await cli("click", "button[aria-expanded=false]");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      const sample = () =>
        evaluate(
          "const bird=document.querySelector('span[data-step]');const pose=bird.firstElementChild;return {anchor:bird.style.transform,pose:getComputedStyle(pose).transform,focus:document.activeElement.textContent,scroll:scrollY,animations:bird.getAnimations({subtree:true}).map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations})),timers:window.fixture.pendingTimers()};",
        );
      const first = await sample();
      assert.equal(first.animations.length, 4);
      assert.ok(
        first.animations.every(
          (a) => a.duration === 1800 && a.iterations === 1,
        ),
      );
      await capture("idle-desktop-a");
      await delay(250);
      const second = await sample();
      assert.equal(second.anchor, first.anchor);
      assert.notEqual(second.pose, first.pose);
      assert.equal(second.focus, first.focus);
      assert.equal(second.scroll, first.scroll);
      await capture("idle-desktop-b");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='rest' && window.fixture.motion.active===0",
      );
      const pause = await sample();
      assert.equal(pause.animations.length, 0);
      assert.equal(pause.timers, 1);
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      idleEvidence.push({ first, second, pause, repeated: true });
    },
  );
  await check(
    "gestos en móvil conservan el ave dentro del viewport y los controles editables",
    async () => {
      await cli("set", "viewport", "390", "844");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      assert.equal(
        await evaluate(
          "const bird=document.querySelector('span[data-step]');const art=bird.firstElementChild.getBoundingClientRect();const button=document.querySelector('#demo-agenda button');const c=button.getBoundingClientRect();const panel=document.querySelector('[role=dialog]').getBoundingClientRect();return art.left>=0&&art.right<=innerWidth&&art.top>=0&&art.bottom<=innerHeight&&c.bottom<panel.top&&document.elementFromPoint(c.left+c.width/2,c.top+c.height/2)===button;",
        ),
        true,
      );
      await cli("fill", "#input-agenda", "Borrador ficticio con ave activa");
      assert.equal(
        await evaluate("return document.activeElement.id;"),
        "input-agenda",
      );
      await capture("idle-mobile");
    },
  );
  await check(
    "cambiar destino durante un gesto cancela sus animaciones y conserva el vuelo curvo",
    async () => {
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate("window.fixture.setStep('pacientes');");
      await until(
        "document.querySelector('span[data-step]')?.dataset.step==='pacientes' && document.querySelector('span[data-step]').dataset.phase==='flight'",
      );
      assert.equal(
        await evaluate(
          "const bird=document.querySelector('span[data-step]');return window.fixture.motion.active===2&&bird.firstElementChild.getAnimations().every(a=>a.effect.getTiming().duration<=1000);",
        ),
        true,
      );
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
    },
  );
  await check(
    "Escape durante un gesto libera animaciones y timers sin reinicios tardíos",
    async () => {
      await cli("press", "Escape");
      await until(
        "!document.querySelector('[role=dialog]') && window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
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
      await capture("idle-cleanup");
    },
  );
  await check(
    "ocultar durante un gesto cancela también su siguiente pausa y no lo reactiva al volver",
    async () => {
      await cli("click", "button[aria-expanded=false]");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate("window.fixture.setHidden(true);");
      await until(
        "window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
      );
      const created = await evaluate("return window.fixture.motion.created;");
      await evaluate("window.fixture.setHidden(null);");
      await delay(2100);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      await cli("press", "Escape");
    },
  );
  await check(
    "activar movimiento reducido durante un gesto lo detiene y deja navegación disponible",
    async () => {
      await cli("click", "button[aria-expanded=false]");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await cli("set", "media", "light", "reduced-motion");
      await until(
        "window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
      );
      const created = await evaluate("return window.fixture.motion.created;");
      await cli("press", "ArrowRight");
      await until("document.activeElement.textContent==='Conoce pacientes'");
      await delay(2100);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      await capture("idle-reduced-motion");
      await cli("press", "Escape");
    },
  );
  await cli("set", "media", "light", "no-preference");
  await check(
    "conexión lenta y ahorro de datos cancelan gestos y timers incluso al cambiar la conexión",
    async () => {
      await evaluate(
        "Object.defineProperty(navigator,'connection',{configurable:true,value:Object.assign(new EventTarget(),{saveData:false,effectiveType:'4g'})});",
      );
      await cli("click", "button[aria-expanded=false]");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate(
        "navigator.connection.effectiveType='2g';navigator.connection.dispatchEvent(new Event('change'));",
      );
      await until(
        "window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
      );
      const created = await evaluate("return window.fixture.motion.created;");
      await evaluate("window.fixture.setStep('mensajes');");
      await until("document.activeElement.textContent==='Conoce mensajes'");
      await delay(2100);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      await capture("idle-low-connectivity");
      await evaluate(
        "navigator.connection.effectiveType='4g';navigator.connection.saveData=true;navigator.connection.dispatchEvent(new Event('change'));window.fixture.setStep('cobros');",
      );
      await until("document.activeElement.textContent==='Conoce cobros'");
      await delay(2100);
      assert.equal(
        await evaluate("return window.fixture.motion.created;"),
        created,
      );
      await cli("press", "Escape");
      await until(
        "window.fixture.resources.listeners===0 && window.fixture.pendingTimers()===0",
      );
      await evaluate("Reflect.deleteProperty(navigator,'connection');");
    },
  );
  await check(
    "desmontar durante un gesto limpia timers, animaciones y listeners",
    async () => {
      await cli("click", "button[aria-expanded=false]");
      await until(
        "document.querySelector('span[data-step]')?.dataset.phase==='idle'",
      );
      await evaluate("window.fixture.remount();");
      await until(
        "!document.querySelector('[role=dialog]') && window.fixture.motion.active===0 && window.fixture.pendingTimers()===0",
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
        idleEvidence,
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
