"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type ChatMessage,
  type ClientFrame,
  MAX_MESSAGE_LENGTH,
  type SenderRole,
  type ServerFrame,
} from "@/shared/chat-protocol";
import { ensureProChatToken } from "./actions";
import styles from "./chat.module.css";

type ConnStatus = "connecting" | "online" | "offline" | "error";

type Pending = { clientMsgId: string; content: string };

function wsUrl(conversationId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/parties/conversation/${conversationId}`;
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function mergeBySeq(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const bySeq = new Map<number, ChatMessage>();
  for (const m of prev) bySeq.set(m.seq, m);
  for (const m of incoming) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

export function ChatRoom({
  conversationId,
  role,
  otherName,
  open,
}: {
  conversationId: string;
  role: SenderRole;
  otherName: string;
  open: boolean;
}) {
  const [confirmed, setConfirmed] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherReadSeq, setOtherReadSeq] = useState(0);
  const [draft, setDraft] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const pendingRef = useRef<Pending[]>([]);
  const proReadyRef = useRef(false);
  const typingSentRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const sendRaw = useCallback((frame: ClientFrame): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }, []);

  const handleFrame = useCallback(
    (raw: unknown) => {
      if (typeof raw !== "string") return;
      let frame: ServerFrame;
      try {
        frame = JSON.parse(raw) as ServerFrame;
      } catch {
        return;
      }

      switch (frame.type) {
        case "history": {
          setConfirmed((prev) => mergeBySeq(prev, frame.messages));
          for (const m of frame.messages) {
            if (m.seq > lastSeqRef.current) lastSeqRef.current = m.seq;
          }
          break;
        }
        case "msg": {
          const m = frame.message;
          setConfirmed((prev) => mergeBySeq(prev, [m]));
          if (m.seq > lastSeqRef.current) lastSeqRef.current = m.seq;
          if (m.senderRole !== role) {
            setOtherTyping(false);
            // Acuse de lectura para la otra parte.
            sendRaw({ type: "read", upToSeq: m.seq });
          }
          break;
        }
        case "ack": {
          const found = pendingRef.current.find(
            (p) => p.clientMsgId === frame.clientMsgId,
          );
          setPending((prev) =>
            prev.filter((p) => p.clientMsgId !== frame.clientMsgId),
          );
          if (found) {
            setConfirmed((prev) =>
              mergeBySeq(prev, [
                {
                  serverId: frame.serverId,
                  seq: frame.seq,
                  serverTs: frame.serverTs,
                  senderRole: role,
                  content: found.content,
                },
              ]),
            );
          }
          if (frame.seq > lastSeqRef.current) lastSeqRef.current = frame.seq;
          break;
        }
        case "typing":
          if (frame.from !== role) setOtherTyping(frame.isTyping);
          break;
        case "presence":
          if (frame.role !== role) setOtherOnline(frame.online);
          break;
        case "read":
          setOtherReadSeq((prev) => Math.max(prev, frame.upToSeq));
          break;
        case "error":
          // Frames inválidos u otros errores no fatales: no rompemos la sala.
          break;
      }
    },
    [role, sendRaw],
  );

  // Conexión WebSocket con reintento exponencial + jitter y sync por delta.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (cancelled) return;

      // El profesional necesita su cookie HMAC antes de conectar.
      if (role === "professional" && !proReadyRef.current) {
        const res = await ensureProChatToken(conversationId).catch(() => ({
          ok: false,
        }));
        if (!res.ok) {
          if (!cancelled) setConn("error");
          return;
        }
        proReadyRef.current = true;
      }

      if (cancelled) return;
      setConn((c) => (c === "online" ? c : "connecting"));

      const ws = new WebSocket(wsUrl(conversationId));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempts = 0;
        setConn("online");
        // Recupera lo que se haya perdido y reenvía pendientes (dedup por id).
        sendRaw({ type: "sync", sinceSeq: lastSeqRef.current });
        for (const p of pendingRef.current) {
          ws.send(
            JSON.stringify({
              type: "send",
              clientMsgId: p.clientMsgId,
              content: p.content,
            } satisfies ClientFrame),
          );
        }
      };

      ws.onmessage = (event) => handleFrame(event.data);

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // noop
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConn("offline");
        const base = Math.min(15000, 500 * 2 ** attempts);
        const delay = base / 2 + Math.random() * (base / 2);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        wsRef.current?.close();
      } catch {
        // noop
      }
    };
  }, [conversationId, role, sendRaw, handleFrame]);

  // Auto-scroll al final cuando llegan o salen mensajes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll al cambiar mensajes
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [confirmed, pending, otherTyping]);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (typingSentRef.current === isTyping) return;
      typingSentRef.current = isTyping;
      sendRaw({ type: "typing", isTyping });
    },
    [sendRaw],
  );

  function onDraftChange(value: string) {
    setDraft(value);
    sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(false), 2500);
  }

  function submit() {
    const content = draft.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return;
    const clientMsgId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setPending((prev) => [...prev, { clientMsgId, content }]);
    setDraft("");
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTyping(false);
    sendRaw({ type: "send", clientMsgId, content });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const lastMineSeq = [...confirmed]
    .reverse()
    .find((m) => m.senderRole === role)?.seq;
  const presenceLabel = otherTyping
    ? "escribiendo…"
    : otherOnline
      ? "en línea"
      : conn === "online"
        ? "sin conexión ahora"
        : " ";

  return (
    <>
      <div className={styles.room}>
        <header className={styles.head}>
          <span className={styles.avatar} aria-hidden="true">
            {otherName.charAt(0).toUpperCase() || "·"}
          </span>
          <div className={styles.headText}>
            <h1 className={styles.name}>{otherName}</h1>
            <p
              className={`${styles.presence} ${
                otherOnline && !otherTyping ? styles.presenceOnline : ""
              }`}
            >
              {presenceLabel}
            </p>
          </div>
        </header>

        {conn !== "online" ? (
          <div className={styles.banner}>
            {conn === "error"
              ? "No pudimos abrir la conversación segura."
              : conn === "connecting"
                ? "Conectando…"
                : "Sin conexión. Reintentando…"}
          </div>
        ) : null}

        <div className={styles.messages} ref={listRef}>
          {confirmed.length === 0 && pending.length === 0 ? (
            <p className={styles.empty}>
              {role === "professional"
                ? "Aquí verás los mensajes de la persona. Escribe para romper el hielo."
                : "Este es un espacio privado. Escribe cuando te sientas listo/a."}
            </p>
          ) : null}

          {confirmed.map((m) => {
            const mine = m.senderRole === role;
            return (
              <div
                key={m.serverId}
                className={`${styles.row} ${mine ? styles.mine : styles.theirs}`}
              >
                <div>
                  <div
                    className={`${styles.bubble} ${
                      mine ? styles.bubbleMine : styles.bubbleTheirs
                    }`}
                  >
                    {m.content}
                  </div>
                  <div
                    className={`${styles.meta} ${mine ? "" : styles.metaTheirs}`}
                  >
                    <span>{formatTime(m.serverTs)}</span>
                    {mine && m.seq === lastMineSeq && otherReadSeq >= m.seq ? (
                      <span>Leído</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {pending.map((p) => (
            <div
              key={p.clientMsgId}
              className={`${styles.row} ${styles.mine} ${styles.pending}`}
            >
              <div>
                <div className={`${styles.bubble} ${styles.bubbleMine}`}>
                  {p.content}
                </div>
                <div className={styles.meta}>
                  <span>{conn === "online" ? "Enviando…" : "En espera"}</span>
                </div>
              </div>
            </div>
          ))}

          {otherTyping ? (
            <div className={styles.typing}>{otherName} está escribiendo…</div>
          ) : null}
        </div>

        {open ? (
          <div className={styles.composer}>
            <textarea
              className={styles.textarea}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => sendTyping(false)}
              placeholder="Escribe un mensaje…"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              aria-label="Escribe un mensaje"
            />
            <button
              type="button"
              className={`button human ${styles.sendBtn}`}
              onClick={submit}
              disabled={!draft.trim()}
            >
              Enviar
            </button>
          </div>
        ) : (
          <div className={styles.closed}>
            Esta conversación está cerrada. Gracias por haber estado aquí.
          </div>
        )}
      </div>

      <p className={styles.safety}>
        Conversación privada entre ustedes dos. Por tu seguridad, evita compartir
        datos que te identifiquen (dirección exacta, documentos). Si estás en
        peligro ahora,{" "}
        <a href="/emergencia">mira qué hacer</a>.
      </p>
    </>
  );
}
