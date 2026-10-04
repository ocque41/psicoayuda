import { env, runInDurableObject, SELF } from "cloudflare:test";
import { getServerByName } from "partyserver";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

function proCookie(conversationId: string) {
  const token = mintProfessionalToken(
    {
      professionalId: "pro_1",
      authSessionId: "auth_1",
      userId: "user_1",
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
  closed: Promise<number>;
};

function wrap(ws: WebSocket): Client {
  const inbox: ServerFrame[] = [];
  const waiters: Array<(f: ServerFrame) => void> = [];
  const closed = new Promise<number>((resolve) => {
    ws.addEventListener("close", (event: CloseEvent) => resolve(event.code));
  });
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
    closed,
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

type InternalChatEvent = {
  kind: string;
  conversationId: string;
  lastMessageAt?: number;
  lastMessageRole?: string;
  responseDeltaMs?: number;
};
async function internalCalls(conversationId: string) {
  const response = await SELF.fetch("https://internal.test/__nido-calls");
  const calls = await response.json<InternalChatEvent[]>();
  return calls.filter((call) => call.conversationId === conversationId);
}

// El fetch global del DO no se dirige a SELF automáticamente. La URL ficticia
// nunca debe salir a DNS/red: este interceptor recorre el handler de prueba real
// y permite comprobar la entrega, no solo la intención guardada en meta.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (
        url.origin === "https://internal.test" &&
        url.pathname === "/api/internal/chat-event"
      )
        return SELF.fetch(request);
      throw new Error(
        `Salida de red inesperada en la prueba: ${url.origin}${url.pathname}`,
      );
    },
  );
});
afterAll(() => vi.unstubAllGlobals());

