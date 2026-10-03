"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  publishProIdentityKey,
  saveRecoveryKeystore,
} from "@/app/actions-e2ee";
import { ConversationDeleteButton } from "@/components/conversation-delete-button";
import { E2eeBackupModal } from "@/components/e2ee-backup-modal";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft-storage";
import {
  createRecoveryBackup,
  getOrCreateIdentity,
  getStoredRecoveryCode,
  loadIdentity,
  PRO_SLOT,
  refreshRecoveryBackup,
  replaceIdentity,
  seekerSlot,
} from "@/lib/e2ee-client";
import {
  type ChatMessage,
  type ClientFrame,
  MAX_MESSAGE_LENGTH,
  REENCRYPT_BATCH_MAX,
  type SenderRole,
  type ServerFrame,
} from "@/shared/chat-protocol";
import {
  type ConversationIdentity,
  createEnvelope,
  isEnvelope,
  openEnvelope,
  parseEnvelope,
} from "@/shared/e2ee";
import {
  ensureProChatToken,
  renewSeekerChatToken,
  reopenConversation,
} from "./actions";
import styles from "./chat.module.css";
import { nextHistorySyncCursor } from "./chat-history";
import { E2eeRestorePanel } from "./e2ee-restore-panel";

type ConnStatus = "connecting" | "online" | "offline" | "error";

// El borrador sin enviar es contenido sensible: lo guardamos para no perderlo al
// cerrar, pero con caducidad para que no quede indefinidamente en un dispositivo
// compartido (la sala ya está gateada por cookie, pero esto acota el residuo).
const CHAT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FOLLOW_BOTTOM_DISTANCE = 96;

type ReadingAnchor = { seq: string; offset: number };
type DecryptionContext = {
  identity: ConversationIdentity | null;
  conversationId: string;
  slot: string;
  role: SenderRole;
};

function readingAnchor(el: HTMLElement): ReadingAnchor | null {
  const rows = el.querySelectorAll<HTMLElement>("[data-message-seq]");
  const top = el.getBoundingClientRect().top;
  // Las filas están ordenadas: localizar la primera visible evita medir todo
  // el historial en cada scroll, incluso después de cargar varias páginas.
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].getBoundingClientRect().bottom <= top) low = middle + 1;
    else high = middle;
  }
  const row = rows[low];
  const seq = row?.dataset.messageSeq;
  return row && seq
    ? { seq, offset: row.getBoundingClientRect().top - top }
    : null;
}

type Pending = { clientMsgId: string; content: string; envelope: string };

function wsUrl(conversationId: string, asPersona: boolean): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const query = asPersona ? "?como=persona" : "";
  return `${proto}//${window.location.host}/parties/conversation/${conversationId}${query}`;
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

function mergeBySeq(
  prev: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const bySeq = new Map<number, ChatMessage>();
  for (const m of prev) bySeq.set(m.seq, m);
  for (const m of incoming) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

// Mensaje humano por motivo de fallo al reabrir (nunca el código crudo).
function reopenErrorMessage(reason: string): string {
  switch (reason) {
    case "no_capacity":
      return "En este momento tu acompañante no tiene espacio para retomar la conversación. Inténtalo más tarde.";
    case "anonymized":
      return "Esta conversación ya fue anonimizada por privacidad y no puede reabrirse.";
    case "not_authorized":
      return "No pudimos verificar que seas parte de esta conversación.";
    case "unavailable":
      return "Este caso ya está siendo acompañado por otra persona. Si necesitas apoyo, puedes pedirlo de nuevo.";
    default:
      return "No se pudo reabrir. Actualiza la página e inténtalo de nuevo.";
  }
}

// Mensaje humano por error del servidor al enviar/re-cifrar.
function sendErrorMessage(code: string): string {
  switch (code) {
    case "conversation_full":
      return "Esta conversación alcanzó el límite de mensajes. Crea una nueva para seguir hablando.";
    case "rate_limited":
      return "Enviaste demasiados mensajes seguidos. Espera unos segundos e inténtalo de nuevo.";
    case "conversation_closed":
      return "La conversación está cerrada. Reábrela para seguir escribiendo.";
    default:
      return "No pudimos enviar el mensaje. Inténtalo de nuevo.";
  }
}

/** La clave de la contraparte, según los sobres ya vistos (para el
 *  profesional: la persona todavía no está en `keys` del DO). */
function peerPubFromMessages(
  messages: ChatMessage[],
  myPub: string | null,
): string | null {
  if (!myPub) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const envelope = parseEnvelope(message.content);
    if (!envelope) continue;
    if (envelope.p === myPub) return envelope.q;
    if (envelope.q === myPub) return envelope.p;
  }
  return null;
}

