import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";

// Una base nueva evita tocar cuentas locales o bases remotas durante las suites.
const directory = await mkdtemp(join(tmpdir(), "nido-tests-"));
const url = `file:${join(directory, "test.db")}`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  NIDO_DB_TARGET: "",
  RESEND_API_KEY: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  DAILY_API_KEY: "",
  GITHUB_ISSUE_TOKEN: "",
  // También neutralizar proveedores configurables sin las claves anteriores.
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  NIDO_PUSH_ENABLED: "false",
  NIDO_PUSH_VAPID_PUBLIC_KEY: "",
  NIDO_PUSH_VAPID_PRIVATE_KEY: "",
  NIDO_PUSH_VAPID_SUBJECT: "",
  NIDO_GOOGLE_CALENDAR_ENABLED: "false",
  NIDO_GOOGLE_CALENDAR_CLIENT_ID: "",
  NIDO_GOOGLE_CALENDAR_CLIENT_SECRET: "",
  NIDO_GOOGLE_CALENDAR_REDIRECT_URI: "",
  NIDO_PRACTICE_ENABLED: "false",
};
function run(args) {
  const result = spawnSync(
    "pnpm",
    ["--config.verifyDepsBeforeRun=false", ...args],
    {
      env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `La comprobación falló (${result.status}): pnpm ${args.join(" ")}`,
    );
}
let client;
try {
  run(["exec", "drizzle-kit", "push", "--force"]);
  client = createClient({ url });
  for (const file of [
    "0027_practice_crm.sql",
    "0030_practice_notes.sql",
    "0032_support_continuity.sql",
    "0033_receipt_corrections.sql",
    "0036_session_notes.sql",
    "0040_professional_admission_pipeline.sql",
    "0041_patient_profile.sql",
    "0042_calendar_revision.sql",
  ]) {
    const migration = await readFile(
      new URL(`../drizzle/${file}`, import.meta.url),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      const sql = statement.trim().replace(/^(?:--[^\n]*\n\s*)+/, "");
      if (sql.startsWith("CREATE TRIGGER")) await client.execute(statement);
    }
  }
  run(["exec", "vitest", "run", ...process.argv.slice(2)]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client?.close();
  await rm(directory, { recursive: true, force: true });
}