describe("chat Durable Object (runtime de Workers)", () => {
  it.each([
    "seeker",
    "professional",
  ] as const)("bloquea una conexión %s ya abierta si falla D1", async (role) => {
    const conv = `conv_live_failure_${role}`;
    const client = await open(
      conv,
      role === "seeker" ? seekerCookie(conv) : proCookie(conv),
    );
    await client.waitFor("history");
    const stub = await getServerByName(env.Conversation, conv);
    await runInDurableObject(stub, (instance) => {
      const runtime = instance as unknown as { env: { DB: D1Database } };
      runtime.env.DB = {
        prepare: () => {
          throw new Error("unavailable");
        },
      } as unknown as D1Database;
    });
    client.send({
      type: "send",
      clientMsgId: "denied",
      content: "Dato ficticio",
    });
    expect(await client.closed).toBe(4003);
    expect(
      await runInDurableObject(
        stub,
        (_instance, state) =>
          state.storage.sql.exec("SELECT COUNT(*) AS count FROM messages").one()
            .count,
      ),
    ).toBe(0);
  });

  it("bloquea el envío tras el borrado aunque el aviso de desconexión no llegue", async () => {
    const conv = "conv_live_deleted";
    const client = await open(conv, seekerCookie(conv));
    await client.waitFor("history");
    const stub = await getServerByName(env.Conversation, conv);
    await runInDurableObject(stub, (instance) => {
      const runtime = instance as unknown as { env: { DB: D1Database } };
      runtime.env.DB = {
        prepare: () => ({
          bind: () => ({
            first: async () => ({
              status: "deleted",
              revoked_at: null,
              expires_at: Date.now() + 3600000,
              deleted_at: Date.now(),
              anonymized_at: null,
            }),
          }),
        }),
      } as unknown as D1Database;
    });
    client.send({
      type: "send",
      clientMsgId: "after-delete",
      content: "Dato ficticio",
    });
    expect(await client.closed).toBe(4003);
    expect(
      await runInDurableObject(
        stub,
        (_instance, state) =>
          state.storage.sql.exec("SELECT COUNT(*) AS count FROM messages").one()
            .count,
      ),
    ).toBe(0);
  });

  it("conserva el orden del mismo emisor cuando la verificación necesita esperar", async () => {
    const conv = "conv_live_order";
    const client = await open(conv, seekerCookie(conv));
    await client.waitFor("history");
    const stub = await getServerByName(env.Conversation, conv);
    await runInDurableObject(stub, (instance) => {
      let reads = 0;
      const runtime = instance as unknown as { env: { DB: D1Database } };
      runtime.env.DB = {
        prepare: () => ({
          bind: () => ({
            first: async () => {
              if (++reads === 1)
                await new Promise((resolve) => setTimeout(resolve, 30));
              return {
                status: "open",
                revoked_at: null,
                expires_at: Date.now() + 3600000,
                deleted_at: null,
                anonymized_at: null,
              };
            },
          }),
        }),
      } as unknown as D1Database;
    });
    client.send({
      type: "send",
      clientMsgId: "first",
      content: "Primero ficticio",
    });
    client.send({
      type: "send",
      clientMsgId: "second",
      content: "Segundo ficticio",
    });
    await client.waitFor("ack");
    await client.waitFor("ack");
    expect(
      await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql
          .exec("SELECT content FROM messages ORDER BY seq")
          .toArray()
          .map((row) => row.content),
      ),
    ).toEqual(["Primero ficticio", "Segundo ficticio"]);
    client.close();
  });

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

    await expect
      .poll(() => internalCalls(conv))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "message-meta",
            conversationId: conv,
            lastMessageRole: "seeker",
            lastMessageAt: expect.any(Number),
          }),
          expect.objectContaining({
            kind: "message-meta",
            conversationId: conv,
            lastMessageRole: "professional",
            lastMessageAt: expect.any(Number),
          }),
          expect.objectContaining({
            kind: "response-sample",
            conversationId: conv,
            responseDeltaMs: expect.any(Number),
          }),
        ]),
      );
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

    await expect
      .poll(() => internalCalls(conv))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "notify-message",
            conversationId: conv,
          }),
          expect.objectContaining({
            kind: "response-sample",
            conversationId: conv,
            responseDeltaMs: expect.any(Number),
          }),
          expect.objectContaining({
            kind: "message-meta",
            conversationId: conv,
            lastMessageRole: "professional",
          }),
        ]),
      );
    seeker.close();
    pro.close();
  });

  it("entrega el aviso al paciente desconectado sin enviar contenido del mensaje", async () => {
    const conv = "conv_notify_seeker";
    const pro = await open(conv, proCookie(conv));
    await pro.waitFor("history");
    pro.send({
      type: "send",
      clientMsgId: "offline_seeker_1",
      content: "Mensaje ficticio que debe permanecer en el DO",
    });
    await pro.waitFor("ack");
    await expect
      .poll(() => internalCalls(conv))
      .toEqual(
        expect.arrayContaining([
          { kind: "notify-seeker", conversationId: conv },
          expect.objectContaining({
            kind: "message-meta",
            conversationId: conv,
            lastMessageRole: "professional",
          }),
        ]),
      );
    const callbacks = await internalCalls(conv);
    expect(JSON.stringify(callbacks)).not.toContain("Mensaje ficticio");
    pro.close();
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

describe("observadores de bandeja privados", () => {
  it("sólo reciben actividad, sin historial, claves, contenido ni presencia", async () => {
    const room = "inbox-metadata-fixture";
    const now = Date.now();
    const token = mintProfessionalInboxToken(
      {
        professionalId: "pro_1",
        authSessionId: "auth_1",
        userId: "user_1",
        role: "inbox",
        iat: now,
        exp: now + HOUR,
      },
      SECRET,
    );
    const response = await SELF.fetch(
      `https://internal.test/parties/conversation/${room}?avisos=1`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: `${PRO_INBOX_COOKIE}=${token}`,
        },
      },
    );
    expect(response.status).toBe(101);
    const observer = wrap(response.webSocket as unknown as WebSocket);
    const seeker = await open(room, seekerCookie(room));
    await seeker.waitFor("history");
    await seeker.waitFor("keys");
    const identity = await toConversationIdentity(
      await generateIdentityKeyPair(),
    );
    seeker.send({ type: "key", publicKey: identity.publicKey });
    seeker.send({ type: "typing", isTyping: true });
    seeker.send({ type: "read", upToSeq: 1 });
    const ciphertext = await createEnvelope({
      identity,
      peerPublicKey: identity.publicKey,
      conversationId: room,
      senderRole: "seeker",
      plaintext: "Mensaje ficticio",
    });
    seeker.send({
      type: "send",
      clientMsgId: "fixture-message",
      content: ciphertext,
    });
    const activity = await observer.waitFor("activity");
    expect(activity).toEqual({
      type: "activity",
      role: "seeker",
      at: expect.any(Number),
    });
    expect(observer.buffered()).toEqual([]);
    observer.send({
      type: "send",
      clientMsgId: "forbidden-observer-write",
      content: "Ficticio",
    });
    await settle();
    const stub = await getServerByName(env.Conversation, room);
    const count = await runInDurableObject(
      stub,
      (_instance, state) =>
        state.storage.sql.exec("SELECT COUNT(*) AS c FROM messages").one().c,
    );
    expect(count).toBe(1);
    expect(await readMeta(room, "last_notify_at")).toBeGreaterThan(0);
    observer.close();
    seeker.close();
  });

  it("avisos sin token no caen al canal normal y un header público no activa el observador", async () => {
    const room = "inbox-no-fallback-fixture";
    const rejected = await SELF.fetch(
      `https://internal.test/parties/conversation/${room}?avisos=1`,
      { headers: { Upgrade: "websocket", Cookie: proCookie(room) } },
    );
    expect(rejected.status).toBe(403);
    const regular = await openWith(room, seekerCookie(room), {
      "x-nido-informer": "1",
      "x-nido-inbox-exp": String(Date.now() + HOUR),
    });
    expect((await regular.waitFor("history")).type).toBe("history");
    regular.close();
  });

  it("revoca un observador conectado antes de enviar nuevos metadatos", async () => {
    const room = "inbox-revocation-fixture";
    const now = Date.now();
    const token = mintProfessionalInboxToken(
      {
        professionalId: "pro_1",
        authSessionId: "auth_1",
        userId: "user_1",
        role: "inbox",
        iat: now,
        exp: now + HOUR,
      },
      SECRET,
    );
    const response = await SELF.fetch(
      `https://internal.test/parties/conversation/${room}?avisos=1`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: `${PRO_INBOX_COOKIE}=${token}`,
        },
      },
    );
    expect(response.status).toBe(101);
    const observer = wrap(response.webSocket as unknown as WebSocket);
    const seeker = await open(room, seekerCookie(room));
    await seeker.waitFor("history");
    const stub = await getServerByName(env.Conversation, room);
    await runInDurableObject(stub, (instance) => {
      const runtime = instance as unknown as { env: { DB: D1Database } };
      runtime.env.DB = {
        prepare: (query: string) => ({
          bind: () => ({
            first: async () =>
              query.includes("professional_status")
                ? null // El JOIN de la sala ajena no devuelve una fila autorizada.
                : {
                    status: "open",
                    revoked_at: null,
                    expires_at: Date.now() + HOUR,
                    deleted_at: null,
                    anonymized_at: null,
                  },
          }),
        }),
      } as unknown as D1Database;
    });
    seeker.send({
      type: "send",
      clientMsgId: "revoked-observer",
      content: "Mensaje ficticio legado",
    });
    expect(await observer.closed).toBe(4003);
    expect(observer.buffered()).toEqual([]);
    seeker.close();
  });
});

