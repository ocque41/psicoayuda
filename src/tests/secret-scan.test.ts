import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scanner = fileURLToPath(
  new URL("../../scripts/secret-scan.mjs", import.meta.url),
);
const key = ["BETTER", "AUTH", "SECRET"].join("_");
const fakeValue = ["GOC", "SPX-", "a".repeat(24)].join("");
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "nido-secret-scan-"));
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], {
    cwd: directory,
  });
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function file(name: string, text: string, tracked = true) {
  writeFileSync(join(directory, name), text, "utf8");
  if (tracked) execFileSync("git", ["add", "--", name], { cwd: directory });
}
function scan() {
  const result = spawnSync(process.execPath, [scanner], {
    cwd: directory,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
function flagged(result: ReturnType<typeof scan>, name: string, line: number) {
  expect(result.status).toBe(1);
  expect(result.output).toContain(`${name}:${line} Secret-like assignment`);
  expect(result.output).not.toContain(fakeValue);
}

describe("escáner real ejecutado en un repositorio Git temporal", () => {
  it("acepta exclusivamente anotaciones primitivas simples sin comillas en declaraciones .d.ts", () => {
    const types = [
      "string",
      "number",
      "boolean",
      "bigint",
      "symbol",
      "undefined",
      "null",
    ];
    file(
      "bindings.d.ts",
      `interface Env {\n${types.map((type, index) => `  ${key}_${index}: ${type};`).join("\n")}\n}`,
    );
    expect(scan().status).toBe(0);
  });

  it("admite espacios y comentarios de una anotación pero no excluye todo el archivo", () => {
    file(
      "bindings.d.ts",
      `interface Env {\n  ${key}: string ; // Tipo generado\n  ${key}_LITERAL: '${fakeValue}';\n}`,
    );
    const result = scan();
    flagged(result, "bindings.d.ts", 3);
    expect(result.output).not.toContain("bindings.d.ts:2");
    expect(result.output).toContain("Google OAuth client secret");
  });

  it.each([
    "string",
    "number",
    "boolean",
  ])("no permite un literal citado con el texto %s", (type) => {
    file("bindings.d.ts", `interface Env {\n  ${key}: '${type}';\n}`);
    flagged(scan(), "bindings.d.ts", 2);
  });

  it("no permite una unión que contiene un valor literal después del tipo primitivo", () => {
    file(
      "bindings.d.ts",
      `interface Env {\n  ${key}: string | '${fakeValue}';\n}`,
    );
    flagged(scan(), "bindings.d.ts", 2);
  });

  it("conserva la detección si un tipo compuesto continúa en la línea siguiente", () => {
    file(
      "bindings.d.ts",
      `interface Env {\n  ${key}: string\n    /* continuación */\n    | 'literal-fixture-not-a-secret';\n}`,
    );
    flagged(scan(), "bindings.d.ts", 2);
  });

  it("acepta una anotación primitiva simple sin punto y coma", () => {
    file("bindings.d.ts", `interface Env {\n  ${key}: string\n}`);
    expect(scan().status).toBe(0);
  });

  it("no confunde una asignación = con una anotación de tipo", () => {
    file("bindings.d.ts", `${key} = string;\n`);
    flagged(scan(), "bindings.d.ts", 1);
  });

  it("no aplica la excepción a archivos .ts ordinarios", () => {
    file("bindings.ts", `${key}: string;\n`);
    flagged(scan(), "bindings.ts", 1);
  });

  it("detecta un secreto señuelo todavía sin seguimiento y oculta su valor", () => {
    file("new-settings.env", `${key}='${fakeValue}'\n`, false);
    flagged(scan(), "new-settings.env", 1);
  });

  it("respeta gitignore para archivos nuevos pero sigue revisando los ya indexados", () => {
    file(".gitignore", "private.env\n");
    file("private.env", `${key}='${fakeValue}'\n`, false);
    expect(scan().status).toBe(0);
    execFileSync("git", ["add", "--force", "--", "private.env"], {
      cwd: directory,
    });
    flagged(scan(), "private.env", 1);
  });
});
