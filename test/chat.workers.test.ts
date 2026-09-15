import { env, runInDurableObject, SELF } from "cloudflare:test";
import { getServerByName } from "partyserver";
import { describe, expect, it } from "vitest";
import {
  mintProfessionalInboxToken,
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
import type { ClientFrame, ServerFrame } from "@/shared/chat-protocol";
import {
  createEnvelope,
  generateIdentityKeyPair,
  toConversationIdentity,
} from "@/shared/e2ee";

const SECRET = "test-secret";
const HOUR = 3_600_000;

function seekerCookie(conversationId: string) {
  const token = mintSeekerToken(
    {
      sid: "seek_1",
      conversationId,
      role: "seeker",
      iat: Date.now(),
      exp: Date.now() + HOUR,
    },
    SECRET,
  );
  return `${SEEKER_COOKIE}=${token}`;
}

function inboxCookie() {
  const token = mintProfessionalInboxToken(
    {
      professionalId: "pro_1",
      role: "inbox",
      iat: Date.now(),
      exp: Date.now() + HOUR,
    },
    SECRET,
  );
  return `${PRO_INBOX_COOKIE}=${token}`;
}

function proCookie(conversationId: string) {
  const token = mintProfessionalToken(
    {
      professionalId: "pro_1",
      conversationId,
      role: "professional",
      iat: Date.now(),
      exp: Date.now() + HOUR,
    },
    SECRET,
  );
  return `${PRO_COOKIE}=${token}`;
}

type Client = {
  send: (frame: ClientFrame) => void;
  next: () => Promise<ServerFrame>;
  waitFor: (type: ServerFrame["type"]) => Promise<ServerFrame>;
  buffered: () => ServerFrame[];
  close: () => void;
};

function wrap(ws: WebSocket): Client {
  const inbox: ServerFrame[] = [];
  const waiters: Array<(f: ServerFrame) => void> = [];
  ws.accept();
  ws.addEventListener("message", (event: MessageEvent) => {
    const frame = JSON.parse(event.data as string) as ServerFrame;
    const waiter = waiters.shift();
    if (waiter) waiter(frame);
    else inbox.push(frame);
  });
  const next = () => {
    const buffered = inbox.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise<ServerFrame>((resolve) => waiters.push(resolve));
  };
  return {
    send: (frame) => ws.send(JSON.stringify(frame)),
    next,
    async waitFor(type) {
      for (let i = 0; i < 60; i++) {
        const frame = await next();
        if (frame.type === type) return frame;
      }
      throw new Error(`no frame of type ${type}`);
    },
    buffered: () => inbox,
    close: () => ws.close(),
  };
}

async function connect(
  conversationId: string,
  cookie: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  if (cookie) headers.Cookie = cookie;
  return SELF.fetch(
    `https://internal.test/parties/conversation/${conversationId}`,
    { headers },
  );
}

async function open(conversationId: string, cookie: string): Promise<Client> {
  const res = await connect(conversationId, cookie);
  expect(res.status).toBe(101);
  expect(res.webSocket).not.toBeNull();
  return wrap(res.webSocket as unknown as WebSocket);
}

// Conexión con headers extra (solo-test): simula `x-nido-can-send=0` (cerrada).
async function openWith(
  conversationId: string,
  cookie: string,
  extra: Record<string, string>,
): Promise<Client> {
  const headers: Record<string, string> = { Upgrade: "websocket", ...extra };
  headers.Cookie = cookie;
  const res = await SELF.fetch(
    `https://internal.test/parties/conversation/${conversationId}`,
    { headers },
  );
  expect(res.status).toBe(101);
  expect(res.webSocket).not.toBeNull();
  return wrap(res.webSocket as unknown as WebSocket);
}

/**
 * La D1 del pool se comparte entre tests: las tablas mínimas que crean las
 * pruebas del gate de avisos se borran al terminar para no romper a las demás
 * (sin tablas, las consultas del gate fallan y el gate no bloquea, como antes).
 */
async function dropD1() {
  await env.DB.prepare("DROP TABLE IF EXISTS conversations").run();
  await env.DB.prepare("DROP TABLE IF EXISTS professionals").run();
}

async function settle(ms = 60) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Lee una clave del meta SQLite del propio Durable Object (mismo instance que
// enrutó partyserver). Sustituye al antiguo fetchMock (eliminado del pool en
// Vitest 4) para verificar los efectos del DO por su estado persistido.
async function readMeta(
  conversationId: string,
  key: string,
): Promise<number | null> {
  const stub = await getServerByName(env.Conversation, conversationId);
  return runInDurableObject(stub, (_instance, state) => {
    const rows = state.storage.sql
      .exec("SELECT v FROM meta WHERE k = ?", key)
      .toArray() as Array<{ v: number }>;
    return rows.length ? Number(rows[0].v) : null;
  });
}

describe("chat Durable Object (runtime de Workers)", () => {
  it("rechaza conexiones sin token o de otra sala (403)", async () => {
    expect((await connect("conv_auth", null)).status).toBe(403);
    expect(
      (await connect("conv_auth", seekerCookie("conv_distinta"))).status,
    ).toBe(403);
    // Con token válido de la sala sí conecta (101).
    const ok = await connect("conv_auth", seekerCookie("conv_auth"));
    expect(ok.status).toBe(101);
    (ok.webSocket as unknown as WebSocket).accept();
  });

  it("conversación cerrada: historial en solo lectura y envío rechazado", async () => {
    const conv = "conv_closed";
    const seeker = await openWith(conv, seekerCookie(conv), {
      "x-test-can-send": "0",
    });
    await seeker.waitFor("history");

    seeker.send({
      type: "send",
      clientMsgId: "c_closed_1",
      content: "no debería enviarse",
    });
    const blocked = await seeker.waitFor("error");
    expect(blocked).toMatchObject({
      type: "error",
      code: "conversation_closed",
    });

    // Simula la reapertura (canSend=1): el envío vuelve a funcionar.
    const pro = await openWith(conv, proCookie(conv), {});
    await pro.waitFor("history");
    pro.send({ type: "send", clientMsgId: "c_open_1", content: "hola" });
    const ack = await pro.waitFor("ack");
    expect(ack.type).toBe("ack");
  });

  it("entrega mensajes en tiempo real entre seeker y profesional", async () => {
    const conv = "conv_rt";
    const seeker = await open(conv, seekerCookie(conv));
    const pro = await open(conv, proCookie(conv));
    await seeker.waitFor("history");
    await pro.waitFor("history");

    seeker.send({
      type: "send",
      clientMsgId: "c1",
      content: "hola, necesito ayuda",
    });
    const ack1 = (await seeker.waitFor("ack")) as Extract<
      ServerFrame,
      { type: "ack" }
    >;
    expect(ack1.clientMsgId).toBe("c1");
    expect(ack1.seq).toBe(1);
    const msg1 = (await pro.waitFor("msg")) as Extract<
      ServerFrame,
      { type: "msg" }
    >;
    expect(msg1.message.content).toBe("hola, necesito ayuda");
    expect(msg1.message.senderRole).toBe("seeker");
    expect(msg1.message.seq).toBe(1);

    pro.send({
      type: "send",
      clientMsgId: "p1",
      content: "aquí estoy, cuéntame",
    });
    const ack2 = (await pro.waitFor("ack")) as Extract<
      ServerFrame,
      { type: "ack" }
    >;
    expect(ack2.seq).toBe(2);
    const msg2 = (await seeker.waitFor("msg")) as Extract<
      ServerFrame,
      { type: "msg" }
    >;
    expect(msg2.message.content).toBe("aquí estoy, cuéntame");
    expect(msg2.message.senderRole).toBe("professional");
    expect(msg2.message.seq).toBe(2);

    seeker.close();
    pro.close();
  });

  it("deduplica reenvíos por clientMsgId (no duplica al otro extremo)", async () => {
    const conv = "conv_dedup";
    const seeker = await open(conv, seekerCookie(conv));
    const pro = await open(conv, proCookie(conv));
    await seeker.waitFor("history");
    await pro.waitFor("history");

    seeker.send({ type: "send", clientMsgId: "dup", content: "uno" });
    const ackA = (await seeker.waitFor("ack")) as Extract<
      ServerFrame,
      { type: "ack" }
    >;
    await pro.waitFor("msg");

    seeker.send({ type: "send", clientMsgId: "dup", content: "uno" });
    const ackB = (await seeker.waitFor("ack")) as Extract<
      ServerFrame,
      { type: "ack" }
    >;
    expect(ackB.seq).toBe(ackA.seq);

    seeker.send({ type: "send", clientMsgId: "next", content: "dos" });
    const msgNext = (await pro.waitFor("msg")) as Extract<
      ServerFrame,
      { type: "msg" }
    >;
    expect(msgNext.message.seq).toBe(ackA.seq + 1);
    expect(msgNext.message.content).toBe("dos");

    seeker.close();
    pro.close();
  });

  it("envía historial a quien se une después", async () => {
    const conv = "conv_hist";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    seeker.send({ type: "send", clientMsgId: "h1", content: "mensaje previo" });
    await seeker.waitFor("ack");

    const pro = await open(conv, proCookie(conv));
    const history = (await pro.waitFor("history")) as Extract<
      ServerFrame,
      { type: "history" }
    >;
    expect(history.messages.length).toBe(1);
    expect(history.messages[0].content).toBe("mensaje previo");

    seeker.close();
    pro.close();
  });

  it("registra el aviso al profesional OFFLINE y captura el tiempo de respuesta", async () => {
    const conv = "conv_notify";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");

    // Profesional NO conectado -> se registra el intento de notificación
    // (last_notify_at persiste el debounce; sobrevive a la hibernación).
    seeker.send({ type: "send", clientMsgId: "n1", content: "¿hay alguien?" });
    await seeker.waitFor("ack");
    await settle();
    expect(await readMeta(conv, "last_notify_at")).not.toBeNull();
    expect(await readMeta(conv, "first_seeker_msg_at")).not.toBeNull();

    // El profesional entra y responde -> se captura el primer reply.
    const pro = await open(conv, proCookie(conv));
    await pro.waitFor("history");
    pro.send({ type: "send", clientMsgId: "r1", content: "sí, aquí estoy" });
    await pro.waitFor("ack");
    await settle();
    expect(await readMeta(conv, "first_pro_reply_at")).not.toBeNull();

    seeker.close();
    pro.close();
  });

  it("la conexión de avisos recibe mensajes, no cuenta como presencia y no escribe", async () => {
    const conv = "conv_informer";
    // D1 mínima: la sala pertenece a pro_1 (sin ella el gate rechaza avisos).
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, professional_id TEXT, status TEXT, anonymized_at INTEGER, deleted_at INTEGER)",
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS professionals (id TEXT PRIMARY KEY, status TEXT)",
    ).run();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO conversations (id, professional_id, status) VALUES (?, 'pro_1', 'open')",
    )
      .bind(conv)
      .run();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO professionals (id, status) VALUES ('pro_1', 'approved')",
    ).run();

    try {
      // Solo está la conexión de avisos (el profesional no tiene la sala abierta).
      const informerRes = await SELF.fetch(
        `https://internal.test/parties/conversation/${conv}?avisos=1`,
        { headers: { Upgrade: "websocket", Cookie: inboxCookie() } },
      );
      expect(informerRes.status).toBe(101);
      const informer = wrap(informerRes.webSocket as unknown as WebSocket);
      await settle();
      // Sin historial ni claves: es un canal de avisos, no una sala.
      expect(informer.buffered()).toEqual([]);

      const seeker = await open(conv, seekerCookie(conv));
      await seeker.waitFor("history");
      seeker.send({
        type: "send",
        clientMsgId: "i1",
        content: "hola de nuevo",
      });
      await seeker.waitFor("ack");

      // El aviso llega al instante a la lista del profesional…
      const live = (await informer.waitFor("msg")) as Extract<
        ServerFrame,
        { type: "msg" }
      >;
      expect(live.message.seq).toBe(1);
      expect(live.message.senderRole).toBe("seeker");

      // …y como NO cuenta como presencia, el correo de respaldo sigue saliendo
      // (mismo debounce de aviso que si el profesional estuviera desconectado).
      await settle();
      expect(await readMeta(conv, "last_notify_at")).not.toBeNull();

      // La conexión de avisos no puede escribir: su frame se ignora.
      informer.send({ type: "send", clientMsgId: "x1", content: "no debería" });
      await settle();
      expect(seeker.buffered().filter((f) => f.type === "msg")).toEqual([]);

      informer.close();
      seeker.close();
    } finally {
      await dropD1();
    }
  });

  it("la conexión de avisos a una sala ajena se rechaza (403)", async () => {
    const conv = "conv_informer_ajena";
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, professional_id TEXT, status TEXT, anonymized_at INTEGER, deleted_at INTEGER)",
    ).run();
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS professionals (id TEXT PRIMARY KEY, status TEXT)",
    ).run();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO conversations (id, professional_id, status) VALUES (?, 'pro_OTRO', 'open')",
    )
      .bind(conv)
      .run();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO professionals (id, status) VALUES ('pro_1', 'approved')",
    ).run();

    try {
      const res = await SELF.fetch(
        `https://internal.test/parties/conversation/${conv}?avisos=1`,
        { headers: { Upgrade: "websocket", Cookie: inboxCookie() } },
      );
      expect(res.status).toBe(403);
    } finally {
      await dropD1();
    }
  });

  it("purga el transcript con la señal interna autenticada", async () => {
    const conv = "conv_purge";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    seeker.send({ type: "send", clientMsgId: "g1", content: "algo privado" });
    await seeker.waitFor("ack");

    const stub = await getServerByName(env.Conversation, conv);
    // Sin secreto correcto -> 401.
    const denied = await stub.fetch("https://do/purge", {
      method: "POST",
      headers: { "x-nido-internal": "wrong" },
    });
    expect(denied.status).toBe(401);

    // Con el secreto correcto -> purga.
    const purged = await stub.fetch("https://do/purge", {
      method: "POST",
      headers: { "x-nido-internal": SECRET },
    });
    expect(purged.status).toBe(200);
    seeker.close();
    await settle();

    // Una nueva conexión ya no ve el transcript: historial vacío.
    const after = await open(conv, seekerCookie(conv));
    const history = (await after.waitFor("history")) as Extract<
      ServerFrame,
      { type: "history" }
    >;
    expect(history.messages.length).toBe(0);
    after.close();
  });

  it("publica y difunde las claves públicas E2EE de cada rol", async () => {
    const conv = "conv_keys";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    await seeker.waitFor("keys");

    const seekerIdentity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    seeker.send({ type: "key", publicKey: seekerIdentity.publicKey });
    const broadcast = (await seeker.waitFor("keys")) as Extract<
      ServerFrame,
      { type: "keys" }
    >;
    expect(broadcast.keys.seeker).toBe(seekerIdentity.publicKey);

    // Quien se une después recibe el snapshot (sin esperar a un mensaje).
    const pro = await open(conv, proCookie(conv));
    await pro.waitFor("history");
    const snapshot = (await pro.waitFor("keys")) as Extract<
      ServerFrame,
      { type: "keys" }
    >;
    expect(snapshot.keys.seeker).toBe(seekerIdentity.publicKey);

    seeker.close();
    pro.close();
  });

  it("pagina el historial hacia atrás por keyset (hasMore correcto)", async () => {
    const conv = "conv_page";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    await seeker.waitFor("keys");

    const total = 32;
    for (let i = 1; i <= total; i += 1) {
      seeker.send({
        type: "send",
        clientMsgId: `pg_${i}`,
        content: `mensaje ${i}`,
      });
      await seeker.waitFor("ack");
    }
    seeker.close();
    await settle();

    const reopened = await open(conv, seekerCookie(conv));
    const initial = (await reopened.waitFor("history")) as Extract<
      ServerFrame,
      { type: "history" }
    >;
    expect(initial.mode).toBe("initial");
    expect(initial.messages.length).toBe(30);
    expect(initial.hasMore).toBe(true);

    const oldestSeq = initial.messages[0]?.seq ?? 0;
    reopened.send({ type: "history-page", beforeSeq: oldestSeq });
    const page = (await reopened.waitFor("history")) as Extract<
      ServerFrame,
      { type: "history" }
    >;
    expect(page.mode).toBe("page");
    expect(page.messages.length).toBe(total - 30);
    expect(page.hasMore).toBe(false);
    expect(page.messages[0]?.seq).toBe(1);
    reopened.close();
  });

  it("re-cifra mensajes legados con el sobre del cliente (idempotente)", async () => {
    const conv = "conv_reencrypt";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");
    await seeker.waitFor("keys");

    seeker.send({
      type: "send",
      clientMsgId: "legacy_1",
      content: "texto legado",
    });
    const ack = (await seeker.waitFor("ack")) as Extract<
      ServerFrame,
      { type: "ack" }
    >;

    const seekerIdentity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    const proIdentity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    const envelope = await createEnvelope({
      identity: seekerIdentity,
      peerPublicKey: proIdentity.publicKey,
      conversationId: conv,
      senderRole: "seeker",
      plaintext: "texto legado",
    });

    seeker.send({
      type: "reencrypt",
      items: [{ serverId: ack.serverId, envelope }],
    });
    const done = (await seeker.waitFor("reencrypted")) as Extract<
      ServerFrame,
      { type: "reencrypted" }
    >;
    expect(done.count).toBe(1);
    expect(await readMessageContent(conv, ack.serverId)).toBe(envelope);

    // Repetir el lote no vuelve a tocar la fila (idempotente).
    seeker.send({
      type: "reencrypt",
      items: [{ serverId: ack.serverId, envelope }],
    });
    const again = (await seeker.waitFor("reencrypted")) as Extract<
      ServerFrame,
      { type: "reencrypted" }
    >;
    expect(again.count).toBe(0);

    seeker.close();
  });
});

// Lee el `content` de un mensaje directamente del SQLite del DO.
async function readMessageContent(
  conversationId: string,
  serverId: string,
): Promise<string | null> {
  const stub = await getServerByName(env.Conversation, conversationId);
  return runInDurableObject(stub, (_instance, state) => {
    const rows = state.storage.sql
      .exec("SELECT content FROM messages WHERE server_id = ?", serverId)
      .toArray() as Array<{ content: string }>;
    return rows[0]?.content ?? null;
  });
}
