import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { accessSync, constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Prueba causal del runner real. El intermediario sólo comprueba/captura el
// destino y reenvía pnpm a Drizzle/Vitest reales; no simula sus resultados.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const originalPath = process.env.PATH || "";
const realPnpm = originalPath
  .split(delimiter)
  .map((directory) => join(directory, "pnpm"))
  .find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
assert.ok(realPnpm, "Falta pnpm instalado.");
const reportDirectory = process.argv[2] ? resolve(process.argv[2]) : null;
if (reportDirectory) {
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await chmod(reportDirectory, 0o700);
}
const directory = await mkdtemp(join(tmpdir(), "nido-isolation-proof-"));
const results = [];
const failureMessages = [];
const key = createECDH("prime256v1");
key.generateKeys();
// Placeholders inequívocos, generados en la fixture; nunca credenciales reales.
const fictionalCredential = (provider) => `fixture-${provider}-do-not-use`;
const syntheticProviderCredentials = Object.fromEntries([
  ["RESEND_API_KEY", fictionalCredential("resend")],
  ["STRIPE_SECRET_KEY", fictionalCredential("stripe")],
  ["STRIPE_WEBHOOK_SECRET", fictionalCredential("webhook")],
  ["DAILY_API_KEY", fictionalCredential("daily")],
  ["GITHUB_ISSUE_TOKEN", fictionalCredential("github")],
  ["GOOGLE_CLIENT_SECRET", fictionalCredential("google")],
  ["TURNSTILE_SECRET_KEY", fictionalCredential("turnstile")],
  ["NIDO_GOOGLE_CALENDAR_CLIENT_SECRET", fictionalCredential("calendar")],
  ["NIDO_PUSH_VAPID_PRIVATE_KEY", key.getPrivateKey().toString("base64url")],
]);
const dangerous = {
  ...syntheticProviderCredentials,
  NIDO_DB_TARGET: "cloudflare",
  NIDO_PRACTICE_ENABLED: "true",
  GOOGLE_CLIENT_ID: "fictional-google-client",
  TURNSTILE_SITE_KEY: "fictional-turnstile-site",
  NIDO_PUSH_ENABLED: "true",
  NIDO_PUSH_VAPID_PUBLIC_KEY: key.getPublicKey().toString("base64url"),
  NIDO_PUSH_VAPID_SUBJECT: "mailto:fixture@example.invalid",
  NIDO_GOOGLE_CALENDAR_ENABLED: "true",
  NIDO_GOOGLE_CALENDAR_CLIENT_ID: "fictional-calendar-client",
  NIDO_GOOGLE_CALENDAR_REDIRECT_URI:
    "https://fixture.example.invalid/api/calendar/google/callback",
  NIDO_CALENDAR_ENCRYPTION_KEY: "ab".repeat(32),
};
try {
  for (const mode of ["success", "test-error"]) {
    const caseDirectory = join(directory, mode);
    const scratch = join(caseDirectory, "tmp");
    const toolScratch = join(caseDirectory, "tool-cache");
    const sibling = join(scratch, "nido-tests-sibling");
    const bin = join(caseDirectory, "bin");
    const capture = join(caseDirectory, "calls.jsonl");
    const protectedFile = join(sibling, "keep.txt");
    for (const path of [sibling, bin, toolScratch])
      await mkdir(path, { recursive: true });
    await writeFile(
      protectedFile,
      "Datos ficticios ajenos al runner: conservar.\n",
    );
    const fixtureFile = join(caseDirectory, "probe.test.ts");
    const fixtureSource = `
import { expect, it, vi } from ${JSON.stringify(join(root, "node_modules/vitest/dist/index.js"))};
import { existsSync, writeFileSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { googleCalendarConfig } from "@/lib/calendar/config";
import { readVapidConfiguration } from "@/lib/push/web-push";
import { getTurnstileConfig, verifyTurnstileToken } from "@/lib/turnstile";
vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Red externa bloqueada por la fixture"); }));
it("BD temporal propia, nunca el destino heredado", () => {
  const url = process.env.DATABASE_URL || "";
  expect(url.startsWith(${JSON.stringify(`file:${scratch}/nido-tests-`)})).toBe(true);
  expect(existsSync(url.slice(5))).toBe(true);
  const folder = dirname(url.slice(5));
  writeFileSync(join(folder, "owned-marker"), "Sólo este directorio se debe retirar");
  symlinkSync(${JSON.stringify(sibling)}, join(folder, "outside-link"), "dir");
});
it("correo, pagos, llamadas e issues apagados", () => {
  for (const name of ["RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "DAILY_API_KEY", "GITHUB_ISSUE_TOKEN", "NIDO_DB_TARGET"])
    expect(process.env[name], name).toBe("");
  expect(process.env.NIDO_PRACTICE_ENABLED).toBe("false");
});
it("Google login sin credenciales heredadas", () => {
  expect(process.env.GOOGLE_CLIENT_ID || "").toBe("");
  expect(process.env.GOOGLE_CLIENT_SECRET || "").toBe("");
});
it("Turnstile apagado sin intento de red", async () => {
  expect(getTurnstileConfig().enabled).toBe(false);
  expect(await verifyTurnstileToken("fictional-token")).toEqual({ok:true,skipped:true});
  expect(fetch).not.toHaveBeenCalled();
});
it("Push apagado y sin claves VAPID heredadas", () => {
  expect(process.env.NIDO_PUSH_ENABLED).not.toBe("true");
  expect(readVapidConfiguration()).toBeNull();
});
it("Calendar no disponible con credenciales heredadas", () => {
  expect(googleCalendarConfig()).toBeNull();
});
it("fallo causal ficticio del test", () => {
  expect(${JSON.stringify(mode)} === "test-error", "FALLO_CAUSAL_FICTICIO").toBe(false);
});
`;
    await writeFile(fixtureFile, fixtureSource);
    const configFile = join(caseDirectory, "vitest.config.mjs");
    await writeFile(
      configFile,
      `export default ${JSON.stringify({
        root: caseDirectory,
        test: { include: [fixtureFile], fileParallelism: false },
        resolve: {
          alias: {
            "@": join(root, "src"),
            "server-only": join(root, "src/tests/stubs/server-only.ts"),
          },
        },
      })};\n`,
    );
    const shim = join(bin, "pnpm");
    await writeFile(
      shim,
      `#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const url = process.env.DATABASE_URL || "";
const prefix = "file:" + process.env.TMPDIR + "/nido-tests-";
assert.ok(url.startsWith(prefix), "Destino no temporal: no ejecutar herramientas");
const args = process.argv.slice(2);
assert.equal(args[1], "exec");
assert.ok(["drizzle-kit", "vitest"].includes(args[2]));
fs.appendFileSync(${JSON.stringify(capture)}, JSON.stringify({tool:args[2],databaseDirectory:path.dirname(url.slice(5)),providers:Object.fromEntries(${JSON.stringify(Object.keys(dangerous))}.map(name=>[name,Boolean(process.env[name] && process.env[name] !== "false")]))}) + "\\n");
// Separar las cachés de pnpm/tsx del directorio cuya limpieza se comprueba.
const result = spawnSync(${JSON.stringify(realPnpm)}, args, {cwd:${JSON.stringify(root)},env:{...process.env,PATH:${JSON.stringify(originalPath)},TMPDIR:${JSON.stringify(toolScratch)}},stdio:"inherit"});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`,
    );
    await chmod(shim, 0o700);
    const inheritedUrl =
      mode === "success"
        ? "libsql://fixture.example.invalid/never-contact"
        : `file:${protectedFile}`;
    const run = spawnSync(
      process.execPath,
      [join(root, "scripts/test-isolated.mjs"), "--config", configFile],
      {
        cwd: root,
        env: {
          PATH: `${bin}${delimiter}${originalPath}`,
          HOME: caseDirectory,
          TMPDIR: scratch,
          npm_config_verify_deps_before_run: "false",
          ...dangerous,
          DATABASE_URL: inheritedUrl,
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    const log = (run.stdout || "") + (run.stderr || "");
    if (reportDirectory) {
      const logFile = join(reportDirectory, `${mode}.log`);
      await writeFile(logFile, log, { mode: 0o600 });
    }
    const calls = (await readFile(capture, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const runnerDirectory = calls[0].databaseDirectory;
    const removed = await access(runnerDirectory)
      .then(() => false)
      .catch((error) => {
        assert.equal(error.code, "ENOENT");
        return true;
      });
    const preserved =
      (await readFile(protectedFile, "utf8")) ===
      "Datos ficticios ajenos al runner: conservar.\n";
    const result = {
      mode,
      exitCode: run.status,
      tools: calls.map((call) => call.tool),
      ownDirectoryRemoved: removed,
      remainingSiblingDirectories: await readdir(scratch),
      siblingAndSymlinkTargetPreserved: preserved,
      causalFailurePresent: log.includes("FALLO_CAUSAL_FICTICIO"),
      inheritedProviderState: calls.at(-1).providers,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    try {
      assert.ifError(run.error);
      assert.deepEqual(result.tools, ["drizzle-kit", "vitest"]);
      assert.ok(removed && preserved, "Limpieza fuera del ámbito propio");
      assert.deepEqual(result.remainingSiblingDirectories, [
        "nido-tests-sibling",
      ]);
      if (mode === "success")
        assert.equal(run.status, 0, "Proveedores heredados activos");
      else {
        assert.equal(run.status, 1, "Debe propagar el fallo del test");
        assert.ok(result.causalFailurePresent, "Falta el fallo real de Vitest");
      }
    } catch (error) {
      failureMessages.push(error.message);
    }
  }
} finally {
  // Sólo el espacio creado por este harness, nunca tmpdir() ni otros runners.
  await rm(directory, { recursive: true, force: true });
}
if (reportDirectory)
  await writeFile(
    join(reportDirectory, "result.json"),
    `${JSON.stringify({ results, failures: failureMessages }, null, 2)}\n`,
    { mode: 0o600 },
  );
assert.deepEqual(
  failureMessages,
  [],
  "La comprobación causal del runner falló",
);
