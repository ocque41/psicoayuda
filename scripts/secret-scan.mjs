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

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => !allowedFiles.has(file));
}

function valueFor(match, pattern) {
  return pattern.capture ? match[pattern.capture] : match[0];
}

const findings = [];

for (const file of trackedFiles()) {
  const text = readFileSync(file, "utf8");

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = valueFor(match, pattern).trim();

      if (allowedValues.has(value) || value.endsWith("=")) {
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

console.log("No tracked secrets found.");
