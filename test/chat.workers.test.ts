import { fetchMock, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mintProfessionalToken,
  mintSeekerToken,
  PRO_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
import type { ClientFrame, ServerFrame } from "@/shared/chat-protocol";

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

const internalCalls: Array<Record<string, unknown>> = [];

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock
    .get("https://internal.test")
    .intercept({ path: "/api/internal/chat-event", method: "POST" })
    .reply(200, (opts) => {
      try {
        internalCalls.push(
          JSON.parse(opts.body as string) as Record<string, unknown>,
        );
      } catch {
        // ignore
      }
      return { ok: true };
    })
    .persist();
});

afterAll(() => {
  fetchMock.deactivate();
});

async function settle(ms = 60) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

  it("entrega mensajes en tiempo real entre seeker y profesional", async () => {
    const conv = "conv_rt";
    const seeker = await open(conv, seekerCookie(conv));
    const pro = await open(conv, proCookie(conv));
    await seeker.waitFor("history");
    await pro.waitFor("history");

    // seeker -> pro
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

    // pro -> seeker
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

    // Reenvío idéntico: mismo ack (mismo seq), el pro NO recibe otro msg.
    seeker.send({ type: "send", clientMsgId: "dup", content: "uno" });
    const ackB = (await seeker.waitFor("ack")) as Extract<
      ServerFrame,
      { type: "ack" }
    >;
    expect(ackB.seq).toBe(ackA.seq);

    // Mensaje siguiente con seq+1 prueba que en medio no hubo duplicado.
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

  it("avisa por email cuando el profesional está OFFLINE y captura el tiempo de respuesta", async () => {
    internalCalls.length = 0;
    const conv = "conv_notify";
    const seeker = await open(conv, seekerCookie(conv));
    await seeker.waitFor("history");

    // Profesional NO conectado -> debe dispararse notify-message.
    seeker.send({ type: "send", clientMsgId: "n1", content: "¿hay alguien?" });
    await seeker.waitFor("ack");
    await settle();
    expect(internalCalls.some((c) => c.kind === "notify-message")).toBe(true);

    // El profesional entra y responde -> muestra de tiempo de respuesta.
    const pro = await open(conv, proCookie(conv));
    await pro.waitFor("history");
    pro.send({ type: "send", clientMsgId: "r1", content: "sí, aquí estoy" });
    await pro.waitFor("ack");
    await settle();
    const sample = internalCalls.find((c) => c.kind === "response-sample");
    expect(sample).toBeDefined();
    expect(typeof sample?.responseDeltaMs).toBe("number");

    seeker.close();
    pro.close();
  });
});
