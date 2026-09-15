"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelIcon } from "@/components/panel-shell";
import { SideDrawer } from "@/components/side-drawer";
import { needLabels, urgencyLabels } from "@/lib/constants";
import {
  type ProChatSummary,
  proChatsFingerprint,
  proChatsUnreadCount,
  sortProChats,
} from "@/lib/pro-chats";

// Refresco ligero de la bandeja: cada pocos segundos y al volver a la pestaña.
// La conversación ABIERTA se actualiza al instante (el chat avisa con el evento
// de abajo en cuanto recibe o envía); las demás, en el siguiente refresco.
const POLL_MS = 3000;
const REFRESH_EVENT = "nido:chat-update";

// Formateador único: crear Intl.DateTimeFormat en cada pintado es caro.
const activityFormatter = (() => {
  try {
    return new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
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
  const fingerprintRef = useRef(proChatsFingerprint(sortProChats(initial)));

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pro/chats", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { chats?: ProChatSummary[] };
      if (!Array.isArray(data.chats)) return;
      const next = sortProChats(data.chats);
      const nextFingerprint = proChatsFingerprint(next);
      if (nextFingerprint === fingerprintRef.current) return;
      fingerprintRef.current = nextFingerprint;
      setChats(next);
    } catch {
      // Sin conexión: el siguiente intento reintenta; la lista sigue usable.
    }
  }, []);

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
                {activityLabel(chat.lastActivityAt)}
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
