import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Prueba de un gap pendiente, no una afirmación de que Atrás esté protegido.
async function reproduce(page) {
  await page.getByRole("link", { name: "Abrir notas ficticias" }).click();
  await page
    .getByRole("heading", { name: "Notas ficticias · App Router" })
    .waitFor();
  await page
    .getByRole("textbox")
    .nth(0)
    .fill("Primer borrador ficticio antes de Atrás");
  await page
    .getByRole("textbox")
    .nth(1)
    .fill("Segundo borrador ficticio antes de Atrás");
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll('form.note-editor button[type="submit"]'),
    ].every((button) => !button.disabled),
  );
  await page.evaluate(() => {
    window.notesHistoryProbe = { beforeUnload: 0, popstate: 0 };
    window.addEventListener(
      "beforeunload",
      () => window.notesHistoryProbe.beforeUnload++,
    );
    window.addEventListener(
      "popstate",
      () => window.notesHistoryProbe.popstate++,
    );
  });
  await page.goBack();
  await page
    .getByRole("heading", { name: "Destino anterior ficticio" })
    .waitFor();
  const detached = (await page.locator("textarea").count()) === 0;
  await page.goForward();
  await page.getByRole("textbox").nth(1).waitFor();
  const after = await page
    .getByRole("textbox")
    .evaluateAll((els) => els.map((el) => el.value));
  const probe = await page.evaluate(() => window.notesHistoryProbe);
  if (
    !detached ||
    probe.beforeUnload !== 0 ||
    after.join("|") !== "Apunte ficticio 0|Apunte ficticio 1"
  )
    throw new Error(
      "El gap cambió: revisar el contrato de navegación antes de repetir esta reproducción",
    );
  return {
    reproduced: true,
    blocker: true,
    detachedEditors: 2,
    beforeUnload: probe.beforeUnload,
    popstate: probe.popstate,
    restoredDrafts: false,
    scope:
      "Next App Router real en dev; NoteEditor real; acciones ficticias; sin BD/proveedores",
    required:
      "Contrato de navegación/drafts dentro de layout autenticado, con purga al cambiar actor/salir y aislamiento profesional/paciente/sesión/revisión",
  };
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
  assert.ok(result.includes('"reproduced":true'), "No se reprodujo el gap");
  await writeFile(
    join(root, "output/playwright/notes-router-blocker.txt"),
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
