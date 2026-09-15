"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureProInboxToken } from "@/app/c/[conversationId]/actions";
import { PanelIcon } from "@/components/panel-shell";
import { SideDrawer } from "@/components/side-drawer";
import { needLabels, urgencyLabels } from "@/lib/constants";
import {
  applyProChatActivity,
  type ProChatSummary,
  proChatSocketTargets,
  proChatsFingerprint,
  proChatsUnreadCount,
  sortProChats,
} from "@/lib/pro-chats";

// La conversación abierta manda por su propio WebSocket (evento de abajo); las
// demás salas reciben un canal de AVISOS de solo lectura que las actualiza al
// instante. El sondeo queda como red de seguridad (salas nuevas, cortes de red,
// cambios de estado) y solo corre con la pestaña visible.
const POLL_MS = 5000;
const REOPEN_MS = 8000;
const REFRESH_EVENT = "nido:chat-update";

// Formateador único: crear Intl.DateTimeFormat en cada pintado es caro.
// La hora va fija en la zona de Venezuela: así el servidor y el navegador
// pintan lo mismo (sin desajuste de hidratación) y todas las partes ven la
// misma hora, sin importar dónde esté su dispositivo.
const activityFormatter = (() => {
  try {
    return new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Caracas",
    });
  } catch {
    return null;
  }
})();

function activityLabel(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  if (!activityFormatter) return date.toISOString().slice(0, 10);
  return activityFormatter.format(date);
}

function chatTitle(chat: ProChatSummary): string {
  if (chat.need) {
    return needLabels[chat.need as keyof typeof needLabels] ?? chat.need;
  }
  return "Conversación";
}

/**
 * Lista de conversaciones del profesional dentro del chat: se actualiza sola
 * (metadatos, sin contenido) y permite cambiar de sala en un toque. En
 * escritorio es una columna fija; en móvil, un cajón con su botón.
 */
export function ProChatList({
  initial,
  activeId,
}: {
  initial: ProChatSummary[];
  activeId: string;
}) {
  const [chats, setChats] = useState<ProChatSummary[]>(() =>
    sortProChats(initial),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inboxReady, setInboxReady] = useState(false);
  // La hora la pinta el navegador recién hidratada: el servidor (Workers) y el
  // navegador escriben distinto los espacios de "p. m." (uno usa espacio duro),
  // y eso React lo ve como un texto que no coincide. Con esto el primer render
  // del cliente es idéntico al del servidor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fingerprintRef = useRef(proChatsFingerprint(sortProChats(initial)));

  // Aplica una lista nueva solo si cambió de verdad (la huella evita repintados).
  const commit = useCallback((next: ProChatSummary[]) => {
    const fingerprint = proChatsFingerprint(next);
    if (fingerprint === fingerprintRef.current) return;
    fingerprintRef.current = fingerprint;
    setChats(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pro/chats", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { chats?: ProChatSummary[] };
      if (!Array.isArray(data.chats)) return;
      commit(sortProChats(data.chats));
    } catch {
      // Sin conexión: el siguiente intento reintenta; la lista sigue usable.
    }
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (!cancelled && document.visibilityState === "visible") await load();
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onRefresh = () => void load();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [load]);

  // Token de avisos (cookie httpOnly, sin sala): habilita las conexiones de solo
  // lectura a las demás salas. Si falla, la lista sigue con el sondeo.
  useEffect(() => {
    let cancelled = false;
    void ensureProInboxToken()
      .then((res) => {
        if (!cancelled && res.ok) setInboxReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const targets = useMemo(
    () => proChatSocketTargets(chats, activeId),
    [chats, activeId],
  );
  const targetsKey = targets.join("|");

  // Avisos en vivo: una conexión de solo lectura por sala abierta (sin la que
  // está a la vista). Al llegar un mensaje, la lista se reordena al instante.
  useEffect(() => {
    if (!inboxReady || !targetsKey) return;
    let cancelled = false;
    const sockets = new Map<string, WebSocket>();
    const retries = new Map<string, ReturnType<typeof setTimeout>>();

    const connect = (conversationId: string) => {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      let socket: WebSocket;
      try {
        socket = new WebSocket(
          `${proto}//${window.location.host}/parties/conversation/${conversationId}?avisos=1`,
        );
      } catch {
        return;
      }
      sockets.set(conversationId, socket);
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let frame: {
          type?: string;
          message?: { senderRole?: string; serverTs?: number };
        };
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (frame.type !== "msg" || !frame.message) return;
        const role =
          frame.message.senderRole === "seeker" ? "seeker" : "professional";
        const at = Number(frame.message.serverTs ?? Date.now());
        setChats((prev) =>
          applyProChatActivity(prev, { conversationId, role, at }),
        );
        fingerprintRef.current = ""; // el próximo sondeo reconcilia
      };
      socket.onclose = () => {
        sockets.delete(conversationId);
        if (cancelled) return;
        retries.set(
          conversationId,
          setTimeout(() => connect(conversationId), REOPEN_MS),
        );
      };
      socket.onerror = () => {
        // `onclose` se dispara después: allí se reintenta.
      };
    };

    for (const conversationId of targetsKey.split("|")) connect(conversationId);

    return () => {
      cancelled = true;
      for (const timer of retries.values()) clearTimeout(timer);
      for (const socket of sockets.values()) {
        socket.onclose = null;
        socket.close();
      }
      sockets.clear();
    };
  }, [inboxReady, targetsKey]);

  const unreadCount = useMemo(() => proChatsUnreadCount(chats), [chats]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  const renderList = (onNavigate?: () => void) => (
    <ul className="chat-inbox-list">
      {chats.map((chat) => {
        const active = chat.id === activeId;
        // La sala abierta se considera leída aunque el espejo de D1 llegue un
        // instante después: evita mostrar "nuevo" en la conversación que estás
        // mirando.
        const unread = chat.unread && !active;
        return (
          <li key={chat.id}>
            <Link
              className={`chat-inbox-link${active ? " is-active" : ""}${unread ? " is-unread" : ""}`}
              href={`/c/${chat.id}`}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
            >
              <span className="chat-inbox-top">
                <span className="chat-inbox-title">{chatTitle(chat)}</span>
                {unread ? (
                  <span
                    className="chat-inbox-dot"
                    role="img"
                    aria-label="Sin leer"
                  />
                ) : null}
              </span>
              <span className="chat-inbox-meta">
                {chat.seekerName ? `${chat.seekerName} · ` : ""}
                {chat.urgency
                  ? `${urgencyLabels[chat.urgency as keyof typeof urgencyLabels] ?? chat.urgency} · `
                  : ""}
                {activityLabel(mounted ? chat.lastActivityAt : 0)}
                {chat.status !== "open" ? " · cerrada" : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="chat-inbox">
      <aside className="chat-inbox-aside">
        <div className="chat-inbox-card">
          <p className="chat-inbox-head">
            <span>Conversaciones</span>
            {unreadCount > 0 ? (
              <span className="chat-inbox-badge">{unreadCount} sin leer</span>
            ) : null}
          </p>
          {renderList()}
        </div>
      </aside>

      <SideDrawer
        open={drawerOpen}
        onOpen={openDrawer}
        onClose={closeDrawer}
        id="chat-inbox-drawer"
        title="Tus conversaciones"
        ariaLabel="Tus conversaciones"
        triggerLabel="Conversaciones"
        triggerIcon={<PanelIcon name="chat" />}
        triggerBadge={unreadCount || null}
        triggerVariant="bar"
      >
        {renderList(closeDrawer)}
      </SideDrawer>
    </div>
  );
}
