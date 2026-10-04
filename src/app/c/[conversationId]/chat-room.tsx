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
import { loadChatDraft, saveChatDraft } from "@/lib/chat-draft-storage";
import { persistRecoveryBackup } from "@/lib/e2ee-backup";
import {
  getOrCreateIdentity,
  loadIdentity,
  loadProfessionalIdentity,
  professionalSlot,
  registerIdentityOwner,
  replaceIdentity,
  seekerSlot,
} from "@/lib/e2ee-client";
import { listenE2eeSessionInvalidation } from "@/lib/e2ee-session-guard";
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
import { decideE2eeGate } from "@/shared/e2ee-gating";
import {
  buildWaitlistPromptPayload,
  isWaitlistPromptPayload,
} from "@/shared/waitlist-prompt";
import {
  ensureProChatToken,
  markProfessionalChatRead,
  renewSeekerChatToken,
  reopenConversation,
  verifyConversationE2eeActor,
} from "./actions";
import styles from "./chat.module.css";
import { nextHistorySyncCursor } from "./chat-history";
import { createReadPersistence } from "./chat-read-persistence";
import { E2eeRestorePanel } from "./e2ee-restore-panel";
import { WaitlistPromptCard } from "./waitlist-prompt-card";

type ConnStatus = "connecting" | "online" | "offline" | "error";

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

/**
 * Aviso (no bloqueante) para el profesional cuando este equipo usa una clave
 * distinta de la publicada en su cuenta. Nunca impide leer ni escribir: solo
 * explica qué pasa con los mensajes de otros dispositivos y ofrece el código de
 * recuperación. (Este dispositivo NUNCA rota la clave de la cuenta en silencio:
 * si no tiene ninguna, se pide el código con el panel.)
 */
const E2EE_MISMATCH_NOTICE =
  "Tu cuenta tiene publicada la clave de otro dispositivo. Puedes seguir atendiendo con la de este equipo; algunos mensajes nuevos pueden no verse aquí. Si guardaste tu código de recuperación, puedes unificarlo con él.";

function wsUrl(conversationId: string, asPersona: boolean): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const query = asPersona ? "?como=persona" : "";
  return `${proto}//${window.location.host}/parties/conversation/${conversationId}${query}`;
}

