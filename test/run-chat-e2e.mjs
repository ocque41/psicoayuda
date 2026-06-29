// Prueba e2e del chat con un solo comando: levanta wrangler dev (workerd) con el
// Durable Object real, espera a que esté listo, corre las comprobaciones por
// WebSocket y apaga wrangler. Uso: node test/run-chat-e2e.mjs
import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const PORT = process.env.CHAT_TEST_PORT || "8788";

const wrangler = spawn(
  "npx",
  [
    "wrangler",
    "dev",
    "--config",
    "wrangler.test.jsonc",
    "--port",
    PORT,
    "--ip",
    "127.0.0.1",
    "--var",
    "BETTER_AUTH_SECRET:test-secret",
    "--var",
    `BETTER_AUTH_URL:http://127.0.0.1:${PORT}`,
    "--var",
    "INTERNAL_NOTIFY_SECRET:test-secret",
  ],
  { shell: true, stdio: ["ignore", "pipe", "pipe"] },
);

let started = false;
let finished = false;

function killWrangler() {
  if (isWin) {
    try {
      spawn("taskkill", ["/PID", String(wrangler.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // ignore
    }
  } else {
    try {
      wrangler.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

function finish(code) {
  if (finished) return;
  finished = true;
  killWrangler();
  setTimeout(() => process.exit(code), 700);
}

function onData(buf) {
  const text = String(buf);
  if (!started && text.includes("Ready on")) {
    started = true;
    const test = spawn("node", ["test/chat-e2e.mjs"], {
      stdio: "inherit",
      env: { ...process.env, CHAT_TEST_PORT: PORT },
      shell: true,
    });
    test.on("exit", (code) => finish(code ?? 1));
  }
}

wrangler.stdout.on("data", onData);
wrangler.stderr.on("data", onData);

setTimeout(() => {
  if (!started) {
    console.error("wrangler dev no estuvo listo a tiempo");
    finish(1);
  }
}, 90_000);
