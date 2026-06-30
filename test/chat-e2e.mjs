// Prueba e2e del chat en el runtime REAL de Workers (wrangler dev + workerd).
// Conecta dos clientes WebSocket (seeker y profesional) contra el Durable
// Object real y verifica entrega en tiempo real, ack, dedup, orden, historial
// y autorización (403). Ejecutar con wrangler dev escuchando en :8799.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import WebSocket from "ws";

const PORT = process.env.CHAT_TEST_PORT || "8799";
const BASE = `ws://127.0.0.1:${PORT}`;
const SECRET = "test-secret";
const HOUR = 3_600_000;
// Sufijo único por corrida: wrangler dev persiste el SQLite del DO entre
// corridas, así que salas frescas evitan colisiones de clientMsgId (dedup).
const U = Math.random().toString(36).slice(2, 8);
const cid = (name) => `${name}_${U}`;

// Rastreamos todos los sockets para cerrarlos limpio al final (evita el crash
// de libuv en Windows al salir con handles abiertos).
const allSockets = [];
function track(ws) {
  allSockets.push(ws);
  return ws;
}

// --- Minteo de token idéntico a src/lib/seeker-token.ts ---
const b64url = (buf) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const sign = (body) =>
  b64url(createHmac("sha256", SECRET).update(body).digest());
const mint = (payload) => {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
};
const seekerCookie = (conv) =>
  `nido_seeker=${mint({ sid: "seek_1", conversationId: conv, role: "seeker", iat: Date.now(), exp: Date.now() + HOUR })}`;
const proCookie = (conv) =>
  `nido_pro=${mint({ professionalId: "pro_1", conversationId: conv, role: "professional", iat: Date.now(), exp: Date.now() + HOUR })}`;

function statusOf(conv, cookie) {
  return new Promise((resolve, reject) => {
    const headers = cookie ? { Cookie: cookie } : {};
    const ws = track(
      new WebSocket(`${BASE}/parties/conversation/${conv}`, { headers }),
    );
    const t = setTimeout(() => reject(new Error("timeout (status)")), 8000);
    ws.on("open", () => {
      clearTimeout(t);
      ws.close();
      resolve(101);
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(t);
      resolve(res.statusCode);
    });
    ws.on("error", () => {});
  });
}

function open(conv, cookie) {
  return new Promise((resolve, reject) => {
    const ws = track(
      new WebSocket(`${BASE}/parties/conversation/${conv}`, {
        headers: { Cookie: cookie },
      }),
    );
    const inbox = [];
    const waiters = [];
    const t = setTimeout(() => reject(new Error("timeout (open)")), 8000);
    ws.on("open", () => {
      clearTimeout(t);
      resolve({
        send: (f) => ws.send(JSON.stringify(f)),
        next: () =>
          new Promise((res, rej) => {
            const b = inbox.shift();
            if (b) return res(b);
            const to = setTimeout(() => rej(new Error("timeout (next)")), 5000);
            waiters.push((f) => {
              clearTimeout(to);
              res(f);
            });
          }),
        async waitFor(type) {
          for (let i = 0; i < 50; i++) {
            const f = await this.next();
            if (f.type === type) return f;
          }
          throw new Error(`no frame ${type}`);
        },
        close: () => ws.close(),
      });
    });
    ws.on("message", (data) => {
      const f = JSON.parse(data.toString());
      const w = waiters.shift();
      if (w) w(f);
      else inbox.push(f);
    });
    ws.on("error", (e) => reject(e));
  });
}

async function getCalls() {
  const res = await fetch(`http://127.0.0.1:${PORT}/__nido-calls`);
  return res.json();
}
async function pollCalls(pred, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = (await getCalls()).find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`no internal call: ${label}`);
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push([false, name]);
    console.log(`  FAIL  ${name} :: ${e.message}`);
  }
}

