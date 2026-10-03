"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WorkspaceIcon } from "@/components/workspace/icon";

type InboxSnapshot = { unread: number; latest: number | null };
export function InboxNotifier({ initial }: { initial?: InboxSnapshot }) {
  const [snapshot, setSnapshot] = useState<InboxSnapshot | null>(
    initial || null,
  );
  const [native, setNative] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unavailable" | null
  >(null);
  const [requesting, setRequesting] = useState(false);
  const [offline, setOffline] = useState(false);
  const nativeRef = useRef(false);
  const last = useRef<number | null>(initial?.latest ?? null);
  const received = useRef(Boolean(initial));

  useEffect(() => {
    const current =
      "Notification" in window && window.isSecureContext
        ? Notification.permission
        : "unavailable";
    setPermission(current);
    // Permission alone does not opt the user into repeated browser notifications.
  }, []);
  useEffect(() => {
    let active = true;
    let inFlight: AbortController | null = null;
    const hasInitial = received.current;
    async function check() {
      if (document.hidden || inFlight) return;
      const request = new AbortController();
      inFlight = request;
      const timeout = window.setTimeout(() => request.abort(), 12000);
      try {
        const response = await fetch("/api/practice/inbox", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw new Error("inbox");
        const data = (await response.json()) as InboxSnapshot;
        if (
          !Number.isSafeInteger(data.unread) ||
          data.unread < 0 ||
          (data.latest !== null && !Number.isFinite(data.latest))
        )
          throw new Error("invalid-inbox");
        if (!active) return;
        setSnapshot(data);
        setOffline(false);
        if (
          received.current &&
          data.latest &&
          data.latest > (last.current || 0) &&
          nativeRef.current &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const notice = new Notification("Tienes un mensaje nuevo en Nido", {
            body: "Entra a tu consulta para verlo.",
            tag: "nido-inbox",
          });
          notice.onclick = () => {
            window.focus();
            notice.close();
            window.location.assign("/pro/dashboard#chats");
          };
        }
        last.current = data.latest;
        received.current = true;
      } catch {
        if (active) setOffline(true);
      } finally {
        window.clearTimeout(timeout);
        if (inFlight === request) inFlight = null;
      }
    }
    function visible() {
      if (document.hidden) {
        inFlight?.abort();
        return;
      }
      void check();
    }
    if (!hasInitial) void check();
    const interval = window.setInterval(() => void check(), 60000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", check);
    return () => {
      active = false;
      inFlight?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", check);
    };
  }, []);

  async function enable() {
    if (!("Notification" in window) || !window.isSecureContext) return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      nativeRef.current = result === "granted";
      setNative(result === "granted");
    } catch {
      setPermission("unavailable");
    } finally {
      setRequesting(false);
    }
  }
  return (
    <aside className="card inbox-notifier" aria-label="Avisos de mensajes">
      <span className="inbox-notifier-icon" aria-hidden="true">
        <WorkspaceIcon name="message" />
      </span>
      <div className="inbox-notifier-copy">
        <p aria-live="polite">
          {snapshot?.unread ? (
            <Link href="/pro/dashboard#chats">
              Tienes {snapshot.unread}{" "}
              {snapshot.unread === 1 ? "chat por leer" : "chats por leer"} →
            </Link>
          ) : snapshot ? (
            "Tus mensajes, al día."
          ) : (
            "Comprobando tus mensajes…"
          )}
        </p>
        <p className="hint">
          {offline
            ? "No se pudo actualizar. Volveremos a intentarlo cuando haya conexión."
            : "Se actualiza mientras tu consulta está abierta."}
        </p>
        {permission === "denied" ? (
          <p className="hint">
            Los avisos están bloqueados. Puedes cambiar el permiso en los
            ajustes del navegador.
          </p>
        ) : permission === "unavailable" ? (
          <p className="hint">
            Este navegador no admite avisos. Tus mensajes siguen disponibles en
            Nido.
          </p>
        ) : null}
      </div>
      {permission !== "unavailable" && permission !== "denied" ? (
        <button
          className="button secondary"
          type="button"
          disabled={native || requesting || permission === null}
          onClick={enable}
        >
          {native
            ? "Avisos activados"
            : requesting
              ? "Activando…"
              : "Activar avisos"}
        </button>
      ) : null}
    </aside>
  );
}
