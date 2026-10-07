import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

async function recoverConflict(page) {
  const checks = [];
  const ok = (v, n) => {
    if (!v) throw new Error(n);
    checks.push(n);
  };
  const other = await page.context().newPage();
  const url = page.url();
  const form = (p) => p.locator("form.practice-form");
  const field = (p, name) => form(p).locator(`[name="${name}"]`);
  const note = (p) => field(p, "generalNote");
  const consent = (p) => field(p, "profileConsent");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const idle = (p) =>
    p.waitForFunction(
      () =>
        document.querySelector("form")?.getAttribute("aria-busy") === "false",
    );
  const ready = (p) =>
    p.waitForFunction(
      () =>
        document
          .querySelector("form.practice-form")
          ?.getAttribute("aria-busy") === "false" &&
        !document.querySelector("form.practice-form > fieldset")?.disabled,
    );
  const control = async (kind, value) =>
    (
      await page.request.post(new URL("/api/control", url).href, {
        data: { kind, value },
      })
    ).json();
  const fill = async (p, values) => {
    for (const [name, value] of Object.entries(values)) {
      if (name === "sex") await field(p, name).selectOption(value);
      else await field(p, name).fill(value);
    }
  };
  const save = async (p, values) => {
    if (values) await fill(p, values);
    await consent(p).check();
    await form(p)
      .getByRole("button", { name: "Guardar datos de la ficha", exact: true })
      .click();
    await idle(p);
  };
  const values = async (p) => ({
    sex: await field(p, "sex").inputValue(),
    birthDate: await field(p, "birthDate").inputValue(),
    consultationReason: await field(p, "consultationReason").inputValue(),
    generalNote: await note(p).inputValue(),
  });
  const same = async (p, v) =>
    JSON.stringify(await values(p)) === JSON.stringify(v);
  const consult = async () => {
    await button("Consultar ficha guardada").click();
    await idle(page);
  };
  const compare = () =>
    page.getByRole("region", {
      name: "Comparar la ficha completa",
      exact: true,
    });
  const savedNote = () =>
    compare().getByRole("textbox", {
      name: "Nota general · Ficha guardada",
      exact: true,
    });
  const reviewed = "Revisé los campos; continuar con mi borrador";
  const A = {
    sex: "other",
    birthDate: "1990-01-01",
    consultationReason: "Motivo del borrador ficticio A",
    generalNote: "Borrador general ficticio A",
  };
  const B = {
    sex: "male",
    birthDate: "1980-01-01",
    consultationReason: "Motivo guardado ficticio B",
    generalNote: "Versión general ficticia B",
  };
  const storage = [];
  await page
    .context()
    .exposeBinding("profileStorageProbe", (_, r) => storage.push(r));
  await page.context().addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      void window.profileStorageProbe({
        clinical: /fictici|Motivo|Borrador|Combinación/.test(String(v)),
      });
      return write.call(this, k, v);
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      void window.profileStorageProbe({ idb: true });
      return open(...args);
    };
  });
  try {
    await page.reload();
    await other.goto(url);
    await ready(page);
    await ready(other);
    ok(
      !(await consent(page).isChecked()),
      "consulta inicial no concede consentimiento",
    );
    await fill(page, A);
    await save(other, B);
    await save(page);
    ok(
      await same(page, A),
      "conflicto conserva los cuatro campos y revisión original",
    );
    ok(
      (await field(page, "revision").inputValue()) === "1",
      "conflicto no promueve CAS",
    );
    ok(
      (await button("Consultar ficha guardada").count()) === 1,
      "conflicto ofrece comparar ficha sin recargar",
    );
    await button("Consultar ficha guardada").focus();
    await page.keyboard.press("Enter");
    await idle(page);
    ok(
      (await savedNote().inputValue()) === B.generalNote &&
        (await compare()
          .getByRole("textbox", {
            name: "Motivo · Ficha guardada",
            exact: true,
          })
          .inputValue()) === B.consultationReason &&
        (await compare().getByText("Masculino", { exact: true }).count()) ===
          1 &&
        (await compare().getByText(B.birthDate, { exact: true }).count()) === 1,
      "comparación muestra documento completo B",
    );
    ok(
      (await same(page, A)) &&
        (await field(page, "revision").inputValue()) === "1",
      "consulta sola conserva borrador completo y CAS",
    );
    ok(
      await savedNote().evaluate((el) => el.readOnly),
      "versión consultada sólo lectura",
    );
    ok(
      await compare()
        .getByRole("heading", { name: "Comparar la ficha completa" })
        .evaluate((el) => el === document.activeElement),
      "consulta por teclado enfoca comparación",
    );
    await page.keyboard.press("Tab");
    ok(
      await button("Consultar ficha guardada").evaluate(
        (el) => el === document.activeElement,
      ),
      "Tab continúa a controles de comparación",
    );
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `ficha y comparación sin overflow a ${width}px`,
      );
      ok(
        await savedNote().evaluate(
          (el) => el.getBoundingClientRect().width >= 110,
        ),
        `comparación legible a ${width}px`,
      );
      if (width === 320)
        await page.screenshot({
          path: "output/playwright/patient-profile-conflict-mobile.png",
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const B2 = {
      ...B,
      birthDate: "1981-02-02",
      consultationReason: "Motivo posterior ficticio B",
      generalNote: "Segunda versión general ficticia B",
    };
    await save(other, B2);
    const beforeChoice = (await control("state")).saves;
    await button(reviewed).click();
    await idle(page);
    ok(
      (await savedNote().inputValue()) === B2.generalNote &&
        (await same(page, A)) &&
        (await field(page, "revision").inputValue()) === "1",
      "elección obsoleta muestra versión nueva sin promover ni reemplazar",
    );
    ok(
      (await control("state")).saves === beforeChoice,
      "elegir no guarda automáticamente",
    );
    await button(reviewed).click();
    await idle(page);
    ok(
      (await same(page, A)) &&
        (await field(page, "revision").inputValue()) === "3" &&
        !(await consent(page).isChecked()),
      "elección explícita prepara borrador completo y exige consentimiento manual",
    );
    ok(
      (await note(page).evaluate((el) => el === document.activeElement)) &&
        (await button("Guardar datos de la ficha").isDisabled()),
      "preparar devuelve foco y no permite guardar sin consentimiento",
    );
    await form(page).evaluate((el) =>
      el.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    ok(
      (await control("state")).saves === beforeChoice,
      "submit forzado sin consentimiento no escribe",
    );
    const B3 = {
      ...B2,
      sex: "not_specified",
      generalNote: "Tercera versión general ficticia B",
    };
    await save(other, B3);
    await save(page);
    ok(
      (await same(page, A)) && (await control("state")).revisions.at(-1) === 3,
      "tercera edición posterior vuelve a rechazar CAS y conserva campos",
    );
    await consult();
    await button(reviewed).click();
    await idle(page);
    const combined = {
      ...B3,
      consultationReason: A.consultationReason,
      generalNote: "Combinación general ficticia A B",
    };
    await save(page, combined);
    ok(
      (await same(page, combined)) &&
        (await field(page, "revision").inputValue()) === "5" &&
        !(await consent(page).isChecked()),
      "combinación manual guarda los cuatro campos sin autorizar próxima edición",
    );
    await other.reload();
    await ready(other);
    ok(
      await same(other, combined),
      "segunda pestaña lee documento combinado completo",
    );
    const draftReplace = {
      ...combined,
      generalNote: "Borrador general ficticio para reemplazo",
    };
    const replaceVersion = {
      sex: "female",
      birthDate: "1992-02-29",
      consultationReason: "Motivo general ficticio reemplazo",
      generalNote: "Nota general ficticia reemplazo",
    };
    await fill(page, draftReplace);
    await save(other, replaceVersion);
    await save(page);
    await consult();
    await button("Usar ficha guardada").click();
    const replacementCheck = () =>
      compare().getByRole("checkbox", {
        name: "He conservado los cambios de los cuatro campos que necesito.",
        exact: true,
      });
    ok(
      (await replacementCheck().evaluate(
        (el) => el === document.activeElement,
      )) && (await button("Confirmar uso de la ficha guardada").isDisabled()),
      "reemplazo requiere confirmación de los cuatro campos y enfoca checkbox",
    );
    await button("Cancelar reemplazo").click();
    ok(
      (await same(page, draftReplace)) &&
        (await button("Usar ficha guardada").evaluate(
          (el) => el === document.activeElement,
        )),
      "cancelar conserva los cuatro campos y devuelve foco",
    );
    await button("Usar ficha guardada").click();
    await page.keyboard.press("Space");
    const latestReplace = {
      ...replaceVersion,
      sex: "intersex",
      birthDate: "1993-03-03",
      consultationReason: "Motivo actualizado ficticio B",
      generalNote: "Última nota general ficticia B",
    };
    await save(other, latestReplace);
    await button("Confirmar uso de la ficha guardada").click();
    await idle(page);
    ok(
      (await same(page, draftReplace)) &&
        (await replacementCheck().count()) === 0 &&
        (await savedNote().inputValue()) === latestReplace.generalNote,
      "versión cambiada retira confirmación y conserva documento completo",
    );
    await button("Usar ficha guardada").click();
    await replacementCheck().check();
    const beforeReplace = (await control("state")).saves;
    await button("Confirmar uso de la ficha guardada").click();
    await idle(page);
    ok(
      (await same(page, latestReplace)) &&
        (await control("state")).saves === beforeReplace &&
        !(await consent(page).isChecked()),
      "reemplazo confirmado carga cuatro campos sin escribir ni autorizar guardado",
    );
    ok(
      (await note(page).evaluate((el) => el === document.activeElement)) &&
        (await button("Guardar datos de la ficha").isDisabled()),
      "reemplazo deja editor limpio y enfocado",
    );
    const afterError = {
      ...latestReplace,
      generalNote: "Borrador general ficticio ante fallo y cuenta",
    };
    await fill(page, afterError);
    await save(other, {
      ...latestReplace,
      generalNote: "Versión general ficticia concurrente",
    });
    await save(page);
    await consult();
    await control("failRead", true);
    await consult();
    ok(
      (await same(page, afterError)) && (await savedNote().count()) === 0,
      "fallo de consulta conserva cuatro campos y retira comparación",
    );
    ok(
      await form(page)
        .getByRole("alert")
        .evaluate((el) => el === document.activeElement),
      "fallo de consulta tiene feedback con foco",
    );
    await control("failRead", false);
    await consult();
    await button("Cerrar comparación y seguir editando").click();
    ok(
      (await same(page, afterError)) &&
        (await note(page).evaluate((el) => el === document.activeElement)),
      "cerrar comparación conserva borrador completo y foco",
    );
    await page.getByRole("link", { name: "Otra página ficticia" }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    ok(await same(page, afterError), "Escape cancela salida sin perder campos");
    ok(
      await page.evaluate(() => {
        const e = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      }),
      "cierre del documento protege borrador agrupado",
    );
    await save(page);
    await control("hold");
    const beforeRead = (await control("state")).reads;
    const late = page.waitForResponse(
      (r) => !!r.request().headers()["next-action"],
    );
    await button("Consultar ficha guardada").click();
    for (let i = 0; i < 100; i++) {
      if ((await control("state")).reads > beforeRead) break;
      await page.waitForTimeout(20);
    }
    ok(
      (await note(page).isDisabled()) &&
        (await button("Guardar datos de la ficha").isDisabled()),
      "consulta pendiente bloquea escritura",
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("nido:account-session-changed")),
    );
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          'form [name="sex"],form [name="birthDate"],form textarea',
        ),
      ].every((el) => el.value === "" && el.matches(":disabled")),
    );
    ok(
      (await savedNote().count()) === 0,
      "invalidación retira comparación y documento antes de resolver lectura",
    );
    ok(
      await page.evaluate(() => {
        const e = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      }),
      "borrador oculto también protege cierre hasta reautorizar",
    );
    await control("release");
    await (await late).finished();
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    ok(
      (await note(page).inputValue()) === "" && (await note(page).isDisabled()),
      "respuesta permitida antigua no reabre texto",
    );
    await button("Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await same(page, afterError)) &&
        (await field(page, "revision").inputValue()) === "7" &&
        !(await consent(page).isChecked()),
      "cuenta igual restaura campos y revisión original con nuevo permiso",
    );
    await page
      .getByRole("button", { name: "Marcar ficha no disponible", exact: true })
      .click();
    ok(
      (await page.locator("form").count()) === 0 &&
        !(await page.locator("body").innerText()).includes(
          afterError.generalNote,
        ),
      "RSC no disponible retira formulario con datos",
    );
    await page
      .getByRole("button", {
        name: "Restaurar disponibilidad ficticia",
        exact: true,
      })
      .click();
    await idle(page);
    ok(
      (await same(page, afterError)) && (await note(page).isVisible()),
      "RSC disponible requiere lectura fresca y restaura borrador propio sin promover",
    );
    await save(page);
    await control("deny", true);
    await consult();
    ok(
      (await note(page).inputValue()) === "" && (await note(page).isDisabled()),
      "permiso revocado no muestra campos privados",
    );
    await button("Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await note(page).inputValue()) === "" && (await note(page).isDisabled()),
      "reintento denegado no recupera borrador",
    );
    await control("deny", false);
    await button("Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await same(page, afterError)) &&
        (await field(page, "revision").inputValue()) === "7",
      "nuevo permiso restaura sólo draft del mismo scope con CAS original",
    );
    await save(page);
    await control("actor", "B");
    await consult();
    ok(
      (await note(page).inputValue()) === "" && (await note(page).isDisabled()),
      "cuenta B no recibe borrador ni ficha A",
    );
    await button("Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await note(page).inputValue()) === "",
      "cuenta B tampoco abre RSC cacheado A al reintentar",
    );
    await control("actor", "A");
    await button("Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await note(page).inputValue()) ===
        "Versión general ficticia concurrente",
      "denegación de cuenta retiró draft A; sólo lectura fresca abre texto propio",
    );
    await fill(page, { generalNote: "Guardado general ficticio retenido" });
    await control("holdSave");
    const beforeSave = (await control("state")).saves;
    const oldSave = page.waitForResponse(
      (r) => !!r.request().headers()["next-action"],
    );
    await consent(page).check();
    await button("Guardar datos de la ficha").click();
    for (let i = 0; i < 100; i++) {
      if ((await control("state")).saves > beforeSave) break;
      await page.waitForTimeout(20);
    }
    await form(page).evaluate((el) =>
      el.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    ok(
      (await control("state")).saves === beforeSave + 1,
      "doble submit pendiente sólo ejecuta un guardado",
    );
    await page
      .getByRole("button", { name: "Remontar editor ficticio", exact: true })
      .click();
    ok(
      (await note(page).inputValue()) === "" && (await note(page).isDisabled()),
      "nuevo montaje no pinta props RSC anteriores al permiso",
    );
    await control("releaseSave");
    await (await oldSave).finished();
    await ready(page);
    await note(page).fill("Borrador general ficticio del montaje posterior");
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    ok(
      (await note(page).inputValue()) ===
        "Borrador general ficticio del montaje posterior" &&
        (await field(page, "revision").inputValue()) === "9",
      "respuesta de montaje anterior no altera el nuevo editor ni su revisión",
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("nido:session-changed")),
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll("form textarea")].every(
        (el) => el.value === "",
      ),
    );
    await button("Volver a comprobar acceso").click();
    await idle(page);
    ok(
      (await note(page).inputValue()) === "Guardado general ficticio retenido",
      "logout retira draft; autorización nueva abre sólo guardado",
    );
    await control("actor", "B");
    await page.reload();
    await ready(page);
    ok(
      (await note(page).inputValue()) === "Nota general ficticia B" &&
        (await field(page, "sex").inputValue()) === "male",
      "cuenta B abre sólo documento B con todos sus campos",
    );
    ok(
      !storage.some((r) => r.clinical || r.idb),
      "sin documento clínico en web storage ni IndexedDB",
    );
    return {
      passed: checks.length,
      checks,
      recovered: true,
      scope:
        "Next AppRouter/ServerActions reales; documento/actores ficticios; SQL y AES reales en suite aislada",
    };
  } finally {
    await other.close();
  }
}
const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(join(root, "output/playwright"), { recursive: true, mode: 0o700 });
const preview = spawn(
  process.execPath,
  [join(root, "test/patient-profile-conflict-preview.mjs")],
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
  process.env.NIDO_PROFILE_PWCLI ||
  join(homedir(), ".codex/skills/playwright/scripts/playwright_cli.sh");
const session = `nido-profile-router-${crypto.randomUUID()}`;
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
    join(root, "output/playwright/patient-profile-conflict-proof.txt"),
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