async function main() {
  console.log(`Chat e2e contra workerd (wrangler dev) en ${BASE}`);

  await check("403 sin cookie", async () => {
    assert.equal(await statusOf(cid("conv_auth"), null), 403);
  });
  await check("403 con token de otra sala", async () => {
    assert.equal(
      await statusOf(cid("conv_auth"), seekerCookie(cid("conv_otra"))),
      403,
    );
  });
  await check("101 con token válido de la sala", async () => {
    assert.equal(
      await statusOf(cid("conv_auth"), seekerCookie(cid("conv_auth"))),
      101,
    );
  });

  await check(
    "entrega en tiempo real seeker<->profesional + ack + orden",
    async () => {
      const conv = cid("conv_rt");
      const seeker = await open(conv, seekerCookie(conv));
      const pro = await open(conv, proCookie(conv));
      await seeker.waitFor("history");
      await pro.waitFor("history");

      seeker.send({ type: "send", clientMsgId: "c1", content: "hola" });
      const ack1 = await seeker.waitFor("ack");
      assert.equal(ack1.clientMsgId, "c1");
      assert.equal(ack1.seq, 1);
      const m1 = await pro.waitFor("msg");
      assert.equal(m1.message.content, "hola");
      assert.equal(m1.message.senderRole, "seeker");
      assert.equal(m1.message.seq, 1);

      pro.send({ type: "send", clientMsgId: "p1", content: "aqui estoy" });
      const ack2 = await pro.waitFor("ack");
      assert.equal(ack2.seq, 2);
      const m2 = await seeker.waitFor("msg");
      assert.equal(m2.message.content, "aqui estoy");
      assert.equal(m2.message.senderRole, "professional");
      seeker.close();
      pro.close();
    },
  );

  await check("dedup idempotente por clientMsgId", async () => {
    const conv = cid("conv_dedup");
    const seeker = await open(conv, seekerCookie(conv));
    const pro = await open(conv, proCookie(conv));
    await seeker.waitFor("history");
    await pro.waitFor("history");

    seeker.send({ type: "send", clientMsgId: "dup", content: "uno" });
    const ackA = await seeker.waitFor("ack");
    await pro.waitFor("msg");
    seeker.send({ type: "send", clientMsgId: "dup", content: "uno" });
    const ackB = await seeker.waitFor("ack");
    assert.equal(ackB.seq, ackA.seq);
    seeker.send({ type: "send", clientMsgId: "next", content: "dos" });
    const mNext = await pro.waitFor("msg");
    assert.equal(mNext.message.seq, ackA.seq + 1);
    assert.equal(mNext.message.content, "dos");
    seeker.close();
    pro.close();
  });

  await check("historial al unirse después", async () => {
    const conv = cid("conv_hist");
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    seeker.send({ type: "send", clientMsgId: "h1", content: "previo" });
    await seeker.waitFor("ack");
    const pro = await open(conv, proCookie(conv));
    const hist = await pro.waitFor("history");
    assert.equal(hist.messages.length, 1);
    assert.equal(hist.messages[0].content, "previo");
    seeker.close();
    pro.close();
  });

  await check(
    "email al profesional offline + captura de tiempo de respuesta",
    async () => {
      const conv = cid("conv_notify");
      const seeker = await open(conv, seekerCookie(conv));
      await seeker.waitFor("history");
      seeker.send({ type: "send", clientMsgId: "n1", content: "hay alguien?" });
      await seeker.waitFor("ack");
      // Profesional offline -> el DO avisa por email (vía endpoint interno).
      await pollCalls(
        (c) => c.kind === "notify-message" && c.conversationId === conv,
        4000,
        "notify-message",
      );
      // El profesional entra y responde -> muestra de tiempo de respuesta.
      const pro = await open(conv, proCookie(conv));
      await pro.waitFor("history");
      pro.send({ type: "send", clientMsgId: "r1", content: "aqui estoy" });
      await pro.waitFor("ack");
      const sample = await pollCalls(
        (c) => c.kind === "response-sample" && c.conversationId === conv,
        4000,
        "response-sample",
      );
      assert.equal(typeof sample.responseDeltaMs, "number");
      assert.ok(sample.responseDeltaMs >= 0);
      seeker.close();
      pro.close();
    },
  );

  await check("purga borra el contenido del chat (privacidad)", async () => {
    const conv = cid("conv_purge");
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    seeker.send({ type: "send", clientMsgId: "s1", content: "dato sensible" });
    await seeker.waitFor("ack");
    seeker.close();

    // Purga vía el binding del DO (igual que la anonimización en producción).
    const res = await fetch(`http://127.0.0.1:${PORT}/__purge?room=${conv}`, {
      method: "POST",
    });
    assert.equal(res.status, 200);

    // Una nueva conexión NO debe ver ningún mensaje: el SQLite del DO quedó vacío.
    const again = await open(conv, seekerCookie(conv));
    const hist = await again.waitFor("history");
    assert.equal(hist.messages.length, 0);
    again.close();
  });

  await check("rate-limit anti-flood por conexión", async () => {
    const conv = cid("conv_flood");
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    // Inundar por encima del tope (40/ventana) debe producir un error.
    for (let i = 0; i < 60; i++) {
      seeker.send({ type: "send", clientMsgId: `f${i}`, content: "x" });
    }
    const err = await seeker.waitFor("error");
    assert.equal(err.code, "rate_limited");
    seeker.close();
  });

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);

  // Cierre ordenado: terminar todos los sockets y dejar drenar el loop.
  for (const ws of allSockets) {
    try {
      ws.terminate();
    } catch {
      // ignore
    }
  }
  process.exitCode = failed === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 300).unref();
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
