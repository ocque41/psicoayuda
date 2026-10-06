// React real + WebStorage/BroadcastChannel reales; servidor ficticio loopback.
// No comprueba autenticación/BD de producción: verifica el retiro del DOM y
// la conservación de borradores del mismo dueño dentro de este documento.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vitest/package.json"))(
  "esbuild",
);
const modulePath = process.env.NIDO_PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(modulePath).href : "playwright"
);
const directory = await mkdtemp(path.join(tmpdir(), "nido-account-boundary-"));
let browser, server;
let currentSession;
let unavailable = false;
let checks = 0;

function session(
  userId = "fictional-owner-a",
  expiresAt = Date.now() + 60_000,
) {
  return { userId, expiresAt };
}

try {
  await build({
    entryPoints: ["src/tests/fixtures/account-session-boundary-browser.tsx"],
    bundle: true,
    outfile: path.join(directory, "fixture.js"),
    platform: "browser",
    jsx: "automatic",
    plugins: [
      {
        name: "fictional-server-actions",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(@\/app\/pro\/pacientes\/\[patientId\]\/profile-actions|next\/navigation)$/,
            },
            ({ path }) => ({ path, namespace: "fixture-action" }),
          );
          build.onLoad(
            { filter: /.*/, namespace: "fixture-action" },
            (args) => ({
              contents:
                args.path === "next/navigation"
                  ? "export function useRouter(){return {refresh(){}}}"
                  : 'export async function savePatientProfile(){return {ok:false,message:"Fixture sin escritura"}}',
              loader: "js",
            }),
          );
        },
      },
    ],
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "silent",
  });
  server = createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    if (request.url === "/api/patient/session") {
      response.setHeader("content-type", "application/json");
      response.statusCode = unavailable ? 503 : 200;
      response.end(
        JSON.stringify(unavailable ? { error: "Fixture" } : currentSession),
      );
    } else if (
      request.url === "/fixture.js" ||
      request.url === "/fixture.css"
    ) {
      response.setHeader(
        "content-type",
        request.url.endsWith(".js") ? "text/javascript" : "text/css",
      );
      response.end(await readFile(path.join(directory, request.url.slice(1))));
    } else {
      response.setHeader("content-type", "text/html");
      response.end(
        '<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    channel: process.env.NIDO_BROWSER_CHANNEL,
  });

  async function authorized(page) {
    await page.waitForFunction(
      () =>
        document.querySelector("[data-patient-session-state]")?.dataset
          .patientSessionState === "authorized",
    );
  }

  async function retired(page) {
    await page.waitForFunction(
      () =>
        document.querySelector("[data-patient-session-state]")?.dataset
          .patientSessionState === "revoked",
    );
    assert.equal(await page.locator("[data-private-workspace]").count(), 0);
    assert.equal(await page.locator("textarea").count(), 0);
    assert.equal(await page.locator("[data-private-inbox]").count(), 0);
    assert.equal(await page.locator("[data-private-calendar]").count(), 0);
    const link = page.getByRole("link", { name: "Volver a abrir mi consulta" });
    assert.equal(await link.getAttribute("href"), "/pro/consulta");
    assert.equal(
      await page.evaluate(() =>
        document.body.textContent.includes("Motivo de consulta ficticio"),
      ),
      false,
    );
  }

  async function secondTab(context) {
    const other = await context.newPage();
    await other.goto(url);
    await other.waitForFunction(() => Boolean(window.accountFixture));
    return other;
  }

  async function scenario(name, run) {
    currentSession = session();
    unavailable = false;
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(url);
      await authorized(page);
      await page.locator("summary").click();
      await run(page, context);
      assert.deepEqual(errors, []);
      checks++;
      console.log(`PASS ${name}`);
    } finally {
      await context.close();
    }
  }

  await scenario(
    "login confirmado del mismo dueño conserva nota y ficha RAM",
    async (page, context) => {
      const note = page.getByLabel("Nota de sesión ficticia", { exact: true });
      const profile = page.locator("textarea[name=generalNote]");
      await note.fill("Borrador de sesión ficticio sin guardar");
      await profile.fill("Borrador de ficha ficticio sin guardar");
      const other = await secondTab(context);
      const signals = await page.evaluate(() => window.accountFixture.signals);
      await other.evaluate(() => window.accountFixture.announce());
      await page.waitForFunction(
        (before) => window.accountFixture.signals > before,
        signals,
      );
      await authorized(page);
      assert.equal(
        await note.inputValue(),
        "Borrador de sesión ficticio sin guardar",
      );
      assert.equal(
        await profile.inputValue(),
        "Borrador de ficha ficticio sin guardar",
      );
      assert.equal(await page.locator("[data-private-inbox]").count(), 1);
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute("name")),
        "generalNote",
      );
      const storage = await page.evaluate(() =>
        JSON.stringify([
          Object.entries(localStorage),
          Object.entries(sessionStorage),
        ]),
      );
      assert.equal(storage.includes("Borrador de"), false);
      assert.equal(storage.includes("Motivo de consulta ficticio"), false);
    },
  );

  await scenario(
    "fallo temporal oculta CRM y conserva borrador al reintentar como A",
    async (page, context) => {
      const note = page.getByLabel("Nota de sesión ficticia", { exact: true });
      await note.fill("Nota ficticia durante desconexión");
      const other = await secondTab(context);
      unavailable = true;
      await other.evaluate(() => window.accountFixture.announce());
      await page
        .getByRole("heading", { name: "No pudimos comprobar tu sesión" })
        .waitFor();
      assert.equal(
        await page.locator("[data-private-workspace]").isVisible(),
        false,
      );
      unavailable = false;
      await page
        .getByRole("button", { name: "Reintentar", exact: true })
        .click();
      await authorized(page);
      assert.equal(
        await note.inputValue(),
        "Nota ficticia durante desconexión",
      );
    },
  );

  await scenario(
    "login B en otra pestaña retira perfil, notas, agenda y bandeja A",
    async (page, context) => {
      await page
        .getByLabel("Nota de sesión ficticia", { exact: true })
        .fill("Borrador privado ficticio A");
      const other = await secondTab(context);
      currentSession = session("fictional-owner-b");
      await other.evaluate(() => window.accountFixture.announce());
      await retired(page);
      currentSession = session("fictional-owner-a");
      await other.evaluate(() => window.accountFixture.announce());
      await page.waitForTimeout(100);
      await retired(page);
    },
  );

  await scenario(
    "logout confirmado desde otra pestaña no restaura el CRM anterior",
    async (page, context) => {
      const other = await secondTab(context);
      currentSession = null;
      await other.evaluate(() => window.accountFixture.logout());
      await retired(page);
      currentSession = session();
      await other.evaluate(() => window.accountFixture.announce());
      await page.waitForTimeout(100);
      await retired(page);
    },
  );

  await scenario(
    "caducidad retira todo el DOM privado sin un evento de logout",
    async (page, context) => {
      const other = await secondTab(context);
      currentSession = session("fictional-owner-a", Date.now() + 500);
      await other.evaluate(() => window.accountFixture.announce());
      await retired(page);
    },
  );

  await scenario(
    "una respuesta antigua no rehabilita la ficha tras cuenta B",
    async (page, context) => {
      let release;
      let held = false;
      await page.route("**/api/patient/session", async (route) => {
        if (!held) {
          held = true;
          await new Promise((resolve) => {
            release = resolve;
          });
          await route
            .fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(session()),
            })
            .catch(() => {});
        } else await route.continue();
      });
      const other = await secondTab(context);
      await other.evaluate(() => window.accountFixture.announce());
      await page.waitForFunction(
        () =>
          document.querySelector("[data-patient-session-state]")?.dataset
            .patientSessionState === "checking",
      );
      assert.equal(
        await page.locator("[data-private-workspace]").isVisible(),
        false,
      );
      currentSession = session("fictional-owner-b");
      await other.evaluate(() => window.accountFixture.announce());
      await retired(page);
      release?.();
      await page.waitForTimeout(150);
      await retired(page);
    },
  );
  console.log(
    `${checks} escenarios del CRM aprobados en React/Chromium local.`,
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