export function ChatRoom({
  conversationId,
  role,
  otherName,
  open,
  canSwitchView = false,
  paymentLinks = [],
  proPublicKey = null,
}: {
  conversationId: string;
  role: SenderRole;
  otherName: string;
  open: boolean;
  // El visitante tiene a la vez credencial de profesional y de la persona:
  // puede alternar la vista. Sin esto (caso normal) no hay nada que elegir.
  canSwitchView?: boolean;
  // Paquetes de pago del profesional (solo llegan en su rol): permiten insertar
  // el link de pago en el mensaje, atado a esta conversación.
  paymentLinks?: { id: string; title: string; priceLabel: string }[];
  // Clave pública E2EE del profesional (la persona la necesita para cifrar).
  proPublicKey?: string | null;
}) {
  // El profesional puede estar viendo la sala como la persona. En ese caso TODO
  // (WebSocket, reabrir, borrar) actúa con la identidad de la persona: lo que
  // escribe se registra como suyo y el caso se cierra en vez de reencolarse.
  const writeAsPersona = role === "seeker" && canSwitchView;
  const [confirmed, setConfirmed] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherReadSeq, setOtherReadSeq] = useState(0);
  const [draft, setDraft] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [sendError, setSendError] = useState("");
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const router = useRouter();

  // ---- E2EE: identidad local, clave de la contraparte y estado de los sobres.
  const [identity, setIdentity] = useState<ConversationIdentity | null>(null);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [restoreNeeded, setRestoreNeeded] = useState(false);
  const [historyStats, setHistoryStats] = useState<{
    count: number;
    envelopes: number;
  } | null>(null);
  const [wsKeys, setWsKeys] = useState<{
    seeker?: string;
    professional?: string;
  }>({});
  const [decrypted, setDecrypted] = useState<Record<string, string | null>>({});
  const [backupCode, setBackupCode] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const pendingSyncCursorRef = useRef<number | null>(null);
  const lastReadSentRef = useRef(0);
  const acknowledgeVisibleRef = useRef<() => void>(() => {});
  const pendingRef = useRef<Pending[]>([]);
  const proReadyRef = useRef(false);
  const seekerReadyRef = useRef(false);
  const typingSentRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const listRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const identityRef = useRef<ConversationIdentity | null>(null);
  const historyStatsSetRef = useRef(false);
  const decryptingRef = useRef(new Set<string>());
  const decryptionContextRef = useRef<DecryptionContext | null>(null);
  const migrateTriedRef = useRef(new Set<string>());
  const followingBottomRef = useRef(true);
  const forceBottomRef = useRef(false);
  const readingAnchorRef = useRef<ReadingAnchor | null>(null);
  const pageScrollRef = useRef<{ height: number; top: number } | null>(null);
  const observedSeqRef = useRef(0);

  const slot = role === "professional" ? PRO_SLOT : seekerSlot(conversationId);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useLayoutEffect(() => {
    const context = { identity, conversationId, slot, role };
    decryptionContextRef.current = context;
    decryptingRef.current = new Set();
    // Una clave/contexto distinto no hereda plaintext de la época anterior.
    setDecrypted((previous) =>
      Object.keys(previous).length > 0 ? {} : previous,
    );
    return () => {
      if (decryptionContextRef.current === context) {
        decryptionContextRef.current = null;
      }
    };
  }, [identity, conversationId, slot, role]);

  // Borrador del compositor: sobrevive a cerrar la pestaña, en este dispositivo.
  // El historial ya vive en el servidor; esto solo cuida lo aún no enviado.
  useEffect(() => {
    const saved = loadDraft<string>(
      `nido:chat-draft:${conversationId}`,
      CHAT_DRAFT_TTL_MS,
    );
    if (saved) setDraft(saved);
  }, [conversationId]);

  useEffect(() => {
    const key = `nido:chat-draft:${conversationId}`;
    if (draft) saveDraft(key, draft);
    else clearDraft(key);
  }, [draft, conversationId]);

  // ---- Identidad E2EE de este dispositivo ----------------------------------

  const ensureBackup = useCallback(async (kind: "professional" | "seeker") => {
    const storedCode = await getStoredRecoveryCode();
    if (storedCode) {
      // Ya respaldó antes: se re-cifra el keystore completo (incluye la clave
      // nueva) con el MISMO código y se actualiza el respaldo en el servidor.
      const refreshed = await refreshRecoveryBackup();
      if (refreshed) {
        await saveRecoveryKeystore(refreshed.id, refreshed.wrapped, kind);
      }
      return null;
    }
    const created = await createRecoveryBackup();
    if (!created) return null;
    await saveRecoveryKeystore(created.id, created.wrapped, kind);
    return created.code;
  }, []);

  const setupIdentity = useCallback(
    async (idn: ConversationIdentity) => {
      if (role === "professional") {
        void publishProIdentityKey(idn.publicKey);
      }
      const code = await ensureBackup(
        role === "professional" ? "professional" : "seeker",
      );
      if (code) setBackupCode(code);
    },
    [role, ensureBackup],
  );

  useEffect(() => {
    let cancelled = false;
    setIdentity(null);
    setRestoreNeeded(false);
    setKeysLoaded(false);
    setHistoryStats(null);
    historyStatsSetRef.current = false;
    decryptingRef.current = new Set();
    migrateTriedRef.current = new Set();
    setDecrypted({});
    void (async () => {
      const existing = await loadIdentity(slot);
      if (cancelled) return;
      if (existing) {
        setIdentity(existing);
        if (role === "professional") {
          if (!proPublicKey) {
            // La cuenta aún no tiene clave pública: publica la de este
            // dispositivo (p. ej. un intento anterior no llegó a guardarse).
            void publishProIdentityKey(existing.publicKey);
          } else if (existing.publicKey !== proPublicKey) {
            // Otra clave distinta en la cuenta: hay que decidir con el panel.
            setRestoreNeeded(true);
          }
        }
      } else if (role === "professional" && proPublicKey) {
        // La cuenta ya tiene clave (otro dispositivo) pero esta no: restaurar
        // con el código o rotar (con advertencia). Nunca rotar en silencio.
        setRestoreNeeded(true);
      }
      setKeysLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [slot, role, proPublicKey]);

  // Con el historial inicial delante decidimos: si hay sobres y no hay clave,
  // restaurar; si no hay nada cifrado, generar identidad nueva en silencio.
  useEffect(() => {
    if (!keysLoaded || identity || restoreNeeded) return;
    if (role === "professional" && proPublicKey) return;
    if (historyStats === null) return;
    if (historyStats.envelopes > 0) {
      setRestoreNeeded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { identity: created, created: isNew } =
        await getOrCreateIdentity(slot);
      if (cancelled) return;
      setIdentity(created);
      if (isNew) await setupIdentity(created);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    keysLoaded,
    identity,
    restoreNeeded,
    historyStats,
    role,
    proPublicKey,
    slot,
    setupIdentity,
  ]);

  const reloadIdentity = useCallback(async (): Promise<boolean> => {
    const restored = await loadIdentity(slot);
    if (!restored) return false;
    setIdentity(restored);
    setRestoreNeeded(false);
    if (role === "professional" && restored.publicKey !== proPublicKey) {
      void publishProIdentityKey(restored.publicKey);
    }
    return true;
  }, [slot, role, proPublicKey]);

  const useNewKeys = useCallback(async () => {
    const { identity: created } = await replaceIdentity(slot);
    setIdentity(created);
    setRestoreNeeded(false);
    await setupIdentity(created);
  }, [slot, setupIdentity]);

  // ---- Mensajes ------------------------------------------------------------

  const sendRaw = useCallback((frame: ClientFrame): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }, []);

  const requestSync = useCallback(() => {
    const previous = pendingSyncCursorRef.current;
    const cursor = previous ?? lastSeqRef.current;
    // Mantener la página pendiente también al reconectar: la foto reciente
    // puede haber adelantado lastSeq sin que el tramo intermedio haya llegado.
    pendingSyncCursorRef.current = cursor;
    if (!sendRaw({ type: "sync", sinceSeq: cursor })) {
      pendingSyncCursorRef.current = previous;
    }
  }, [sendRaw]);

  // Publica la clave pública E2EE de este dispositivo (idempotente) para que la
  // contraparte pueda cifrar. Se repite en cada reconexión.
  const publishKey = useCallback(() => {
    const idn = identityRef.current;
    if (!idn) return;
    sendRaw({ type: "key", publicKey: idn.publicKey });
  }, [sendRaw]);

  useEffect(() => {
    if (identity && conn === "online") publishKey();
  }, [identity, conn, publishKey]);

  const peerKey = useMemo(() => {
    if (role === "seeker") {
      return proPublicKey ?? wsKeys.professional ?? null;
    }
    return wsKeys.seeker ?? peerPubFromMessages(confirmed, proPublicKey);
  }, [role, proPublicKey, wsKeys, confirmed]);

  const e2eeReady = identity !== null && peerKey !== null;

  const acknowledgeVisibleMessages = useCallback(() => {
    const el = listRef.current;
    if (
      !el ||
      !identity ||
      restoreNeeded ||
      backupCode !== null ||
      document.visibilityState !== "visible" ||
      document.querySelector("dialog[open]") ||
      !followingBottomRef.current ||
      el.scrollHeight - el.clientHeight - el.scrollTop > FOLLOW_BOTTOM_DISTANCE
    ) {
      return;
    }
    for (let index = confirmed.length - 1; index >= 0; index -= 1) {
      const message = confirmed[index];
      if (message.seq <= lastReadSentRef.current) return;
      if (message.senderRole === role) continue;
      if (
        isEnvelope(message.content) &&
        typeof decrypted[message.serverId] !== "string"
      ) {
        continue;
      }
      if (sendRaw({ type: "read", upToSeq: message.seq })) {
        lastReadSentRef.current = message.seq;
      }
      return;
    }
  }, [
    confirmed,
    decrypted,
    identity,
    restoreNeeded,
    backupCode,
    role,
    sendRaw,
  ]);

  useLayoutEffect(() => {
    acknowledgeVisibleRef.current = acknowledgeVisibleMessages;
  }, [acknowledgeVisibleMessages]);

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
          if (frame.mode === "page" && listRef.current) {
            // Tomar la posición al recibir la página, no al pedirla: la persona
            // puede seguir desplazándose mientras espera la red.
            const el = listRef.current;
            pageScrollRef.current = {
              height: el.scrollHeight,
              top: el.scrollTop,
            };
            readingAnchorRef.current = readingAnchor(el);
          }
          setConfirmed((prev) => mergeBySeq(prev, frame.messages));
          for (const m of frame.messages) {
            if (m.seq > lastSeqRef.current) lastSeqRef.current = m.seq;
          }
          if (!historyStatsSetRef.current) {
            historyStatsSetRef.current = true;
            setHistoryStats({
              count: frame.messages.length,
              envelopes: frame.messages.filter((m) => isEnvelope(m.content))
                .length,
            });
          }
          if (frame.mode === "page") {
            setHasOlder(frame.hasMore);
            setLoadingOlder(false);
          } else if (frame.mode !== "sync") {
            setHasOlder(frame.hasMore);
          } else {
            const cursor = nextHistorySyncCursor(frame);
            pendingSyncCursorRef.current = cursor;
            if (cursor !== null) {
              // El history inicial puede haber adelantado el máximo global:
              // continuar desde esta página evita dejar un hueco en el medio.
              requestSync();
            }
          }
          break;
        }
        case "msg": {
          const m = frame.message;
          setConfirmed((prev) => mergeBySeq(prev, [m]));
          if (m.seq > lastSeqRef.current) lastSeqRef.current = m.seq;
          if (m.senderRole !== role) {
            setOtherTyping(false);
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
                  content: found.envelope,
                },
              ]),
            );
          }
          if (frame.seq > lastSeqRef.current) lastSeqRef.current = frame.seq;
          break;
        }
        case "keys":
          setWsKeys(frame.keys);
          break;
        case "reencrypted":
          setMigrating(false);
          break;
        case "typing":
          if (frame.from !== role) setOtherTyping(frame.isTyping);
          break;
        case "presence":
          if (frame.role !== role) {
            if (frame.online) {
              lastReadSentRef.current = 0;
              requestAnimationFrame(() => acknowledgeVisibleRef.current());
            }
            setOtherOnline(frame.online);
          }
          break;
        case "read":
          setOtherReadSeq((prev) => Math.max(prev, frame.upToSeq));
          break;
        case "error":
          setSendError(sendErrorMessage(frame.code));
          break;
      }
    },
    [role, requestSync],
  );

  // Descifra los sobres que van llegando (historial, sync, mensajes nuevos).
  useEffect(() => {
    if (!identity) return;
    const context = decryptionContextRef.current;
    if (
      !context ||
      context.identity !== identity ||
      context.conversationId !== conversationId ||
      context.role !== role ||
      context.slot !== slot
    ) {
      return;
    }
    const inFlight = decryptingRef.current;
    const missing = confirmed.filter(
      (m) =>
        isEnvelope(m.content) &&
        !(m.serverId in decrypted) &&
        !inFlight.has(m.serverId),
    );
    if (missing.length === 0) return;
    // Reservar todo el lote antes del primer await evita volver a descifrar
    // mensajes en paralelo al llegar otra página o mensaje.
    for (const message of missing) inFlight.add(message.serverId);
    void (async () => {
      try {
        const updates: Record<string, string | null> = {};
        for (const message of missing) {
          if (decryptionContextRef.current !== context) return;
          try {
            updates[message.serverId] = await openEnvelope({
              identity,
              conversationId,
              senderRole: message.senderRole,
              content: message.content,
            });
          } catch {
            updates[message.serverId] = null;
          }
        }
        if (decryptionContextRef.current === context) {
          setDecrypted((previous) => ({ ...previous, ...updates }));
        }
      } finally {
        // Limpiar el set capturado, nunca el lock de una nueva identidad.
        for (const message of missing) inFlight.delete(message.serverId);
      }
    })();
    // Cambiar confirmed/decrypted no invalida resultados de la misma época.
    // El contexto se invalida al cambiar clave/sala/rol o desmontar la sala.
  }, [confirmed, identity, conversationId, decrypted, role, slot]);

  // Re-cifra el historial legado (texto plano) con la clave de la conversación.
  // Lotes pequeños (tope del frame) con pausa para no chocar con el anti-flood.
  useEffect(() => {
    if (!identity || !peerKey || conn !== "online" || confirmed.length === 0) {
      return;
    }
    const targets = confirmed.filter(
      (m) => !isEnvelope(m.content) && !migrateTriedRef.current.has(m.serverId),
    );
    if (targets.length === 0) return;
    let cancelled = false;
    void (async () => {
      setMigrating(true);
      try {
        for (let i = 0; i < targets.length; i += REENCRYPT_BATCH_MAX) {
          if (cancelled) return;
          const batch = targets.slice(i, i + REENCRYPT_BATCH_MAX);
          const items: { serverId: string; envelope: string }[] = [];
          for (const m of batch) {
            migrateTriedRef.current.add(m.serverId);
            items.push({
              serverId: m.serverId,
              envelope: await createEnvelope({
                identity,
                peerPublicKey: peerKey,
                conversationId,
                senderRole: m.senderRole,
                plaintext: m.content,
              }),
            });
          }
          if (cancelled) return;
          if (!sendRaw({ type: "reencrypt", items })) return;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } finally {
        if (!cancelled) setMigrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [confirmed, identity, peerKey, conn, conversationId, sendRaw]);

  // Conexión WebSocket con reintento exponencial + jitter y sync por delta.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

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

      // Sesión deslizante del seeker: renueva cookie + sesión mientras la
      // conversación siga viva. Si falla, seguimos: el token actual puede valer.
      if (role === "seeker" && !seekerReadyRef.current) {
        seekerReadyRef.current = true;
        await renewSeekerChatToken(conversationId).catch(() => ({ ok: false }));
      }

      if (cancelled) return;
      setConn((c) => (c === "online" ? c : "connecting"));

      const ws = new WebSocket(wsUrl(conversationId, writeAsPersona));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempts = 0;
        lastReadSentRef.current = 0;
        requestAnimationFrame(() => acknowledgeVisibleRef.current());
        setConn("online");
        // Publica la clave pública E2EE de este dispositivo (idempotente) y
        // recupera lo que se haya perdido; reenvía pendientes (dedup por id).
        publishKey();
        requestSync();
        for (const p of pendingRef.current) {
          ws.send(
            JSON.stringify({
              type: "send",
              clientMsgId: p.clientMsgId,
              content: p.envelope,
            } satisfies ClientFrame),
          );
        }
        // Latido: un "sync" periódico mantiene viva la conexión a través de
        // proxies/NAT (clave en redes móviles inestables) y, de paso, recupera
        // cualquier mensaje que se haya perdido.
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          requestSync();
        }, 30000);
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
        if (heartbeat) clearInterval(heartbeat);
        // Una página sin respuesta puede volver a solicitarse al reconectar.
        setLoadingOlder(false);
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
      if (heartbeat) clearInterval(heartbeat);
      try {
        wsRef.current?.close();
      } catch {
        // noop
      }
    };
  }, [
    conversationId,
    role,
    writeAsPersona,
    handleFrame,
    publishKey,
    requestSync,
  ]);

  // Seguir el final solo cuando ya se estaba allí o se acaba de enviar.
  // El ancla conserva el mensaje leído al descifrar/prepender historial;
  // «está escribiendo» y los reintentos nunca fuerzan un salto.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cambios de altura al descifrar o mostrar escritura deben conservar el ancla
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const newestSeq = confirmed[confirmed.length - 1]?.seq ?? 0;
    const addedByOther =
      newestSeq > observedSeqRef.current
        ? confirmed.filter(
            (message) =>
              message.seq > observedSeqRef.current &&
              message.senderRole !== role,
          ).length
        : 0;
    observedSeqRef.current = Math.max(observedSeqRef.current, newestSeq);
    const pageScroll = pageScrollRef.current;
    pageScrollRef.current = null;

    if (forceBottomRef.current || (followingBottomRef.current && !pageScroll)) {
      el.scrollTop = el.scrollHeight;
      followingBottomRef.current = true;
      forceBottomRef.current = false;
      readingAnchorRef.current = null;
      setNewMessageCount(0);
    } else {
      const anchor = readingAnchorRef.current;
      const row = anchor
        ? el.querySelector<HTMLElement>(`[data-message-seq="${anchor.seq}"]`)
        : null;
      if (anchor && row) {
        el.scrollTop +=
          row.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          anchor.offset;
      } else if (pageScroll) {
        el.scrollTop = pageScroll.top + el.scrollHeight - pageScroll.height;
      }
      followingBottomRef.current =
        el.scrollHeight - el.clientHeight - el.scrollTop <=
        FOLLOW_BOTTOM_DISTANCE;
      readingAnchorRef.current = readingAnchor(el);
      if (followingBottomRef.current) {
        setNewMessageCount(0);
      } else if (addedByOther > 0) {
        setNewMessageCount((count) => count + addedByOther);
      }
    }
  }, [
    confirmed,
    pending,
    otherTyping,
    decrypted,
    restoreNeeded,
    hasOlder,
    migrating,
    role,
  ]);

  // Confirmar lectura tras el commit y el descifrado. Recibir bytes por WS no
  // implica que el mensaje ya esté visible (pestaña oculta, modal o historial).
  useEffect(() => {
    const frame = requestAnimationFrame(acknowledgeVisibleMessages);
    return () => cancelAnimationFrame(frame);
  }, [acknowledgeVisibleMessages]);

  function onHistoryScroll() {
    const el = listRef.current;
    if (!el) return;
    followingBottomRef.current =
      el.scrollHeight - el.clientHeight - el.scrollTop <=
      FOLLOW_BOTTOM_DISTANCE;
    readingAnchorRef.current = followingBottomRef.current
      ? null
      : readingAnchor(el);
    if (followingBottomRef.current) {
      setNewMessageCount(0);
      acknowledgeVisibleMessages();
    }
  }

  function jumpToLatest() {
    const el = listRef.current;
    if (!el) return;
    // Salto explícito e inmediato: tampoco introduce movimiento forzado con
    // movimiento reducido. El foco vuelve al historial que se acaba de abrir.
    el.scrollTop = el.scrollHeight;
    followingBottomRef.current = true;
    readingAnchorRef.current = null;
    setNewMessageCount(0);
    el.focus({ preventScroll: true });
    acknowledgeVisibleMessages();
  }

  // Al volver a la pestaña, pedir de inmediato lo que se haya perdido mientras
  // estuvo en segundo plano (en vez de esperar al próximo latido).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        requestSync();
        acknowledgeVisibleMessages();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestSync, acknowledgeVisibleMessages]);

  const loadOlder = useCallback(() => {
    const oldest = confirmed[0]?.seq;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    if (!sendRaw({ type: "history-page", beforeSeq: oldest })) {
      setLoadingOlder(false);
    }
  }, [confirmed, loadingOlder, sendRaw]);

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

  async function submit() {
    const content = draft.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return;
    if (!identity || !peerKey) return;
    const context = decryptionContextRef.current;
    if (!context || context.identity !== identity) return;
    setSendError("");
    let envelope: string;
    try {
      envelope = await createEnvelope({
        identity,
        peerPublicKey: peerKey,
        conversationId,
        senderRole: role,
        plaintext: content,
      });
    } catch {
      if (decryptionContextRef.current === context) {
        setSendError("No pudimos cifrar el mensaje en este dispositivo.");
      }
      return;
    }
    // No encolar ni enviar un sobre creado para una clave/sala/rol anterior.
    if (decryptionContextRef.current !== context) return;
    const clientMsgId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    forceBottomRef.current = true;
    setPending((prev) => [...prev, { clientMsgId, content, envelope }]);
    setDraft("");
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTyping(false);
    if (!sendRaw({ type: "send", clientMsgId, content: envelope })) {
      // Queda pendiente y se reenvía al reconectar.
      setSendError("");
    }
  }

  function retry(clientMsgId: string) {
    const item = pendingRef.current.find((x) => x.clientMsgId === clientMsgId);
    if (item) {
      setSendError("");
      sendRaw({
        type: "send",
        clientMsgId: item.clientMsgId,
        content: item.envelope,
      });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function insertPaymentLink(packageId: string) {
    const url = `${window.location.origin}/pagar/${packageId}?c=${conversationId}`;
    setDraft((prev) => (prev.trim() ? `${prev.trimEnd()}\n${url}` : url));
  }

  function messageText(message: ChatMessage): string {
    if (!isEnvelope(message.content)) return message.content;
    if (!(message.serverId in decrypted)) return "Descifrando…";
    const text = decrypted[message.serverId];
    if (text === null) {
      return "Mensaje cifrado no disponible en este dispositivo";
    }
    return text ?? "";
  }

  // Recibo de lectura anclado al MAYOR mensaje propio ya leído por la otra parte
  // (estilo WhatsApp). Antes se exigía que fuese el último mensaje propio, así
  // que al enviar uno nuevo no leído el recibo desaparecía de toda la conversación.
  const lastReadMineSeq = confirmed.reduce(
    (acc, m) =>
      m.senderRole === role && m.seq <= otherReadSeq && m.seq > acc
        ? m.seq
        : acc,
    0,
  );
  const presenceLabel = otherTyping
    ? "escribiendo…"
    : otherOnline
      ? "en línea"
      : conn === "online"
        ? "sin conexión ahora"
        : " ";

  const composerNotice = !open
    ? ""
    : !identity
      ? conn === "error"
        ? "No pudimos abrir la conversación. Recarga la página e inténtalo de nuevo."
        : "Preparando el cifrado…"
      : !peerKey
        ? role === "seeker"
          ? "El profesional todavía no activó el cifrado de extremo a extremo. Podrás escribirle en cuanto lo haga."
          : "La persona aún no abrió su chat cifrado. Podrás escribir en cuanto lo abra."
        : "";

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

        {canSwitchView || role === "professional" ? (
          <div className={styles.identity}>
            {role === "professional" ? (
              <>
                <span>
                  Estás escribiendo como <strong>profesional</strong>.
                </span>
                {canSwitchView ? (
                  <Link
                    className={styles.identitySwitch}
                    href={`/c/${conversationId}?como=persona`}
                  >
                    Ver como la persona
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <span>
                  Estás viendo la conversación <strong>como la persona</strong>{" "}
                  (vista del profesional): lo que escribas se envía como ella.
                </span>
                <Link
                  className={styles.identitySwitch}
                  href={`/c/${conversationId}`}
                >
                  Volver a mi vista de profesional
                </Link>
              </>
            )}
          </div>
        ) : null}

        {restoreNeeded ? (
          <div className={styles.messages}>
            <E2eeRestorePanel
              audience={role}
              onRestored={reloadIdentity}
              onUseNewKeys={useNewKeys}
            />
          </div>
        ) : (
          <>
            <div className={styles.messageArea}>
              <section
                className={styles.messages}
                ref={listRef}
                onScroll={onHistoryScroll}
                aria-label="Historial de mensajes"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: el historial desplazable necesita foco para leerlo con teclado
                tabIndex={0}
              >
                {hasOlder ? (
                  <button
                    type="button"
                    className={styles.loadOlder}
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    aria-busy={loadingOlder}
                  >
                    {loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}
                  </button>
                ) : null}

                {migrating ? (
                  <p className={styles.migrating}>
                    Cifrando el historial anterior…
                  </p>
                ) : null}

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
                      data-message-seq={m.seq}
                      className={`${styles.row} ${mine ? styles.mine : styles.theirs}`}
                    >
                      <div>
                        <div
                          className={`${styles.bubble} ${
                            mine ? styles.bubbleMine : styles.bubbleTheirs
                          }`}
                        >
                          {messageText(m)}
                        </div>
                        <div
                          className={`${styles.meta} ${mine ? "" : styles.metaTheirs}`}
                        >
                          <span>{formatTime(m.serverTs)}</span>
                          {mine && m.seq === lastReadMineSeq ? (
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
                        <span>
                          {conn === "online"
                            ? "Enviando…"
                            : "Sin conexión · se enviará al reconectar"}
                        </span>
                        <button
                          type="button"
                          className={styles.retry}
                          onClick={() => retry(p.clientMsgId)}
                        >
                          Reintentar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {otherTyping ? (
                  <div className={styles.typing}>
                    {otherName} está escribiendo…
                  </div>
                ) : null}
              </section>
              {newMessageCount > 0 ? (
                <div className={styles.newMessages}>
                  <span className={styles.newMessageAnnouncement} role="status">
                    {newMessageCount === 1
                      ? "Tienes un mensaje nuevo."
                      : `Tienes ${newMessageCount} mensajes nuevos.`}
                  </span>
                  <button type="button" onClick={jumpToLatest}>
                    {newMessageCount === 1
                      ? "Nuevo mensaje"
                      : `${newMessageCount} mensajes nuevos`}
                    <span aria-hidden="true"> ↓</span>
                  </button>
                </div>
              ) : null}
            </div>

            {open ? (
              <div className={styles.composer}>
                {sendError ? (
                  <p className={styles.sendError} role="alert">
                    {sendError}
                  </p>
                ) : null}
                {composerNotice ? (
                  <p className={styles.composerNotice}>{composerNotice}</p>
                ) : null}
                {role === "professional" && paymentLinks.length > 0 ? (
                  <details className={styles.payLinks}>
                    <summary>Insertar link de pago</summary>
                    <p className={styles.payLinksHint}>
                      Se escribirá en tu mensaje. Compártelo después de
                      acordarlo con la persona.
                    </p>
                    <ul>
                      {paymentLinks.map((pkg) => (
                        <li key={pkg.id}>
                          <button
                            type="button"
                            onClick={() => insertPaymentLink(pkg.id)}
                          >
                            {pkg.title} · {pkg.priceLabel}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <textarea
                  ref={composerRef}
                  className={styles.textarea}
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  onBlur={() => sendTyping(false)}
                  placeholder={
                    e2eeReady ? "Escribe un mensaje…" : "Cifrado pendiente…"
                  }
                  rows={1}
                  maxLength={MAX_MESSAGE_LENGTH}
                  aria-label="Escribe un mensaje"
                  disabled={!e2eeReady}
                />
                <button
                  type="button"
                  className={`button human ${styles.sendBtn}`}
                  onClick={() => void submit()}
                  disabled={!draft.trim() || !e2eeReady}
                >
                  Enviar
                </button>
              </div>
            ) : (
              <div className={styles.closed}>
                <p style={{ margin: "0 0 10px" }}>
                  Esta conversación está cerrada. Puedes leer el historial y
                  reabrirla para continuar con la misma persona.
                </p>
                {reopenError ? (
                  <p
                    className="form-error"
                    role="alert"
                    style={{ margin: "0 0 10px" }}
                  >
                    {reopenError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="button human"
                  disabled={reopening}
                  onClick={async () => {
                    setReopening(true);
                    setReopenError("");
                    const res = await reopenConversation(
                      conversationId,
                      writeAsPersona,
                    ).catch(() => ({
                      ok: false as const,
                      reason: "not_authorized" as const,
                    }));
                    setReopening(false);
                    if (res.ok) {
                      router.refresh();
                    } else {
                      setReopenError(reopenErrorMessage(res.reason));
                    }
                  }}
                >
                  {reopening ? "Reabriendo…" : "Reabrir conversación"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConversationDeleteButton
        conversationId={conversationId}
        redirectTo={role === "professional" ? "/pro/dashboard#chats" : "/"}
        asPersona={writeAsPersona}
      />

      <p className={styles.safety}>
        Conversación privada y cifrada de extremo a extremo: solo ustedes dos
        pueden leerla y ni Nido puede acceder al contenido. Por tu seguridad,
        evita compartir datos que te identifiquen (dirección exacta,
        documentos). Si estás en peligro ahora,{" "}
        <a href="/emergencia">mira qué hacer</a>.
      </p>

      {backupCode ? (
        <E2eeBackupModal
          code={backupCode}
          onClose={() => setBackupCode(null)}
          returnFocusRef={composerRef}
        />
      ) : null}
    </>
  );
}
