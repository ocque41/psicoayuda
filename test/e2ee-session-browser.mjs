// QA focal reproducible: componentes React reales, Chromium nuevo, transportes
// ficticios explícitos. WebCrypto/IndexedDB reales; no Next build ni producción.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const dependency = createRequire(require.resolve("vitest/package.json"));
const { build } = dependency("esbuild");
const modulePath = process.env.NIDO_PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(modulePath).href : "playwright"
);
const reproduce = process.env.NIDO_REPRO_COMPOSER === "1";
const directory = await mkdtemp(path.resolve(".e2ee-session-test-"));
let browser, server;
let checks = 0;
try {
  await build({
    entryPoints: ["test/fixtures/e2ee-session/main.tsx"],
    bundle: true,
    outfile: path.join(directory, "fixture.js"),
    platform: "browser",
    jsx: "automatic",
    alias: {
      "@/app/actions-e2ee": path.resolve(
        "test/fixtures/e2ee-session/actions.ts",
      ),
      "@": path.resolve("src"),
      "next/navigation": path.resolve(
        "test/fixtures/e2ee-session/navigation.ts",
      ),
      "next/link": path.resolve("test/fixtures/e2ee-session/link.tsx"),
      "@/app/c/[conversationId]/actions": path.resolve(
        "test/fixtures/e2ee-session/chat-actions.ts",
      ),
    },
    plugins: [
      {
        name: "fictional-chat-actions",
        setup(build) {
          if (reproduce)
            build.onLoad({ filter: /chat-room\.tsx$/ }, () => ({
              contents: execFileSync(
                "git",
                ["show", "9e9c7fe:src/app/c/[conversationId]/chat-room.tsx"],
                { encoding: "utf8" },
              ),
              loader: "tsx",
              resolveDir: path.resolve("src/app/c/[conversationId]"),
            }));
          build.onResolve({ filter: /^\.\/actions$/ }, (args) =>
            args.importer.includes("/c/[conversationId]/")
              ? {
                  path: path.resolve(
                    "test/fixtures/e2ee-session/chat-actions.ts",
                  ),
                }
              : undefined,
          );
        },
      },
    ],
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "silent",
  });
  server = createServer(async (request, response) => {
    if (request.url === "/fixture.js" || request.url === "/fixture.css") {
      response.setHeader(
        "Content-Type",
        request.url.endsWith(".js") ? "text/javascript" : "text/css",
      );
      response.end(await readFile(path.join(directory, request.url.slice(1))));
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        request.url === "/blank"
          ? "<!doctype html><title>Fixture señal</title>"
          : '<!doctype html><html lang="es"><head><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.NIDO_BROWSER_CHANNEL,
  });
  async function scenario(name, run) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.evaluate(() => window.ready);
    await page
      .getByRole("button", { name: "Ver mi código de recuperación" })
      .waitFor();
    try {
      await run(page, context);
    } catch (error) {
      console.error(
        "Fixture counts",
        await page.evaluate(() => ({
          encryptCalls: window.fixture.encryptCalls,
          pending: window.fixture.encryptionPending,
          frameTypes: window.fixture.frames.map((frame) => frame.type),
        })),
        errors,
      );
      throw error;
    }
    assert.deepEqual(errors, []);
    await context.close();
    checks += 1;
    console.log(`PASS ${name}`);
  }
  async function open(page) {
    await page
      .getByRole("button", { name: "Ver mi código de recuperación" })
      .click();
    await page.getByRole("dialog").waitFor();
  }
  async function closed(page) {
    await page.waitForFunction(
      () =>
        !document.querySelector("dialog[open]") &&
        !document.body.textContent.includes("FICTIONALRECOVERYCODE"),
    );
    assert.equal(
      await page.getByRole("button", { name: "Copiar", exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Descargar", exact: true })
        .count(),
      0,
    );
  }
  await scenario(
    "logout rechazado conserva modal autorizado y su código",
    async (page) => {
      await open(page);
      const before = await page.locator("dialog code").textContent();
      await page.evaluate(() => window.fixture.rejectLogout());
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.equal(await page.locator("dialog code").textContent(), before);
    },
  );
  await scenario(
    "logout cross-tab con modal abierto conserva claves/código/respaldo",
    async (page, context) => {
      await open(page);
      const before = await page.evaluate(() => window.fixture.snapshotBackup());
      const other = await context.newPage();
      await other.goto(`${url}/blank`);
      await other.evaluate(() =>
        localStorage.setItem(
          "nido:chat-session-ended:v1",
          "fixture-confirmed-logout",
        ),
      );
      await closed(page);
      assert.equal(
        await page.evaluate(() => window.fixture.snapshotBackup()),
        before,
      );
    },
  );
  await scenario(
    "switch confirmado bloquea tarjeta y código de A; B reautoriza",
    async (page) => {
      await open(page);
      await page.evaluate(() => {
        window.fixture.actor = "fictional-pro-b";
        window.dispatchEvent(new Event("nido:session-changed"));
      });
      await closed(page);
      await page.evaluate(() =>
        window.fixture.mount("card", "fictional-pro-b"),
      );
      await page
        .getByRole("button", { name: "Ver mi código de recuperación" })
        .waitFor();
      await open(page);
      await page.getByRole("dialog").waitFor();
    },
  );
  await scenario(
    "actor fresco deniega descarga sin evento al caducar sesión",
    async (page) => {
      await open(page);
      await page.evaluate(() => {
        window.fixture.expiresAt = Date.now() - 1;
      });
      await page
        .getByRole("button", { name: "Descargar", exact: true })
        .click();
      await closed(page);
      assert.equal(await page.evaluate(() => window.fixture.downloads), 0);
    },
  );
  await scenario(
    "modal cierra por tiempo de expiración sin evento de logout",
    async (page) => {
      await page.evaluate(async () => {
        window.fixture.expiresAt = Date.now() + 600;
        await window.fixture.mount("modal");
      });
      await page.getByRole("dialog").waitFor();
      await closed(page);
    },
  );
  await scenario(
    "respuesta de respaldo tardía no vuelve a mostrar código",
    async (page) => {
      await page.evaluate(() => {
        window.fixture.holdSave = true;
      });
      await page
        .getByRole("button", { name: "Ver mi código de recuperación" })
        .click();
      await page.waitForFunction(() => window.fixture.savePending);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("nido:chat-session-ended"));
        window.fixture.releaseSave();
      });
      await closed(page);
      await page
        .getByText("La sesión cambió o caducó.", { exact: false })
        .waitFor();
      assert.equal(await page.locator("code").count(), 0);
    },
  );
  await scenario(
    "autorización tardía de Copiar no escribe clipboard después de switch",
    async (page) => {
      await open(page);
      await page.evaluate(() => {
        window.fixture.holdAuth = true;
      });
      await page.getByRole("button", { name: "Copiar", exact: true }).click();
      await page.waitForFunction(() => window.fixture.authPending);
      await page.evaluate(() => {
        window.fixture.actor = "fictional-pro-b";
        window.dispatchEvent(new Event("nido:session-changed"));
        window.fixture.releaseAuth();
      });
      await closed(page);
      assert.deepEqual(await page.evaluate(() => window.fixture.copied), []);
    },
  );
  await scenario(
    "restauración tardía retira código introducido y conserva IndexedDB",
    async (page) => {
      await page.evaluate(() => window.fixture.mount("restore"));
      await page
        .getByLabel("Código de recuperación", { exact: true })
        .fill(await page.evaluate(() => window.fixture.restoreCode));
      const before = await page.evaluate(() => window.fixture.keys());
      await page.evaluate(() => {
        window.fixture.holdLoad = true;
      });
      await page.getByRole("button", { name: "Restaurar mensajes" }).click();
      await page.waitForFunction(() => window.fixture.loadPending);
      await page.evaluate(() => {
        window.dispatchEvent(new Event("nido:session-changed"));
        window.fixture.releaseLoad();
      });
      await page
        .getByText("La sesión cambió o caducó.", { exact: false })
        .waitFor();
      assert.equal(
        await page
          .getByLabel("Código de recuperación", { exact: true })
          .count(),
        0,
      );
      assert.equal(await page.evaluate(() => window.fixture.keys()), before);
      assert.equal(
        await page.evaluate(() =>
          Boolean(window.fixture.restored || window.fixture.rotated),
        ),
        false,
      );
    },
  );
  await scenario(
    reproduce
      ? "REPRO: cifrado diferido borra edición nueva"
      : "compositor conserva edición durante cifrado",
    async (page) => {
      await page.evaluate(() => window.fixture.mountComposer());
      const input = page.getByRole("textbox", {
        name: "Escribe un mensaje",
        exact: true,
      });
      await input.waitFor();
      await input.fill("Primer mensaje ficticio");
      await page.evaluate(() => {
        window.fixture.holdEncryption = true;
      });
      await input.press("Enter");
      await page.waitForFunction(
        () => window.fixture.encryptionPending === 1,
        null,
        { timeout: 3000 },
      );
      await input.fill("Continuación ficticia nueva");
      await page.evaluate(() => window.fixture.resumeEncryption());
      await page.waitForFunction(
        () =>
          window.fixture.frames.filter((frame) => frame.type === "send")
            .length === 1,
      );
      assert.deepEqual(await page.evaluate(() => window.fixture.sentTexts()), [
        "Primer mensaje ficticio",
      ]);
      // Esperar al commit del compositor, no sólo al envío del transporte.
      await page.waitForTimeout(100);
      assert.equal(
        await input.inputValue(),
        reproduce ? "" : "Continuación ficticia nueva",
      );
    },
  );
  await scenario(
    reproduce
      ? "REPRO: dobleEnter crea dos envíos"
      : "dobleEnter sólo cifra y envía una vez",
    async (page) => {
      await page.evaluate(() => window.fixture.mountComposer());
      const input = page.getByRole("textbox", {
        name: "Escribe un mensaje",
        exact: true,
      });
      await input.waitFor();
      await input.fill("Mensaje ficticio único");
      await page.evaluate(() => {
        window.fixture.holdEncryption = true;
      });
      await input.press("Enter");
      await page.waitForFunction(
        () => window.fixture.encryptionPending === 1,
        null,
        { timeout: 3000 },
      );
      await input.press("Enter");
      if (!reproduce) {
        const button = page.getByRole("button", {
          name: "Enviar",
          exact: true,
        });
        assert.equal(await button.isDisabled(), true);
        assert.equal(await button.getAttribute("aria-busy"), "true");
        assert.equal(await input.isEditable(), true);
      }
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(() => window.fixture.encryptionPending),
        reproduce ? 2 : 1,
      );
      await page.evaluate(() => window.fixture.resumeEncryption());
      await page.waitForFunction(
        (expected) =>
          window.fixture.frames.filter((frame) => frame.type === "send")
            .length === expected,
        reproduce ? 2 : 1,
      );
    },
  );
  if (!reproduce) {
    async function composer(page, role = "seeker") {
      await page.evaluate((role) => window.fixture.mountComposer(role), role);
      const input = page.getByRole("textbox", {
        name: "Escribe un mensaje",
        exact: true,
      });
      await input.waitFor();
      await page.waitForFunction(
        () => !document.querySelector("textarea")?.disabled,
      );
      return input;
    }
    async function holdAndSubmit(page, input) {
      await page.evaluate(() => {
        window.fixture.holdEncryption = true;
      });
      await input.press("Enter");
      await page.waitForFunction(() => window.fixture.encryptionPending === 1);
    }
    async function finish(page, count = 1) {
      await page.evaluate(() => window.fixture.resumeEncryption());
      await page.waitForFunction(
        (count) =>
          window.fixture.frames.filter((frame) => frame.type === "send")
            .length === count,
        count,
      );
      await page.waitForFunction(() =>
        document.querySelector('button[aria-busy="false"]'),
      );
    }
    await scenario(
      "envío intacto limpia texto y borrador cifrado",
      async (page) => {
        const input = await composer(page);
        await input.fill("  Mensaje ficticio con espacios  ");
        await holdAndSubmit(page, input);
        await finish(page);
        assert.equal(await input.inputValue(), "");
        assert.deepEqual(
          await page.evaluate(() => window.fixture.sentTexts()),
          ["Mensaje ficticio con espacios"],
        );
        assert.equal(
          await page.evaluate(() => window.fixture.readDraft()),
          null,
        );
      },
    );
    await scenario(
      "editar y volver al mismo texto conserva revisión nueva",
      async (page) => {
        const input = await composer(page);
        await input.fill("Texto ficticio inicial");
        await holdAndSubmit(page, input);
        await input.fill("Otra edición ficticia");
        await input.fill("Texto ficticio inicial");
        await finish(page);
        assert.equal(await input.inputValue(), "Texto ficticio inicial");
        await page.waitForFunction(
          async () =>
            (await window.fixture.readDraft()) === "Texto ficticio inicial",
        );
      },
    );
    await scenario(
      "error de cifrado conserva edición y permite reintento único",
      async (page) => {
        const input = await composer(page);
        await input.fill("Mensaje previo ficticio");
        await holdAndSubmit(page, input);
        await input.fill("Nueva edición ficticia tras fallo");
        await page.evaluate(() => {
          window.fixture.failEncryption = true;
          window.fixture.resumeEncryption();
        });
        await page
          .getByText("No pudimos cifrar el mensaje en este dispositivo.")
          .waitFor();
        assert.equal(
          await input.inputValue(),
          "Nueva edición ficticia tras fallo",
        );
        assert.equal(
          await page.evaluate(
            () =>
              window.fixture.frames.filter((frame) => frame.type === "send")
                .length,
          ),
          0,
        );
        await page.waitForFunction(
          async () =>
            (await window.fixture.readDraft()) ===
            "Nueva edición ficticia tras fallo",
        );
        await page.evaluate(() => {
          window.fixture.failEncryption = false;
        });
        await input.press("Enter");
        await page.waitForFunction(
          () =>
            window.fixture.frames.filter((frame) => frame.type === "send")
              .length === 1,
        );
        assert.deepEqual(
          await page.evaluate(() => window.fixture.sentTexts()),
          ["Nueva edición ficticia tras fallo"],
        );
        await page.waitForFunction(
          () => document.querySelector("textarea")?.value === "",
        );
      },
    );
    await scenario(
      "logout durante cifrado descarta envío y conserva ciphertext",
      async (page) => {
        const input = await composer(page);
        await input.fill("Borrador privado ficticio");
        await page.waitForFunction(
          async () =>
            (await window.fixture.readDraft()) === "Borrador privado ficticio",
        );
        const stored = await page.evaluate(() =>
          JSON.stringify(Object.entries(localStorage)),
        );
        const keys = await page.evaluate(() => window.fixture.keys());
        await holdAndSubmit(page, input);
        await page.evaluate(() => {
          window.dispatchEvent(new Event("nido:chat-session-ended"));
        });
        await page.waitForFunction(() => !document.querySelector("textarea"));
        await page.evaluate(() => window.fixture.resumeEncryption());
        await page.waitForTimeout(150);
        assert.equal(
          await page.evaluate(
            () =>
              window.fixture.frames.filter((frame) => frame.type === "send")
                .length,
          ),
          0,
        );
        assert.equal(await input.count(), 0);
        assert.equal(
          await page.evaluate(() =>
            JSON.stringify(Object.entries(localStorage)),
          ),
          stored,
        );
        assert.equal(await page.evaluate(() => window.fixture.keys()), keys);
      },
    );
    await scenario(
      "insertar enlace durante cifrado conserva y envía edición siguiente",
      async (page) => {
        const input = await composer(page, "professional");
        await input.fill("Acuerdo ficticio");
        await holdAndSubmit(page, input);
        await page.getByText("Insertar link de pago", { exact: true }).click();
        await page
          .getByRole("button", { name: "Paquete ficticio · Importe ficticio" })
          .click();
        const next = await input.inputValue();
        assert.equal(
          next,
          `Acuerdo ficticio\n${url}/pagar/fictional-package?c=fictional-composer`,
        );
        await finish(page);
        assert.equal(await input.inputValue(), next);
        await page.waitForFunction(
          async (next) => (await window.fixture.readDraft()) === next,
          next,
        );
        assert.deepEqual(
          await page.evaluate(() => window.fixture.sentTexts()),
          ["Acuerdo ficticio"],
        );
        await input.press("Enter");
        await page.waitForFunction(
          () =>
            window.fixture.frames.filter((frame) => frame.type === "send")
              .length === 2,
        );
        assert.deepEqual(
          await page.evaluate(() => window.fixture.sentTexts()),
          ["Acuerdo ficticio", next],
        );
      },
    );
  }
  console.log(`${checks} escenarios E2EE React/Chromium aprobados.`);
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
