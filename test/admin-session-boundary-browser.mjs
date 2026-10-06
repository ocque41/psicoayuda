// React, diálogos nativos y señales entre pestañas reales. Sólo servidor local
// ficticio; no accede a cuentas, D1, credenciales ni proveedores de producción.
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
const directory = await mkdtemp(path.join(tmpdir(), "nido-admin-boundary-"));
let browser, server;
let currentSession;
let unavailable = false;
let checks = 0;

function session(
  userId = "fictional-admin-a",
  expiresAt = Date.now() + 60_000,
) {
  return { userId, expiresAt };
}

try {
  await build({
    entryPoints: ["src/tests/fixtures/admin-session-boundary-browser.tsx"],
    bundle: true,
    outfile: path.join(directory, "fixture.js"),
    platform: "browser",
    jsx: "automatic",
    plugins: [
      {
        name: "fictional-note-actions",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^@\/app\/pro\/pacientes\/\[patientId\]\/note-(?:draft-)?actions$/,
            },
            ({ path }) => ({ path, namespace: "fixture-note-action" }),
          );
          build.onLoad(
            { filter: /.*/, namespace: "fixture-note-action" },
            ({ path }) => ({
              contents: path.endsWith("note-draft-actions")
                ? "export async function authorizeNoteDraft(){return {accountCurrent:true,scopeAllowed:true}}"
                : "export async function savePatientNote(){throw new Error('Fixture sin escritura')} export async function deletePatientNote(){throw new Error('Fixture sin escritura')}",
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

  async function state(page, expected) {
    await page.waitForFunction(
      (value) =>
        document.querySelector("[data-patient-session-state]")?.dataset
          .patientSessionState === value,
      expected,
    );
  }
  async function retired(page) {
    await state(page, "revoked");
    for (const selector of [
      "[data-private-administration]",
      "[data-private-credentials]",
      "[data-private-waitlist]",
      "dialog",
      "textarea",
      "select",
    ])
      assert.equal(await page.locator(selector).count(), 0);
    const audience = new URL(page.url()).searchParams.get("audience");
    const link = page.getByRole("link", {
      name:
        audience === "professional"
          ? "Volver a abrir mi consulta"
          : audience === "patient"
            ? "Volver a abrir mi espacio"
            : "Volver a abrir administración",
    });
    assert.equal(
      await link.getAttribute("href"),
      audience === "professional"
        ? "/pro/consulta"
        : audience === "patient"
          ? "/mi"
          : "/admin",
    );
    assert.equal(
      await page.evaluate(() =>
        /example\.invalid|Identidad ficticia|Credencial ficticia/.test(
          document.body.textContent,
        ),
      ),
      false,
    );
  }
  async function secondTab(context) {
    const other = await context.newPage();
    await other.goto(url);
    await other.waitForFunction(() => Boolean(window.adminFixture));
    return other;
  }
  async function open(page, kind) {
    await page
      .getByRole("button", {
        name:
          kind === "admission"
            ? "Revisar credencial ficticia"
            : kind === "waitlist"
              ? "Abrir lista de espera ficticia"
              : "Borrar cuenta",
        exact: true,
      })
      .click();
    await page.locator("dialog[open]").waitFor();
    if (kind === "admission")
      await page
        .getByLabel("Nota de admisión ficticia", { exact: true })
        .fill("Borrador privado ficticio A");
    else if (kind === "waitlist")
      await page
        .getByLabel("Seguimiento ficticio", { exact: true })
        .selectOption("contacted");
    else await draftField(page, kind).fill("ELIMINAR");
    await draftField(page, kind).focus();
  }
  function draftField(page, kind) {
    return kind === "admission"
      ? page.getByLabel("Nota de admisión ficticia")
      : kind === "waitlist"
        ? page.getByLabel("Seguimiento ficticio")
        : page.locator("dialog input:not([type=hidden])");
  }
  function draftValue(kind) {
    return kind === "admission"
      ? "Borrador privado ficticio A"
      : kind === "waitlist"
        ? "contacted"
        : "ELIMINAR";
  }
  async function scenario(name, kind, run, audience = "administration") {
    currentSession = session();
    unavailable = false;
    const context = await browser.newContext({
      viewport: { width: 320, height: 700 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${url}?audience=${audience}`);
      await state(page, "authorized");
      if (kind === "note") {
        await page
          .getByLabel("Tu nota privada", { exact: true })
          .fill("Nota ficticia privada sin guardar A");
        await page
          .getByRole("link", { name: "Otra ficha ficticia", exact: true })
          .click();
        await page.locator(".leave-note-dialog:modal").waitFor();
      } else await open(page, kind);
      await run(page, context);
      assert.deepEqual(errors, []);
      checks++;
      console.log(`PASS ${name}`);
    } finally {
      await context.close();
    }
  }

  for (const kind of ["admission", "waitlist", "delete"]) {
    await scenario(
      `A→A conserva diálogo y cambios de ${kind}`,
      kind,
      async (page, context) => {
        const other = await secondTab(context);
        const signals = await page.evaluate(() => window.adminFixture.signals);
        const closes = await page.evaluate(() => window.adminFixture.closes);
        await other.evaluate(() => window.adminFixture.announce());
        await page.waitForFunction(
          (before) => window.adminFixture.signals > before,
          signals,
        );
        await state(page, "authorized");
        await page.waitForFunction(
          (before) => window.adminFixture.closes >= before + 2,
          closes,
        );
        assert.equal(await page.locator("dialog[open]").isVisible(), true);
        assert.equal(
          await draftField(page, kind).inputValue(),
          draftValue(kind),
        );
        assert.equal(
          await draftField(page, kind).evaluate(
            (field) => field === document.activeElement,
          ),
          true,
        );
        const storage = await page.evaluate(() =>
          JSON.stringify([
            Object.entries(localStorage),
            Object.entries(sessionStorage),
          ]),
        );
        assert.equal(
          /Borrador privado|example\.invalid|Credencial|fictional-admin/.test(
            storage,
          ),
          false,
        );
      },
    );

    await scenario(
      `fallo de conexión y reintento conservan el diálogo de ${kind}`,
      kind,
      async (page, context) => {
        const other = await secondTab(context);
        unavailable = true;
        await other.evaluate(() => window.adminFixture.announce());
        await state(page, "unavailable");
        assert.equal(
          await page.locator("[data-private-administration]").isVisible(),
          false,
        );
        assert.equal(await page.locator("dialog:modal").count(), 0);
        unavailable = false;
        await page
          .getByRole("button", { name: "Reintentar", exact: true })
          .click();
        await state(page, "authorized");
        assert.equal(
          await draftField(page, kind).inputValue(),
          draftValue(kind),
        );
        if (kind === "delete") {
          await page
            .getByRole("button", { name: "Cancelar", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Borrar cuenta", exact: true })
            .click();
          assert.equal(await draftField(page, kind).inputValue(), "");
        }
      },
    );

    await scenario(
      `A→B retira datos y diálogo privado de ${kind}`,
      kind,
      async (page, context) => {
        const other = await secondTab(context);
        let release;
        let intercepted = false;
        await page.route("**/api/patient/session", async (route) => {
          if (!intercepted) {
            intercepted = true;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          await route.continue().catch(() => {});
        });
        currentSession = session("fictional-other-b");
        await other.evaluate(() => window.adminFixture.announce());
        await state(page, "checking");
        assert.equal(
          await page.locator("[data-private-administration]").isVisible(),
          false,
        );
        assert.equal(await page.locator("dialog[open]").isVisible(), false);
        release?.();
        await retired(page);
        currentSession = session();
        await other.evaluate(() => window.adminFixture.announce());
        await retired(page);
      },
    );

    await scenario(
      `logout remoto retira el diálogo de ${kind}`,
      kind,
      async (page, context) => {
        const other = await secondTab(context);
        currentSession = null;
        await other.evaluate(() => window.adminFixture.logout());
        await retired(page);
        currentSession = session();
        await other.evaluate(() => window.adminFixture.announce());
        await retired(page);
      },
    );

    await scenario(
      `caducidad retira el diálogo de ${kind}`,
      kind,
      async (page, context) => {
        const other = await secondTab(context);
        currentSession = session("fictional-admin-a", Date.now() + 500);
        await other.evaluate(() => window.adminFixture.announce());
        await retired(page);
      },
    );
  }

  await scenario(
    "cierre explícito durante checking no se restaura ni consume su onClose",
    "delete",
    async (page, context) => {
      const other = await secondTab(context);
      const closes = await page.evaluate(() => window.adminFixture.closes);
      let release;
      let held = false;
      await page.route("**/api/patient/session", async (route) => {
        if (!held) {
          held = true;
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        await route.continue().catch(() => {});
      });
      await other.evaluate(() => window.adminFixture.announce());
      await state(page, "checking");
      await page.locator(".org-dialog").evaluate((dialog) => dialog.close());
      await page.waitForFunction(
        (before) => window.adminFixture.closes >= before + 2,
        closes,
      );
      assert.equal(await draftField(page, "delete").inputValue(), "");
      release?.();
      await state(page, "authorized");
      assert.equal(await page.locator(".org-dialog[open]").count(), 0);
      await page
        .getByRole("button", { name: "Borrar cuenta", exact: true })
        .click();
      assert.equal(await draftField(page, "delete").inputValue(), "");
      await draftField(page, "delete").fill("ELIMINAR");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !document.querySelector(".org-dialog")?.open,
      );
      await page.waitForFunction(
        () =>
          document.querySelector(".org-dialog input:not([type=hidden])")
            ?.value === "",
      );
      assert.equal(await draftField(page, "delete").inputValue(), "");
    },
  );

  await scenario(
    "audiencia paciente libera capa modal y conserva texto al reintentar",
    "delete",
    async (page, context) => {
      const other = await secondTab(context);
      unavailable = true;
      await other.evaluate(() => window.adminFixture.announce());
      await state(page, "unavailable");
      assert.equal(await page.locator("dialog:modal").count(), 0);
      unavailable = false;
      await page
        .getByRole("button", { name: "Reintentar", exact: true })
        .click();
      await state(page, "authorized");
      assert.equal(await draftField(page, "delete").inputValue(), "ELIMINAR");
      currentSession = session("fictional-other-b");
      await other.evaluate(() => window.adminFixture.announce());
      await retired(page);
    },
    "patient",
  );

  await scenario(
    "nota profesional real: fallo de red permite reintentar sin navegación ni pérdida",
    "note",
    async (page) => {
      const originalUrl = page.url();
      unavailable = true;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await state(page, "unavailable");
      assert.equal(await page.locator("dialog:modal").count(), 0);
      unavailable = false;
      await page
        .getByRole("button", { name: "Reintentar", exact: true })
        .click();
      await state(page, "authorized");
      assert.equal(
        await page.locator(".leave-note-dialog:modal").isVisible(),
        true,
      );
      await page
        .getByRole("button", { name: "Seguir editando", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Tu nota privada", { exact: true }).inputValue(),
        "Nota ficticia privada sin guardar A",
      );
      assert.equal(page.url(), originalUrl);
    },
    "professional",
  );

  await scenario(
    "nota profesional real: cierre intencional por login no se restaura",
    "note",
    async (page, context) => {
      const other = await secondTab(context);
      const signals = await page.evaluate(() => window.adminFixture.signals);
      await other.evaluate(() => window.adminFixture.announce());
      await page.waitForFunction(
        (before) => window.adminFixture.signals > before,
        signals,
      );
      await state(page, "authorized");
      assert.equal(await page.locator(".leave-note-dialog:modal").count(), 0);
      await page
        .getByRole("button", { name: "Volver a comprobar acceso", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("Tu nota privada", { exact: true }).inputValue(),
        "Nota ficticia privada sin guardar A",
      );
    },
    "professional",
  );

  await scenario(
    "nota profesional real: cambio A→B retira la nota y el diálogo",
    "note",
    async (page, context) => {
      const other = await secondTab(context);
      currentSession = session("fictional-other-b");
      await other.evaluate(() => window.adminFixture.announce());
      await retired(page);
    },
    "professional",
  );

  await scenario(
    "respuesta A tardía no restaura el admin después de B",
    "waitlist",
    async (page, context) => {
      const other = await secondTab(context);
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
      await other.evaluate(() => window.adminFixture.announce());
      await state(page, "checking");
      currentSession = session("fictional-other-b");
      await other.evaluate(() => window.adminFixture.announce());
      await retired(page);
      release?.();
      await page.waitForTimeout(100);
      await retired(page);
    },
  );
  console.log(
    `${checks} escenarios administrativos aprobados en React/Chromium local.`,
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
