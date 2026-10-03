import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allowedValues = new Set([
  "",
  "file:./local.db",
  "http://localhost:3000",
  "ci-local-secret-change-me",
  "nido-local-development-secret-change-me",
  // Placeholder usado solo en los tests del worker de chat (no es un secreto real).
  "test-secret",
  // Marcador de build en deploy.yml; el secreto real vive en Cloudflare.
  "deploy-build-placeholder-not-the-real-secret",
]);

const allowedFiles = new Set(["pnpm-lock.yaml"]);

const patterns = [
  {
    name: "Cloudflare API token",
    regex: /\bcf[a-zA-Z0-9_-]{30,}\b/g,
  },
  {
    name: "Google OAuth client secret",
    regex: /\bGOCSPX-[a-zA-Z0-9_-]{20,}\b/g,
  },
  {
    name: "Private key block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "Secret-like assignment",
    regex:
      /\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*[ \t]*[:=][ \t]*["']?([^"'\s#]+)/g,
    capture: 1,
  },
];

function projectFiles() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .filter((file) => !allowedFiles.has(file));
  return [...new Set(files)];
}

function valueFor(match, pattern) {
  return pattern.capture ? match[pattern.capture] : match[0];
}

function primitiveTypeAnnotation(file, text, match, pattern) {
  if (!file.endsWith(".d.ts") || !pattern.capture) return false;
  // Una anotación simple de tipo no contiene un valor. No permitir literales
  // entre comillas, asignaciones con = ni tipos compuestos con valores literales.
  if (
    !/^[A-Z][A-Z0-9_]*[ \t]*:[ \t]*(?:string|number|boolean|bigint|symbol|undefined|null);?$/.test(
      match[0],
    )
  ) {
    return false;
  }
  const tail = text.slice(match.index + match[0].length);
  const suffix = tail.split(/\r?\n/, 1)[0];
  if (!/^[ \t]*(?:;[ \t]*)?(?:\/\/.*)?$/.test(suffix)) return false;
  if (match[0].endsWith(";") || /^[ \t]*;/.test(suffix)) return true;
  // Sin punto y coma, una unión/array/condicional puede continuar en otra línea.
  // Tampoco es una anotación primitiva simple y conserva la detección normal.
  const continuation = tail
    .slice(suffix.length)
    .replace(/^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, "");
  return !/^(?:[|&[]|extends\b)/.test(continuation);
}

const findings = [];

for (const file of projectFiles()) {
  const text = readFileSync(file, "utf8");

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = valueFor(match, pattern).trim();

      // `${{ secrets.* }}` es una REFERENCIA de GitHub Actions, no un secreto
      // literal en el repo: el valor real vive en GitHub Secrets. No lo marcamos.
      if (
        primitiveTypeAnnotation(file, text, match, pattern) ||
        allowedValues.has(value) ||
        value.endsWith("=") ||
        value.startsWith("${{")
      ) {
        continue;
      }

      const line = text.slice(0, match.index).split("\n").length;

      findings.push(`${file}:${line} ${pattern.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("No secrets found in tracked or untracked project files.");
