import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

async function recoverConflict(page) {
  const checks = [];
  const ok = (value, name) => {
    if (!value) throw new Error(name);
    checks.push(name);
  };
  const url = new URL("/notes", page.url()).href;
  const other = await page.context().newPage();
  const form = (p) => p.locator("form.note-editor").nth(0);
  const text = (p) => form(p).locator("textarea:not([readonly])");
  const button = (p, name) =>
    form(p).getByRole("button", { name, exact: true });
  const preview = () =>
    form(page).getByRole("textbox", { name: "Versión guardada", exact: true });
  const idle = (p) =>
    p.waitForFunction(
      () =>
        [...document.querySelectorAll("form.note-editor")].length === 2 &&
        [...document.querySelectorAll("form.note-editor")].every(
          (el) => el.getAttribute("aria-busy") === "false",
        ),
    );
  const control = async (kind, value) =>
    (
      await page.request.post(new URL("/api/control", url).href, {
        data: { kind, value },
      })
    ).json();
  const save = async (p, content) => {
    if (content) await text(p).fill(content);
    await button(p, "Guardar nota").click();
    await idle(p);
  };
  const consult = async () => {
    await button(page, "Consultar versión guardada").click();
    await idle(page);
  };
  const reviewed = "Revisé la versión; continuar con mi borrador";
  const draft = "Borrador ficticio de pestaña A que no debe perderse";
  const storage = [];
  await page
    .context()
    .exposeBinding("conflictStorageProbe", (_, record) => storage.push(record));
  await page.context().addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      void window.conflictStorageProbe({
        kind: "web",
        clinical: /fictici|Borrador|Combinación/.test(String(value)),
      });
      return write.call(this, key, value);
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      void window.conflictStorageProbe({ kind: "idb" });
      return open(...args);
    };
  });
  try {
    await page.goto(url);
    await other.goto(url);
    await idle(page);
    await idle(other);
    await text(page).fill(draft);
    await save(other, "Versión ficticia guardada por pestaña B");
    await save(page);
    ok(
      (await text(page).inputValue()) === draft,
      "dos pestañas causan conflicto sin perder borrador",
    );
    ok(
      await text(page).evaluate((el) => el === document.activeElement),
      "conflicto devuelve foco al borrador",
    );
    ok(
      (await button(page, "Consultar versión guardada").count()) === 1,
      "conflicto ofrece recuperación sin recargar documento",
    );
    await button(page, "Consultar versión guardada").focus();
    await page.keyboard.press("Enter");
    await idle(page);
    ok(
      (await preview().inputValue()).includes("pestaña B"),
      "consulta muestra versión vigente B tras acción fresca",
    );
    ok(
      (await preview().evaluate((el) => el.readOnly)) &&
        (await form(page)
          .getByRole("textbox", { name: "Mi borrador sin guardar" })
          .evaluate((el) => el.readOnly)),
      "ambas vistas de comparación son sólo lectura",
    );
    ok(
      (await text(page).inputValue()) === draft,
      "consulta no reemplaza texto A",
    );
    ok(
      (await control("status")).saveRevisions.at(-1) === 1,
      "consulta no promueve revisión original ni guarda",
    );
    ok(
      await form(page)
        .getByRole("heading", { name: "Revisar el conflicto" })
        .evaluate((el) => el === document.activeElement),
      "consulta con teclado enfoca título de comparación",
    );
    await page.keyboard.press("Tab");
    ok(
      await button(page, "Consultar versión guardada").evaluate(
        (el) => el === document.activeElement,
      ),
      "Tab continúa desde título hacia controles",
    );
    await button(page, "Seleccionar mi borrador").click();
    ok(
      await form(page)
        .getByRole("textbox", { name: "Mi borrador sin guardar" })
        .evaluate(
          (el) =>
            el === document.activeElement &&
            el.selectionStart === 0 &&
            el.selectionEnd === el.value.length,
        ),
      "selección manual del borrador sin copiarlo a terceros",
    );
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `comparación sin overflow a ${width}px`,
      );
      ok(
        await preview().evaluate(
          (el) => el.getBoundingClientRect().width >= 110,
        ),
        `versiones legibles a ${width}px`,
      );
      if (width === 320)
        await page.screenshot({
          path: "output/playwright/notes-conflict-mobile.png",
          fullPage: true,
        });
    }
    await save(other, "Segunda versión ficticia B");
    const callsBefore = (await control("status")).saveCalls;
    await button(page, reviewed).click();
    await idle(page);
    ok(
      (await preview().inputValue()) === "Segunda versión ficticia B" &&
        (await text(page).inputValue()) === draft,
      "tercera edición actualiza comparación y conserva borrador",
    );
    ok(
      (await control("status")).saveCalls === callsBefore,
      "elegir sobre comparación antigua no escribe",
    );
    await save(page);
    ok(
      (await control("status")).saveRevisions.at(-1) === 1,
      "versión cambiada exige otra elección y conserva CAS original",
    );
    await consult();
    await button(page, reviewed).click();
    await idle(page);
    ok(
      (await text(page).inputValue()) === draft &&
        (await text(page).evaluate((el) => el === document.activeElement)),
      "elección explícita conserva borrador y foco para combinar",
    );
    const callsAfterChoice = (await control("status")).saveCalls;
    ok(
      callsAfterChoice === callsBefore + 1,
      "preparar borrador no ejecuta guardado automático",
    );
    await save(other, "Tercera versión ficticia B");
    await save(page);
    ok(
      (await control("status")).saveRevisions.at(-1) === 3 &&
        (await text(page).inputValue()) === draft,
      "cambio posterior a elección vuelve a rechazar CAS sin perder texto",
    );
    await consult();
    await button(page, reviewed).click();
    await idle(page);
    await save(page, "Combinación ficticia A y B revisada");
    ok(
      (await control("status")).saveRevisions.at(-1) === 4 &&
        (await button(page, "Guardar nota").isDisabled()),
      "combinación explícita guarda con revisión vigente",
    );
    await other.goto(url);
    await idle(other);
    ok(
      (await text(other).inputValue()) ===
        "Combinación ficticia A y B revisada",
      "segunda pestaña lee combinación confirmada",
    );
    await text(page).fill(
      "Borrador ficticio para elección de versión guardada",
    );
    await save(other, "Versión ficticia para reemplazar borrador");
    await save(page);
    await consult();
    await button(page, "Usar versión guardada").click();
    const checkbox = form(page).getByRole("checkbox", {
      name: "He conservado los cambios del borrador que necesito.",
    });
    ok(
      (await checkbox.evaluate((el) => el === document.activeElement)) &&
        (await button(
          page,
          "Confirmar uso de la versión guardada",
        ).isDisabled()),
      "reemplazo requiere confirmación con foco en checkbox",
    );
    await button(page, "Cancelar reemplazo").click();
    ok(
      (await text(page).inputValue()).startsWith("Borrador ficticio") &&
        (await button(page, "Usar versión guardada").evaluate(
          (el) => el === document.activeElement,
        )),
      "cancelar reemplazo conserva borrador y devuelve foco",
    );
    await button(page, "Usar versión guardada").click();
    await page.keyboard.press("Space");
    await save(other, "Versión ficticia más reciente B");
    await button(page, "Confirmar uso de la versión guardada").click();
    await idle(page);
    ok(
      (await preview().inputValue()) === "Versión ficticia más reciente B" &&
        (await checkbox.count()) === 0 &&
        (await text(page).inputValue()).startsWith("Borrador ficticio"),
      "reemplazo obsoleto vuelve a pedir revisión y preserva borrador",
    );
    await button(page, "Usar versión guardada").click();
    await checkbox.check();
    const beforeReplace = (await control("status")).saveCalls;
    await button(page, "Confirmar uso de la versión guardada").click();
    await idle(page);
    ok(
      (await text(page).inputValue()) === "Versión ficticia más reciente B" &&
        (await control("status")).saveCalls === beforeReplace,
      "reemplazo confirmado sólo cambia editor, no BD",
    );
    ok(
      (await text(page).evaluate((el) => el === document.activeElement)) &&
        (await button(page, "Guardar nota").isDisabled()),
      "versión guardada deja editor limpio y enfocado",
    );
    await text(page).fill("Borrador ficticio ante errores y logout");
    await save(other, "Versión ficticia tras reemplazo");
    await save(page);
    await control("failVersion", true);
    await consult();
    ok(
      (await text(page).inputValue()).includes("errores") &&
        (await preview().count()) === 0,
      "fallo de consulta conserva borrador y no abre versión",
    );
    ok(
      await form(page)
        .getByRole("status")
        .filter({ hasText: "No pudimos consultar" })
        .evaluate((el) => el === document.activeElement),
      "error de consulta enfoca feedback accesible",
    );
    await control("failVersion", false);
    await consult();
    await button(page, "Cerrar comparación y seguir editando").click();
    ok(
      (await preview().count()) === 0 &&
        (await text(page).evaluate((el) => el === document.activeElement)),
      "cerrar comparación conserva borrador y foco",
    );
    await save(page);
    await control("holdVersion");
    const versionCalls = (await control("status")).versionCalls;
    const heldResponse = page.waitForResponse((response) =>
      Boolean(response.request().headers()["next-action"]),
    );
    await button(page, "Consultar versión guardada").click();
    for (let i = 0; i < 100; i++) {
      if ((await control("status")).versionCalls > versionCalls) break;
      await page.waitForTimeout(20);
    }
    ok(
      (await button(page, "Guardar nota").isDisabled()) &&
        (await text(page).isDisabled()),
      "consulta pendiente bloquea mutaciones duplicadas",
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("nido:account-session-changed")),
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll("form.note-editor textarea")].every(
        (el) => el.value === "" && el.disabled,
      ),
    );
    ok(
      (await text(page).inputValue()) === "" && (await preview().count()) === 0,
      "invalidación retira ambas versiones antes de resolver consulta",
    );
    await control("releaseVersion");
    await (await heldResponse).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await idle(page);
    ok(
      (await text(page).inputValue()) === "" && (await preview().count()) === 0,
      "respuesta permitida antigua no reabre plaintext",
    );
    await button(page, "Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await text(page).inputValue()).includes("errores"),
      "cuenta igual reautoriza y conserva borrador original",
    );
    await save(page);
    await control("scopeDenied", true);
    await consult();
    ok(
      (await text(page).inputValue()) === "" &&
        (await text(page).isDisabled()) &&
        (await preview().count()) === 0,
      "permiso de ficha revocado retira texto visible",
    );
    await control("scopeDenied", false);
    await button(page, "Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await text(page).inputValue()).includes("errores"),
      "permiso recuperado restaura sólo borrador de su ámbito",
    );
    await save(page);
    await consult();
    await control("actor", "B");
    await button(page, reviewed).click();
    await idle(page);
    ok(
      (await text(page).inputValue()) === "" &&
        (await text(page).isDisabled()) &&
        (await preview().count()) === 0,
      "decisión con cuenta B retira texto A antes de aplicar versión",
    );
    await page.goto(url);
    await idle(page);
    ok(
      (await text(page).inputValue()) === "Apunte ficticio B0",
      "cuenta B sólo abre su propia nota",
    );
    ok(
      !storage.some((record) => record.clinical) &&
        !storage.some((record) => record.kind === "idb"),
      "comparación y borrador no se escriben en web storage ni IndexedDB",
    );
    return {
      passed: checks.length,
      checks,
      recovered: true,
      scope:
        "AppRouter/ServerActions reales; dos pestañas ficticias; SQL real por separado",
    };
  } finally {
    await other.close();
  }
}
const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(join(root, "output/playwright"), { recursive: true, mode: 0o700 });
const preview = spawn(
  process.execPath,
  [join(root, "test/notes-app-router-preview.mjs")],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
);
const url = await new Promise((resolve, reject) => {
  let output = "";
  preview.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.includes("\n")) {
      try {
        resolve(JSON.parse(output.split("\n")[0]).url);
      } catch (error) {
        reject(error);
      }
    }
  });
  preview.once("exit", (code) => reject(new Error(`Preview terminó: ${code}`)));
});
const cli =
  process.env.NIDO_NOTES_PWCLI ||
  join(homedir(), ".codex/skills/playwright/scripts/playwright_cli.sh");
const session = `nido-notes-router-${crypto.randomUUID()}`;
const exec = promisify(execFile);
async function command(...args) {
  let stdout;
  try {
    ({ stdout } = await exec(cli, [`-s=${session}`, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    }));
  } catch (error) {
    throw new Error(
      error.stdout || error.stderr || "La reproducción no terminó",
    );
  }
  assert.ok(!stdout.includes("### Error"), stdout);
  return stdout;
}
try {
  await command("open", url);
  await command("snapshot");
  const result = await command("run-code", recoverConflict.toString());
  assert.ok(
    result.includes('"recovered":true'),
    `La regresión no entregó resultado: ${result.slice(-1800)}`,
  );
  await writeFile(
    join(root, "output/playwright/notes-conflict-proof.txt"),
    result,
    { mode: 0o600 },
  );
  console.log(result.split("### Ran Playwright code")[0].trim());
} finally {
  await command("close").catch(() => {});
  await new Promise((resolve) => {
    preview.once("exit", resolve);
    preview.kill("SIGTERM");
  });
}
