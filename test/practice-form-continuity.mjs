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

// Regresión real de ReactDOM en una página ficticia: no Next, DB ni proveedores.
// Requiere agent-browser ya instalado; no instala navegador ni dependencias.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
const browser = process.env.NIDO_FORM_BROWSER || "agent-browser";
const runBrowser = promisify(execFile);
const session = `nido-form-${crypto.randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "nido-form-regression-"));
let launched = false;
const checks = [];
async function cli(...args) {
  const { stdout: output } = await runBrowser(
    browser,
    ["--session", session, "--json", ...args],
    {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const result = JSON.parse(output);
  assert.equal(
    result.success,
    true,
    "Falló la automatización local del formulario ficticio",
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
      throw new Error("La UI ficticia no completó la transición esperada");
    await delay(25);
  }
}
async function check(name, assertion) {
  await assertion();
  checks.push(name);
}
const snapshot = async () =>
  await evaluate(`const f=document.querySelector('form');return {
  amount:f.elements.amount.value,reference:f.elements.reference.value,method:f.elements.method.value,
  body:f.elements.body.value,checked:f.elements.consent.checked,role:f.elements.role.value,
  tags:[...f.elements.tags.selectedOptions].map(o=>o.value),file:f.elements.attachment.files[0]?.name||'',
  baselineDisabled:f.elements.unavailable.matches(':disabled'),editable:!f.elements.amount.matches(':disabled')};`);
async function submit(mode) {
  const before = await evaluate("return window.fixture.calls.length;");
  await evaluate(
    `window.fixture.mode=${JSON.stringify(mode)};document.querySelector('form').requestSubmit();`,
  );
  await until(
    `window.fixture.calls.length===${before + 1} && document.querySelector('form').getAttribute('aria-busy')==='false'`,
  );
}
const server = createServer(async (request, response) => {
  const name = request.url === "/" ? "index.html" : request.url?.slice(1);
  if (!name || !/^(index\.html|fixture\.js)$/.test(name)) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader(
    "Content-Type",
    name.endsWith(".js") ? "text/javascript" : "text/html",
  );
  response.end(await readFile(join(directory, name)));
});
try {
  await esbuild.build({
    entryPoints: [join(root, "src/tests/fixtures/practice-form-browser.tsx")],
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
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Regresión ficticia de formularios</title></head><body><main id="root"></main><script src="fixture.js"></script></body></html>',
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await cli("open", `http://127.0.0.1:${address.port}/`);
  launched = true;
  await cli("snapshot", "-i");
  await cli("fill", 'input[name="amount"]', "42");
  await cli("fill", 'input[name="reference"]', "Referencia ficticia editada");
  await cli("select", 'select[name="method"]', "transfer");
  await cli("fill", 'textarea[name="body"]', "Borrador ficticio de prueba");
  await cli("check", 'input[name="consent"]');
  await cli("check", 'input[name="role"][value="two"]');
  await cli("select", 'select[name="tags"]', "b", "c");
  const upload = join(directory, "archivo-ficticio.txt");
  await writeFile(upload, "Contenido completamente ficticio");
  await cli("upload", 'input[name="attachment"]', upload);
  const draft = await snapshot();
  await check("fallback POST sin datos en query", async () =>
    assert.equal(
      await evaluate(
        "return document.querySelector('form').getAttribute('method');",
      ),
      "post",
    ),
  );
  await evaluate("window.fixture.hold();");
  await cli("click", 'button[name="intent"]');
  await evaluate(
    "const f=document.querySelector('form');f.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));",
  );
  await until(
    "document.querySelector('form').getAttribute('aria-busy')==='true'",
  );
  await check("pending bloquea edición y envíos repetidos", async () =>
    assert.equal(
      await evaluate(
        "const f=document.querySelector('form');return window.fixture.calls.length===1 && [...f.querySelectorAll('input,select,textarea,button')].every(c=>c.matches(':disabled'));",
      ),
      true,
    ),
  );
  await check(
    "snapshot captura todos los valores y el submitter antes de disabled",
    async () => {
      const data = await evaluate("return window.fixture.calls[0].data;");
      assert.deepEqual(
        data.filter(([name]) => name === "tags"),
        [
          ["tags", "b"],
          ["tags", "c"],
        ],
      );
      assert.deepEqual(
        data.find(([name]) => name === "intent"),
        ["intent", "alternate"],
      );
      assert.deepEqual(
        data.find(([name]) => name === "entity"),
        ["entity", "fixture-only"],
      );
      assert.deepEqual(
        data.find(([name]) => name === "attachment"),
        ["attachment", "archivo-ficticio.txt"],
      );
      assert.equal(
        data.some(([name]) => name === "unavailable"),
        false,
      );
    },
  );
  await evaluate("window.fixture.release();");
  await until(
    "document.querySelector('[role=alert]') && document.querySelector('form').getAttribute('aria-busy')==='false'",
  );
  await check(
    "fallo servidor conserva input/select/textarea/check/radio/multiple/file",
    async () => assert.deepEqual(await snapshot(), draft),
  );
  await check("feedback de error tiene foco y asociación accesible", async () =>
    assert.equal(
      await evaluate(
        "const f=document.querySelector('form');return document.activeElement.getAttribute('role')==='alert' && f.getAttribute('aria-describedby')===document.activeElement.id;",
      ),
      true,
    ),
  );
  const firstNotice = await evaluate(
    "window.fixture.firstNotice=document.querySelector('[role=alert]');return window.fixture.calls.length;",
  );
  await submit("same");
  await check(
    "error idéntico se vuelve a anunciar y conserva previousState",
    async () => {
      assert.equal(
        await evaluate(
          "return window.fixture.firstNotice!==document.querySelector('[role=alert]') && document.activeElement.getAttribute('role')==='alert';",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          `return window.fixture.calls[${firstNotice}].previous.ok;`,
        ),
        false,
      );
    },
  );
  await submit("throw");
  await check(
    "error de red desconocido conserva borrador sin revelar detalle",
    async () => {
      assert.deepEqual(await snapshot(), draft);
      const text = await evaluate(
        "return document.querySelector('[role=alert]').textContent;",
      );
      assert.ok(text.includes("No pudimos confirmar"));
      assert.equal(text.includes("privado"), false);
    },
  );
  await submit("success");
  await check("éxito de edición conserva valores por defecto", async () => {
    assert.deepEqual(await snapshot(), draft);
    assert.equal(
      await evaluate("return document.querySelector('[role=status]')!==null;"),
      true,
    );
  });
  await submit("null");
  await check("sin confirmación explícita no se resetean los datos", async () =>
    assert.deepEqual(await snapshot(), draft),
  );
  await evaluate("window.fixture.reset=true;window.fixture.remount();");
  await until(
    "document.querySelector('form') && !document.querySelector('[role=status]')",
  );
  await cli("fill", 'input[name="amount"]', "24");
  await cli("fill", 'input[name="reference"]', "Segundo ejemplo ficticio");
  await cli("select", 'select[name="method"]', "transfer");
  await cli("check", 'input[name="consent"]');
  await submit("failure");
  await check("reset opt-in nunca borra un error", async () =>
    assert.equal((await snapshot()).amount, "24"),
  );
  await submit("success");
  await check(
    "reset opt-in limpia únicamente tras éxito y respeta defaults",
    async () => {
      const value = await snapshot();
      assert.equal(value.amount, "");
      assert.equal(value.reference, "Referencia inicial");
      assert.equal(value.method, "cash");
      assert.equal(value.checked, false);
      assert.equal(value.baselineDisabled, true);
    },
  );
  const calls = await evaluate("return window.fixture.calls.length;");
  await evaluate("document.querySelector('form').requestSubmit();");
  await check("validación nativa no envía el formulario vacío", async () =>
    assert.equal(await evaluate("return window.fixture.calls.length;"), calls),
  );
  for (const [mode, prefix] of [
    ["redirect", "NEXT_REDIRECT"],
    ["notfound", "NEXT_NOT_FOUND"],
    ["http-notfound", "NEXT_HTTP_ERROR_FALLBACK"],
  ]) {
    await evaluate(
      `window.fixture.mode=${JSON.stringify(mode)};window.fixture.remount();`,
    );
    await until("document.querySelector('form')!==null");
    await cli("fill", 'input[name="amount"]', "30");
    await evaluate("document.querySelector('form').requestSubmit();");
    await until("document.querySelector('#boundary')!==null");
    await check(`preserva control Next ${mode}`, async () =>
      assert.ok(
        (
          await evaluate("return window.fixture.errors.at(-1).digest;")
        ).startsWith(prefix),
      ),
    );
  }
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        scope:
          "React real + componente real; acción ficticia en HTTP local aislado; sin DB/providers",
      },
      null,
      2,
    ),
  );
} finally {
  if (launched) await cli("close");
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
