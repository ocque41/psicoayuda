import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Regresión de Atrás: Next/Server Actions reales, actores/persistencia ficticios.
async function reproduce(page) {
  const checks = [];
  const storageWrites = [];
  await page.exposeBinding("noteStorageProbe", (_, record) => {
    storageWrites.push(record);
  });
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      void window.noteStorageProbe({
        kind: "web",
        clinical: /Borrador|Apunte ficticio|Cambio guardado ficticio/i.test(
          String(value),
        ),
      });
      return write.call(this, key, value);
    };
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      void window.noteStorageProbe({ kind: "idb", clinical: false });
      return open(...args);
    };
  });
  await page.reload();
  const ok = (value, name) => {
    if (!value) throw new Error(name);
    checks.push(name);
  };
  const inputs = () => page.getByRole("textbox");
  const settled = () =>
    page.waitForFunction(
      () =>
        [...document.querySelectorAll("form.note-editor")].length === 2 &&
        [...document.querySelectorAll("form.note-editor")].every(
          (form) => form.getAttribute("aria-busy") === "false",
        ),
    );
  const control = (kind, value) =>
    page.evaluate(
      async ({ kind, value }) =>
        (
          await fetch("/api/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, value }),
          })
        ).json(),
      { kind, value },
    );
  const back = async () => {
    await page.goBack();
    await page
      .getByRole("heading", { name: "Destino anterior ficticio" })
      .waitFor();
  };
  const forward = async () => {
    await page.goForward();
    await inputs().nth(1).waitFor();
    await settled();
  };
  const blank = async () => {
    await settled();
    return await inputs().evaluateAll((els) =>
      els.every((el) => el.value === "" && el.disabled),
    );
  };
  try {
    await page.getByRole("link", { name: "Abrir notas ficticias" }).click();
    await settled();
    await inputs().nth(0).fill("Primer borrador ficticio antes de Atrás");
    await inputs().nth(1).fill("Segundo borrador ficticio antes de Atrás");
    const before = (await control("state")).authCalls;
    await back();
    ok(
      (await page.locator("textarea").count()) === 0,
      "Atrás desmonta los editores en App Router real",
    );
    ok(
      await page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      "borradores retenidos protegen cierre también fuera de la ficha",
    );
    await forward();
    ok(
      (await inputs().nth(0).inputValue()) ===
        "Primer borrador ficticio antes de Atrás" &&
        (await inputs().nth(1).inputValue()) ===
          "Segundo borrador ficticio antes de Atrás",
      "Adelante recupera ambos borradores sólo tras comprobar acceso",
    );
    ok(
      (await control("state")).authCalls >= before + 2,
      "cada montaje pide autorización fresca por nota",
    );
    await back();
    await control("revise");
    await forward();
    await page
      .locator("form.note-editor")
      .nth(0)
      .getByRole("button", { name: "Guardar nota", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: "otra ventana" }).waitFor();
    ok(
      (await control("state")).saveRevisions.at(-1) === 1,
      "restaurar no promueve la revisión CAS antigua",
    );
    ok(
      (await inputs().nth(0).inputValue()) ===
        "Primer borrador ficticio antes de Atrás",
      "conflicto mantiene el borrador recuperado",
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("nido:session-changed")),
    );
    ok(await blank(), "evento de sesión limpia memoria y editores activos");
    await back();
    await forward();
    ok(
      !(await inputs().nth(0).inputValue()).includes("borrador"),
      "logout no permite recuperar los borradores retirados",
    );
    await inputs().nth(0).fill("Borrador privado ficticio de cuenta A");
    await back();
    await control("actor", "B");
    await forward();
    ok(
      await blank(),
      "otra cuenta no abre texto de una ficha RSC cacheada de A",
    );
    await page.reload();
    await settled();
    ok(
      (await inputs().nth(0).inputValue()) === "Apunte ficticio B0",
      "B muestra únicamente su nota propia tras autorización",
    );
    await inputs().nth(0).fill("Borrador privado ficticio de cuenta B");
    await back();
    await control("actor", "A");
    await forward();
    ok(await blank(), "A tampoco abre el borrador cacheado de B");
    await page.reload();
    await settled();
    ok(
      !(await inputs().nth(0).inputValue()).includes("cuenta B"),
      "cambiar de actor no mezcla el borrador de B con A",
    );
    // Crear historial del documento actual sin navegar con borrador.
    await page.goto(new URL("/", page.url()).href);
    await page.getByRole("link", { name: "Abrir notas ficticias" }).click();
    await settled();
    await inputs().nth(0).fill("Borrador ficticio de sesión expirada");
    await back();
    await control("expire", true);
    await forward();
    ok(
      await blank(),
      "sesión expirada impide abrir el draft y limpia su memoria",
    );
    await control("expire", false);
    await page.reload();
    await settled();
    // Historial nuevo, sin borrar el documento durante el caso bajo prueba.
    await page.goto(new URL("/", page.url()).href);
    await page.getByRole("link", { name: "Abrir notas ficticias" }).click();
    await settled();
    await inputs().nth(0).fill("Borrador ficticio con respuesta tardía");
    await back();
    const held = await control("hold");
    let responses = 0;
    const lastResponse = page.waitForResponse(
      (response) =>
        Boolean(response.request().headers()["next-action"]) &&
        ++responses === 2,
    );
    await page.goForward();
    await inputs().nth(1).waitFor();
    await page.waitForFunction(
      async (initial) =>
        (
          await (
            await fetch("/api/control", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "state" }),
            })
          ).json()
        ).authCalls > initial,
      held.authCalls,
    );
    await page.evaluate(() =>
      window.dispatchEvent(new Event("nido:session-changed")),
    );
    await control("release");
    await (await lastResponse).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    ok(
      await blank(),
      "respuesta permitida anterior a logout no revive el texto",
    );
    await back();
    await forward();
    await inputs().nth(0).fill("Borrador ficticio con TTL");
    await back();
    await page.evaluate(() => {
      const original = Date.now;
      Date.now = () => original() + 15 * 60 * 1000 + 1;
    });
    await forward();
    ok(
      !(await inputs().nth(0).inputValue()).includes("con TTL"),
      "draft caducado no se restaura en navegador",
    );
    ok(
      !storageWrites.some((record) => record.clinical || record.kind === "idb"),
      "ningún borrador escrito en web storage o IndexedDB",
    );
    return {
      passed: checks.length,
      checks,
      restoredDrafts: true,
      scope:
        "Next App Router y Server Actions reales; editor/cache reales; actores y CAS de fixture; autorización/CAS SQL real en test:isolated",
    };
  } catch (error) {
    throw new Error(`${error.message}; completadas: ${checks.join(", ")}`);
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
  const result = await command("run-code", reproduce.toString());
  assert.ok(
    result.includes('"restoredDrafts":true'),
    `La regresión no entregó resultado: ${result.slice(-1800)}`,
  );
  await writeFile(
    join(root, "output/playwright/notes-router-continuity.txt"),
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