// Hora de los mensajes, fija en la zona de Venezuela: el servidor y el
// navegador pintan lo mismo (sin desajuste de hidratación) y ambas partes ven
// la misma hora.
function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Caracas",
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
  professionalId,
  role,
  otherName,
  open,
  canSwitchView = false,
  paymentLinks = [],
  proPublicKey = null,
  waitlistSignup = null,
}: {
  conversationId: string;
  professionalId?: string;
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
  // Anotación de lista de espera nacida de esta conversación (si existe), para
  // que la tarjeta muestre el estado a las dos partes.
  waitlistSignup?: { email: string; createdAt: string } | null;
}) {
  // El profesional puede estar viendo la sala como la persona. En ese caso TODO
  // (WebSocket, reabrir, borrar) actúa con la identidad de la persona: lo que
  // escribe se registra como suyo y el caso se cierra en vez de reencolarse.
  const writeAsPersona = role === "seeker";
  const proVisitor = role === "professional" || Boolean(canSwitchView);
  const [confirmed, setConfirmed] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherReadSeq, setOtherReadSeq] = useState(0);
  const [draft, setDraft] = useState("");
  const draftRevisionRef = useRef(0);
  const submitInFlightRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
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
  // El profesional nunca rota su clave en silencio si la cuenta ya tiene una:
  // eso rompería el historial en todos sus dispositivos. Si a este dispositivo
  // le falta, se pide el código (uno solo para todas las conversaciones) con la
  // opción explícita de empezar de cero; la primera vez se crea sin más.
  const [proNotice, setProNotice] = useState<"mismatch" | null>(null);
  const [showRestore, setShowRestore] = useState(false);
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
  const [waitlistJoined, setWaitlistJoined] = useState<{
    email: string;
    createdAt: string;
  } | null>(waitlistSignup);
  const [promptSending, setPromptSending] = useState(false);

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

  const slot =
    role === "professional"
      ? professionalSlot(professionalId ?? "unavailable")
      : seekerSlot(conversationId);

  const sessionRevisionRef = useRef(0);
  const checkE2eeActor = useCallback(
    () => verifyConversationE2eeActor(conversationId, role, professionalId),
    [conversationId, role, professionalId],
  );

  useEffect(
    () =>
      listenE2eeSessionInvalidation(() => {
        sessionRevisionRef.current += 1;
        setLoggedOut(true);
        setDraftReady(false);
        setIdentity(null);
        setBackupCode(null);
        draftRevisionRef.current += 1;
        setDraft("");
        setConfirmed([]);
        setPending([]);
        wsRef.current?.close();
      }),
    [],
  );
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

  const draftContext = useMemo(
    () => ({
      ownerId:
        role === "professional"
          ? (professionalId ?? "unavailable")
          : conversationId,
      conversationId,
      role,
    }),
    [professionalId, conversationId, role],
  );
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDraftReady(false);
    draftRevisionRef.current += 1;
    setDraft("");
    if (identity && !loggedOut)
      void loadChatDraft(draftContext, identity).then((saved) => {
        if (!cancelled) {
          draftRevisionRef.current += 1;
          setDraft(saved ?? "");
          setDraftReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identity, draftContext, loggedOut]);
  useEffect(() => {
    if (!identity || !draftReady || loggedOut) return;
    // Puede terminar al cerrar sesión: sigue cifrado y ligado a este dueño.
    void saveChatDraft(draftContext, identity, draft);
  }, [draftContext, identity, draftReady, draft, loggedOut]);
  const [backupError, setBackupError] = useState("");

  // ---- Identidad E2EE de este dispositivo ----------------------------------

  const recoveryScope =
    proVisitor && professionalId ? professionalSlot(professionalId) : slot;
  const ensureBackup = useCallback(
    async (kind: "professional" | "seeker") => {
      const revision = sessionRevisionRef.current;
      await registerIdentityOwner(slot, recoveryScope);
      if (revision !== sessionRevisionRef.current) return null;
      const result = await persistRecoveryBackup(
        kind,
        saveRecoveryKeystore,
        recoveryScope,
      );
      if (revision !== sessionRevisionRef.current) return null;
      setBackupError(
        result.ok
          ? ""
          : "No pudimos guardar tu respaldo. Reintenta antes de usar el código en otro dispositivo.",
      );
      return result.ok && result.created ? result.code : null;
    },
    [slot, recoveryScope],
  );

  const setupIdentity = useCallback(
    async (idn: ConversationIdentity) => {
      if (role === "professional") {
        const published = await publishProIdentityKey(
          idn.publicKey,
          undefined,
          professionalId ?? "",
        );
        if (!published.ok)
          throw new Error("No pudimos confirmar la clave de esta cuenta.");
      }
      const code = await ensureBackup(
        role === "professional" ? "professional" : "seeker",
      );
      // El código solo se muestra a la persona: es quien no tiene cuenta ni
      // otra forma de recuperar su clave. El profesional lo ve en su panel.
      if (code && !proVisitor) setBackupCode(code);
    },
    [role, ensureBackup, proVisitor, professionalId],
  );

  useEffect(() => {
    if (loggedOut) return;
    let cancelled = false;
    setIdentity(null);
    setRestoreNeeded(false);
    setProNotice(null);
    setShowRestore(false);
    setKeysLoaded(false);
    setHistoryStats(null);
    historyStatsSetRef.current = false;
    decryptingRef.current = new Set();
    migrateTriedRef.current = new Set();
    setDecrypted({});
    void (async () => {
      const existing =
        role === "professional" && professionalId
          ? await loadProfessionalIdentity(professionalId, proPublicKey)
          : await loadIdentity(slot);
      if (cancelled) return;
      if (existing) {
        if (
          role === "professional" &&
          ((proPublicKey && proPublicKey !== existing.publicKey) ||
            !(
              await publishProIdentityKey(
                existing.publicKey,
                undefined,
                professionalId ?? "",
              )
            ).ok)
        ) {
          setRestoreNeeded(true);
          setProNotice("mismatch");
        } else {
          const code = await ensureBackup(
            role === "professional" ? "professional" : "seeker",
          );
          if (!cancelled) {
            setIdentity(existing);
            if (code && !proVisitor) setBackupCode(code);
          }
        }
      }
      if (!cancelled) setKeysLoaded(true);
    })().catch(() => {
      if (!cancelled)
        setSendError(
          "No pudimos confirmar el cifrado. Recarga para reintentarlo.",
        );
    });
    return () => {
      cancelled = true;
    };
  }, [
    slot,
    role,
    proPublicKey,
    professionalId,
    ensureBackup,
    proVisitor,
    loggedOut,
  ]);

  // Regla pura (probada en src/tests/e2ee-gating.test.ts): decide si toca
  // restaurar (código obligatorio) o crear la clave. Se recalcula con el
  // historial.
  const e2eeGate = useMemo(
    () =>
      historyStats === null
        ? null
        : decideE2eeGate({
            role,
            proVisitor,
            hasLocalIdentity: identity !== null,
            accountPublicKey: proPublicKey,
            localPublicKey: identity?.publicKey ?? null,
            envelopes: historyStats.envelopes,
          }),
    [historyStats, identity, proPublicKey, role, proVisitor],
  );

  useEffect(() => {
    if (e2eeGate?.restore) setRestoreNeeded(true);
    // El motivo del aviso se fija una vez por carga de sala: al publicar la
    // clave nueva el prop del servidor queda un instante desactualizado y no
    // queremos reescribir el aviso (ni hacerlo parpadear).
    if (e2eeGate?.notice) setProNotice((prev) => prev ?? e2eeGate.notice);
  }, [e2eeGate]);

  // Crea la identidad en silencio cuando el gate lo permite (nada cifrado aún,
  // o vista "como la persona" del profesional).
  useEffect(() => {
    if (loggedOut || !keysLoaded || identity || restoreNeeded || showRestore)
      return;
    if (!e2eeGate?.create) return;
    let cancelled = false;
    void (async () => {
      const { identity: created, created: isNew } =
        await getOrCreateIdentity(slot);
      if (cancelled) return;
      if (
        role === "professional" &&
        !(
          await publishProIdentityKey(
            created.publicKey,
            undefined,
            professionalId ?? "",
          )
        ).ok
      ) {
        setRestoreNeeded(true);
        return;
      }
      if (cancelled) return;
      if (isNew) await setupIdentity(created);
      if (!cancelled) setIdentity(created);
    })().catch(() => {
      if (!cancelled)
        setSendError(
          "No pudimos activar el cifrado. Recarga para reintentarlo.",
        );
    });
    return () => {
      cancelled = true;
    };
  }, [
    loggedOut,
    keysLoaded,
    identity,
    restoreNeeded,
    showRestore,
    e2eeGate,
    slot,
    setupIdentity,
    role,
    professionalId,
  ]);

  const reloadIdentity = useCallback(async (): Promise<boolean> => {
    const restored =
      role === "professional" && professionalId
        ? await loadProfessionalIdentity(professionalId, proPublicKey)
        : await loadIdentity(slot);
    if (!restored) return false;
    if (
      role === "professional" &&
      !(
        await publishProIdentityKey(
          restored.publicKey,
          undefined,
          professionalId ?? "",
        )
      ).ok
    )
      return false;
    setIdentity(restored);
    setRestoreNeeded(false);
    return true;
  }, [slot, role, proPublicKey, professionalId]);

  const startWithNewKeys = useCallback(async () => {
    const { identity: created } = await replaceIdentity(slot);
    if (
      role === "professional" &&
      !(
        await publishProIdentityKey(
          created.publicKey,
          proPublicKey,
          professionalId ?? "",
        )
      ).ok
    )
      throw new Error(
        "La clave de la cuenta ha cambiado. Recarga para recuperarla.",
      );
    setIdentity(created);
    setRestoreNeeded(false);
    await setupIdentity(created);
  }, [slot, setupIdentity, role, proPublicKey, professionalId]);

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

  const readPersistence = useMemo(
    () =>
      role === "professional"
        ? createReadPersistence((timestamp) =>
            markProfessionalChatRead(conversationId, timestamp),
          )
        : null,
    [conversationId, role],
  );

  useEffect(() => {
    void readPersistence?.resume();
    return () => readPersistence?.pause();
  }, [readPersistence]);

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
    void readPersistence?.retry();
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
        void readPersistence?.record(message.serverTs);
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
    readPersistence,
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
          // La lista de conversaciones del profesional se refresca al momento:
          // esta sala (y su "sin leer") no debe esperar al siguiente sondeo.
          if (role === "professional") {
            window.dispatchEvent(new Event("nido:chat-update"));
            if (m.senderRole === "seeker") {
              // El espejo de D1 marca leído al abrir la sala; con mensajes
              // nuevos hay que volver a marcarlo (best-effort, sin bloquear).
              void ensureProChatToken(conversationId).catch(() => undefined);
            }
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
          // Mensaje propio confirmado: la actividad de la sala cambió.
          if (role === "professional") {
            window.dispatchEvent(new Event("nido:chat-update"));
          }
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
    [role, requestSync, conversationId],
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
    if (loggedOut) return;
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

      ws.onmessage = (event) => {
        if (!cancelled) handleFrame(event.data);
      };

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
    loggedOut,
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
    draftRevisionRef.current += 1;
    setDraft(value);
    sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(false), 2500);
  }

  /** Cifra y envía un texto ya construido (composer o tarjeta del sistema). */
  async function sendPlaintext(content: string): Promise<boolean> {
    if (!identity || !peerKey) return false;
    const context = decryptionContextRef.current;
    if (!context || context.identity !== identity) return false;
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
      return false;
    }
    // No encolar ni enviar un sobre creado para una clave/sala/rol anterior.
    if (decryptionContextRef.current !== context) return false;
    const clientMsgId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    forceBottomRef.current = true;
    setPending((prev) => [...prev, { clientMsgId, content, envelope }]);
    if (!sendRaw({ type: "send", clientMsgId, content: envelope })) {
      // Queda pendiente y se reenvía al reconectar.
      setSendError("");
    }
    return true;
  }

  async function submit() {
    if (submitInFlightRef.current) return;
    const snapshot = draft;
    const content = snapshot.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return;
    if (!e2eeReady || !draftReady || loggedOut) return;
    const revision = draftRevisionRef.current;
    const context = decryptionContextRef.current;
    // El ref protege también dos Enter dentro del mismo commit de React.
    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const sent = await sendPlaintext(content);
      if (
        !sent ||
        decryptionContextRef.current !== context ||
        draftRevisionRef.current !== revision
      )
        return;
      draftRevisionRef.current += 1;
      setDraft((current) => (current === snapshot ? "" : current));
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      sendTyping(false);
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  /**
   * Tarjeta de lista de espera (solo profesional): va como mensaje cifrado con
   * un payload JSON marcado. La persona lo ve como formulario para dejar su
   * correo; si no aplica, el profesional simplemente no la envía.
   */
  async function sendWaitlistPrompt() {
    if (!e2eeReady || promptSending) return;
    setPromptSending(true);
    try {
      await sendPlaintext(buildWaitlistPromptPayload());
    } finally {
      setPromptSending(false);
    }
  }

  const handleWaitlistJoined = useCallback((email: string) => {
    setWaitlistJoined({ email, createdAt: new Date().toISOString() });
  }, []);

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
    draftRevisionRef.current += 1;
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
        : restoreNeeded
          ? "Escribe tu código de recuperación para leer y escribir en este dispositivo."
          : "Preparando el cifrado…"
      : !peerKey
        ? role === "seeker"
          ? "El profesional todavía no activó el cifrado de extremo a extremo. Podrás escribirle en cuanto lo haga."
          : "La persona aún no abrió su chat cifrado. Podrás escribir en cuanto lo abra."
        : "";

  if (loggedOut)
    return (
      <p role="status">
        La sesión está cerrada.{" "}
        <Link href="/entrar">
          Vuelve a entrar para abrir tus conversaciones.
        </Link>
      </p>
    );

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

        {backupError ? (
          <div role="alert">
            <p>{backupError}</p>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                const revision = sessionRevisionRef.current;
                const result = await persistRecoveryBackup(
                  role === "professional" ? "professional" : "seeker",
                  saveRecoveryKeystore,
                  recoveryScope,
                );
                if (result.ok && revision === sessionRevisionRef.current) {
                  setBackupError("");
                  setBackupCode(result.code);
                }
              }}
            >
              Reintentar respaldo
            </button>
          </div>
        ) : null}
        {proNotice && !restoreNeeded && !showRestore ? (
          <div className={styles.e2eeNotice} role="status">
            <p>{E2EE_MISMATCH_NOTICE}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setShowRestore(true)}
            >
              Tengo mi código de recuperación
            </button>
          </div>
        ) : null}
        {restoreNeeded || showRestore ? (
          <div className={styles.messages}>
            <E2eeRestorePanel
              recoveryScope={recoveryScope}
              checkActor={checkE2eeActor}
              audience={role}
              onRestored={async () => {
                const ok = await reloadIdentity();
                if (ok) {
                  setProNotice(null);
                  setShowRestore(false);
                }
                return ok;
              }}
              onUseNewKeys={async () => {
                await startWithNewKeys();
                setProNotice(null);
                setShowRestore(false);
              }}
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
                  const text = messageText(m);
                  const waitlist =
                    m.senderRole === "professional" &&
                    isWaitlistPromptPayload(text);
                  return (
                    <div
                      key={m.serverId}
                      data-message-seq={m.seq}
                      className={`${styles.row} ${mine ? styles.mine : styles.theirs}`}
                    >
                      <div>
                        <div
                          className={`${styles.bubble} ${
                            waitlist
                              ? styles.waitlistBubble
                              : mine
                                ? styles.bubbleMine
                                : styles.bubbleTheirs
                          }`}
                        >
                          {waitlist ? (
                            <WaitlistPromptCard
                              conversationId={conversationId}
                              role={role}
                              asPersona={writeAsPersona}
                              signup={waitlistJoined}
                              onJoined={handleWaitlistJoined}
                            />
                          ) : (
                            text
                          )}
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
                {role === "professional" ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void sendWaitlistPrompt()}
                    disabled={!e2eeReady || promptSending}
                  >
                    {promptSending
                      ? "Enviando…"
                      : "Enviar tarjeta de lista de espera"}
                  </button>
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
                  disabled={!e2eeReady || !draftReady}
                />
                <button
                  type="button"
                  className={`button human ${styles.sendBtn}`}
                  onClick={() => void submit()}
                  disabled={
                    submitting || !draft.trim() || !e2eeReady || !draftReady
                  }
                  aria-busy={submitting}
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
          checkActor={checkE2eeActor}
          onClose={() => setBackupCode(null)}
          returnFocusRef={composerRef}
        />
      ) : null}
    </>
  );
}