it("un destinatario profesional revocado no recibe contenido de nuevos mensajes", async () => {
  const room = "revoked-recipient-fixture";
  const pro = await open(room, proCookie(room));
  await pro.waitFor("history");
  await pro.waitFor("keys");
  const seeker = await open(room, seekerCookie(room));
  await seeker.waitFor("history");
  await seeker.waitFor("keys");
  await settle();
  const stub = await getServerByName(env.Conversation, room);
  await runInDurableObject(stub, (instance) => {
    const runtime = instance as unknown as { env: { DB: D1Database } };
    runtime.env.DB = {
      prepare: (query: string) => ({
        bind: () => ({
          first: async () =>
            query.includes("professional_status")
              ? {
                  professional_status: "suspended",
                  conversation_status: "open",
                  deleted_at: null,
                  anonymized_at: null,
                }
              : {
                  status: "open",
                  revoked_at: null,
                  expires_at: Date.now() + HOUR,
                  deleted_at: null,
                  anonymized_at: null,
                },
        }),
      }),
    } as unknown as D1Database;
  });
  seeker.send({
    type: "send",
    clientMsgId: "fixture-after-revocation",
    content: "Mensaje ficticio legado",
  });
  expect(await pro.closed).toBe(4003);
  expect(pro.buffered().filter((frame) => frame.type === "msg")).toEqual([]);
  seeker.close();
});

