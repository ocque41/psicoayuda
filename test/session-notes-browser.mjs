import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Playwright CLI + ReactDOM real. Acciones ficticias: la suite SQL aislada
// comprueba por separado CAS/cifrado/ownership y reintentos de respuesta perdida.
async function browserChecks(page) {
  const checks = [];
  try {
    const ok = (condition, name) => {
      if (!condition) throw new Error(name);
      checks.push(name);
    };
    const fixture = (fn, arg) => page.evaluate(fn, arg);
    const editor = () => page.locator("form.note-editor");
    const text = () => editor().locator("textarea");
    const save = () =>
      page.getByRole("button", { name: "Guardar nota", exact: true });
    const idle = () =>
      page.waitForFunction(
        () =>
          document
            .querySelector("form.note-editor")
            ?.getAttribute("aria-busy") === "false",
      );
    const reset = async (options = {}) => {
      const epoch = await fixture((options) => {
        const f = window.nidoNotesFixture;
        f.release();
        Object.assign(
          f,
          { mode: "success", existing: true, enabled: true, calls: [] },
          options,
        );
        const epoch = Number(
          document.querySelector("main").dataset.fixtureEpoch,
        );
        f.remount();
        return epoch + 1;
      }, options);
      await page.waitForFunction(
        (epoch) =>
          Number(document.querySelector("main").dataset.fixtureEpoch) === epoch,
        epoch,
      );
    };
    await page.addInitScript(() => {
      window.notesAudioStarts = 0;
      const NativeAudio = window.AudioContext;
      if (NativeAudio)
        window.AudioContext = class extends NativeAudio {
          constructor(...args) {
            super(...args);
            window.notesAudioStarts++;
          }
        };
    });
    await page.reload();
    await text().waitFor();
    ok(
      await fixture(() => window.notesAudioStarts === 0),
      "sin canto automático",
    );
    ok(await save().isDisabled(), "nota limpia no permite guardar");
    await editor().evaluate((form) => form.requestSubmit());
    ok(
      await fixture(() => window.nidoNotesFixture.calls.length === 0),
      "submit forzado de nota limpia no escribe",
    );
    ok(
      await text().evaluate((el) => {
        const ids = el.getAttribute("aria-describedby").split(" ");
        return (
          ids.every((id) => document.getElementById(id)) &&
          !document.getElementById(ids[0]).textContent.includes("12.000")
        );
      }),
      "estado accesible separado del contador",
    );

    await reset({ mode: "throw" });
    await text().fill("Borrador ficticio que permanece");
    await text().press("Tab");
    ok(
      await save().evaluate((el) => el === document.activeElement),
      "teclado llega a Guardar nota",
    );
    await page.keyboard.press("Enter");
    await page.getByRole("alert").waitFor();
    await idle();
    ok(
      (await text().inputValue()) === "Borrador ficticio que permanece",
      "fallo de red conserva el borrador",
    );
    ok(
      await text().evaluate((el) => el === document.activeElement),
      "fallo devuelve el foco al texto",
    );
    ok(
      await text().evaluate((el) =>
        el
          .getAttribute("aria-describedby")
          .split(" ")
          .some(
            (id) =>
              document.getElementById(id)?.getAttribute("role") === "alert",
          ),
      ),
      "error asociado al textarea",
    );
    await fixture(() => {
      window.nidoNotesFixture.mode = "conflict";
    });
    await save().click();
    await page.getByRole("alert").filter({ hasText: "otra ventana" }).waitFor();
    ok(
      (await text().inputValue()) === "Borrador ficticio que permanece",
      "conflicto conserva texto y revisión original",
    );
    ok(
      await fixture(() =>
        window.nidoNotesFixture.calls.every(
          (call) => call.input.revision === 1,
        ),
      ),
      "fallo y conflicto no adelantan revisión",
    );
    await fixture(() => {
      window.nidoNotesFixture.mode = "success";
    });
    await save().click();
    await idle();
    ok(
      await save().isDisabled(),
      "reintento confirmado marca la nota guardada",
    );
    await text().fill("Siguiente cambio ficticio");
    await save().click();
    await idle();
    ok(
      await fixture(
        () => window.nidoNotesFixture.calls.at(-1).input.revision === 2,
      ),
      "siguiente edición utiliza revisión confirmada",
    );

    await reset();
    await page.getByText("Eliminar esta nota", { exact: true }).click();
    await text().fill("Borrador ficticio pendiente");
    await fixture(() => {
      window.nidoNotesFixture.hold();
    });
    // Dos eventos en el mismo tick fuerzan el caso anterior al rerender de pending.
    await editor().evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
      form.querySelector("details button").click();
    });
    await page.waitForFunction(
      () => window.nidoNotesFixture.calls.length === 1,
    );
    ok(
      await fixture(() => window.nidoNotesFixture.calls[0].kind === "save"),
      "doble submit y borrar durante guardado producen una sola operación",
    );
    ok(await text().isDisabled(), "texto bloqueado sólo mientras guarda");
    await fixture(() => {
      window.nidoNotesFixture.release();
    });
    await idle();
    ok(
      !(await text().isDisabled()),
      "texto vuelve a habilitarse tras respuesta",
    );

    await reset({ mode: "throw" });
    await page.getByText("Eliminar esta nota", { exact: true }).click();
    // El evento nativo toggle de details se despacha en una tarea posterior.
    // Esperar la confirmación habilitada evita probar un botón aún desactivado.
    await page.waitForFunction(
      () => !document.querySelector("details button").disabled,
    );
    await fixture(() => {
      window.nidoNotesFixture.hold();
    });
    await page
      .getByRole("button", { name: "Confirmar eliminación" })
      .evaluate((button) => {
        button.click();
        button.click();
      });
    await page.waitForFunction(
      () => window.nidoNotesFixture.calls.length === 1,
    );
    await fixture(() => {
      window.nidoNotesFixture.release();
    });
    await page.getByRole("alert").waitFor();
    await idle();
    ok(
      (await text().inputValue()) === "Apunte ficticio inicial",
      "borrado repetido/fallido conserva nota",
    );
    await fixture(() => {
      window.nidoNotesFixture.mode = "success";
    });
    await page.getByRole("button", { name: "Confirmar eliminación" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Nota eliminada." })
      .waitFor();
    ok(
      (await editor().count()) === 0,
      "eliminación confirmada retira sólo el editor",
    );

    await reset({ enabled: false });
    ok(await text().isDisabled(), "sin permiso el texto no es editable");
    await editor().evaluate((form) => form.requestSubmit());
    ok(
      await fixture(() => window.nidoNotesFixture.calls.length === 0),
      "sin permiso no se invoca guardar",
    );
    await reset({ existing: false });
    await text().fill("Nota nueva ficticia");
    await save().click();
    await idle();
    await page
      .getByRole("button", { name: "Escribir otra nota para esta sesión" })
      .click();
    ok(
      (await text().inputValue()) === "" &&
        (await text().evaluate((el) => el === document.activeElement)),
      "otra nota inicia vacía y con foco",
    );

    await reset();
    await text().fill("Borrador ficticio protegido");
    const location = page.url();
    await page.getByRole("link", { name: "Otra ficha ficticia" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    ok(page.url() === location, "cambio de ficha espera decisión sin navegar");
    await dialog
      .getByRole("button", { name: "Seguir editando" })
      .press("Enter");
    ok(
      (await text().inputValue()) === "Borrador ficticio protegido",
      "seguir editando conserva texto",
    );
    await page.getByRole("button", { name: "Filtrar sesiones" }).click();
    await dialog.waitFor();
    ok(page.url() === location, "filtro de sesiones protege borrador");
    await page.keyboard.press("Escape");
    ok(
      (await text().inputValue()) === "Borrador ficticio protegido",
      "Escape cierra diálogo sin perder cambios",
    );
    ok(
      await fixture(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      "beforeunload protege cambios pendientes",
    );

    await reset();
    await page.getByRole("button", { name: "Escuchar pajarito" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /Así suena|No pudimos/ })
      .waitFor();
    ok(
      await fixture(() => window.notesAudioStarts === 1),
      "canto real local comienza al activar el botón",
    );
    const cta = page.getByRole("link", { name: "Abrir notas de esta sesión" });
    ok(
      (await cta.getAttribute("href")) ===
        "/pro/pacientes/fixture-patient?notaSesion=fixture-session#notas",
      "CTA identifica encuentro y ficha exactos",
    );
    await cta.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/notaSesion=fixture-session#notas/);
    ok(
      new URL(page.url()).pathname === "/pro/pacientes/fixture-patient",
      "CTA funciona con teclado",
    );
    ok(
      await fixture(
        () => localStorage.length === 0 && sessionStorage.length === 0,
      ),
      "sin borradores en almacenamiento web",
    );
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      ok(
        await fixture(() => document.documentElement.scrollWidth <= innerWidth),
        `sin desbordamiento horizontal a ${width}px`,
      );
    }
    return {
      passed: checks.length,
      checks,
      scope:
        "ReactDOM/componentes reales; acciones simuladas; CAS SQL probado por separado",
    };
  } catch (error) {
    throw new Error(
      `${error.message}; comprobaciones completadas: ${checks.join(", ")}`,
    );
  }
}

const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(join(root, "output/playwright"), { recursive: true, mode: 0o700 });
const preview = spawn(
  process.execPath,
  [join(root, "test/session-notes-preview.mjs")],
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
const session = `nido-notes-${crypto.randomUUID()}`;
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
      error.stdout || error.stderr || "La comprobación de navegador no terminó",
    );
  }
  assert.ok(!stdout.includes("### Error"), stdout);
  return stdout;
}
try {
  await command("open", url);
  await command("snapshot");
  const result = await command("run-code", browserChecks.toString());
  await writeFile(
    join(root, "output/playwright/notes-browser-proof.txt"),
    result,
    { mode: 0o600 },
  );
  console.log(result.split("### Ran Playwright code")[0].trim());
  await command("resize", "320", "900");
  await command("screenshot", "--filename=output/playwright/notes-mobile.png");
} finally {
  await command("close").catch(() => {});
  preview.kill("SIGTERM");
}
