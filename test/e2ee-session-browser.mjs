// QA focal reproducible: componentes React reales, Chromium nuevo, transportes
// ficticios explícitos. WebCrypto/IndexedDB reales; no Next build ni producción.
import assert from "node:assert/strict";
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
    },
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
    await run(page, context);
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
  console.log(`${checks} escenarios E2EE React/Chromium aprobados.`);
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