it.each([
  "revocada",
  "expirada",
])("sesión BetterAuth %s cierra participante e inbox ya conectados sin contenido ni avisos", async (kind) => {
  const room = `auth-session-${kind}-fixture`;
  const pro = await open(room, proCookie(room));
  await pro.waitFor("history");
  await pro.waitFor("keys");
  const now = Date.now();
  const token = mintProfessionalInboxToken(
    {
      professionalId: "pro_1",
      authSessionId: "auth_1",
      userId: "user_1",
      role: "inbox",
      iat: now,
      exp: now + HOUR,
    },
    SECRET,
  );
  const response = await SELF.fetch(
    `https://internal.test/parties/conversation/${room}?avisos=1`,
    {
      headers: { Upgrade: "websocket", Cookie: `${PRO_INBOX_COOKIE}=${token}` },
    },
  );
  expect(response.status).toBe(101);
  const observer = wrap(response.webSocket as unknown as WebSocket);
  const seeker = await open(room, seekerCookie(room));
  await seeker.waitFor("history");
  await seeker.waitFor("keys");
  await settle();
  const stub = await getServerByName(env.Conversation, room);
  await runInDurableObject(stub, (instance) => {
    const runtime = instance as unknown as { env: { DB: D1Database } };
    // Transporte D1 explícito; las consultas con filas reales están en
    // chat-session-grants. Aquí sí son reales DO, WS y SQLite de mensajes.
    runtime.env.DB = {
      prepare: (query) => ({
        bind: () => ({
          first: async () =>
            query.includes("professional_status")
              ? kind === "revocada"
                ? null
                : {
                    conversation_status: "open",
                    professional_status: "approved",
                    auth_session_expires_at: Date.now() - 1,
                    deleted_at: null,
                    anonymized_at: null,
                  }
              : {
                  status: "open",
                  revoked_at: null,
                  expires_at: Date.now() + HOUR,
                  deleted_at: null,
                  anonymized_at: null,
                },
        }),
      }),
    } as unknown as D1Database;
  });
  seeker.send({
    type: "send",
    clientMsgId: "fictional-after-auth-revocation",
    content: "Mensaje ficticio tras salida",
  });
  expect(await pro.closed).toBe(4003);
  expect(await observer.closed).toBe(4003);
  expect(pro.buffered().filter((frame) => frame.type === "msg")).toEqual([]);
  expect(observer.buffered()).toEqual([]);
  seeker.close();
});

it("una sesión BetterAuth revocada corta send de socket abierto sin escribir mensaje", async () => {
  const room = "auth-revoked-sender-fixture";
  const pro = await open(room, proCookie(room));
  await pro.waitFor("history");
  await pro.waitFor("keys");
  const stub = await getServerByName(env.Conversation, room);
  await runInDurableObject(stub, (instance) => {
    const runtime = instance as unknown as { env: { DB: D1Database } };
    runtime.env.DB = {
      prepare: () => ({ bind: () => ({ first: async () => null }) }),
    } as unknown as D1Database;
  });
  pro.send({
    type: "send",
    clientMsgId: "fictional-revoked-send",
    content: "Texto ficticio que debe rechazarse",
  });
  expect(await pro.closed).toBe(4003);
  const count = await runInDurableObject(stub, (_instance, state) =>
    Number(
      (
        state.storage.sql.exec("SELECT count(*) AS n FROM messages").one() as {
          n: number;
        }
      ).n,
    ),
  );
  expect(count).toBe(0);
});
