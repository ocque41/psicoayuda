"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  onChatSessionEnd,
  SESSION_CHANGED_EVENT,
} from "@/lib/chat-session-end";
import {
  createPatientSessionBoundary,
  type PatientSessionState,
  readCurrentPatientSession,
} from "@/lib/patient/session-boundary";

export function PatientSessionBoundary({
  ownerId,
  children,
}: {
  ownerId: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<PatientSessionState>({
    status: "checking",
  });
  const [mounted, setMounted] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const notice = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const guard = useRef<ReturnType<typeof createPatientSessionBoundary>>(null);

  useEffect(() => {
    const boundary = createPatientSessionBoundary(
      ownerId,
      readCurrentPatientSession,
      (next) => {
        // Ocultar en el mismo evento, antes de esperar red o un render React.
        if (next.status !== "authorized" && content.current) {
          const active = document.activeElement;
          if (active instanceof HTMLElement && content.current.contains(active))
            previousFocus.current = active;
          content.current.hidden = true;
          content.current.inert = true;
        }
        if (next.status === "authorized") {
          if (content.current) {
            content.current.hidden = false;
            content.current.inert = false;
            if (previousFocus.current?.isConnected)
              previousFocus.current.focus({ preventScroll: true });
            previousFocus.current = null;
          }
          setMounted(true);
        }
        if (next.status === "revoked") setMounted(false);
        setState(next);
      },
    );
    guard.current = boundary;
    const invalidate = () => {
      boundary.end();
      void boundary.check();
    };
    const stop = onChatSessionEnd(invalidate);
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    const resume = () => {
      if (document.visibilityState === "visible") void boundary.check();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") boundary.pause();
      else resume();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", boundary.pause);
    document.addEventListener("visibilitychange", visibility);
    void boundary.check();
    return () => {
      stop();
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", boundary.pause);
      document.removeEventListener("visibilitychange", visibility);
      boundary.dispose();
      if (guard.current === boundary) guard.current = null;
    };
  }, [ownerId]);

  useEffect(() => {
    if (state.status === "authorized") {
      if (previousFocus.current?.isConnected)
        previousFocus.current.focus({ preventScroll: true });
      previousFocus.current = null;
    } else if (state.status === "revoked" || state.status === "unavailable")
      notice.current?.focus();
  }, [state.status]);

  const authorized = state.status === "authorized";
  return (
    <div data-patient-session-state={state.status}>
      {mounted && state.status !== "revoked" ? (
        <div
          ref={content}
          data-patient-session-content
          hidden={!authorized}
          inert={!authorized}
        >
          {children}
        </div>
      ) : null}
      {!authorized ? (
        <section className="section">
          <div className="container">
            <div className="card">
              <h1 ref={notice} tabIndex={-1}>
                {state.status === "checking"
                  ? "Comprobando tu sesión"
                  : state.status === "unavailable"
                    ? "No pudimos comprobar tu sesión"
                    : "Tu sesión cambió"}
              </h1>
              {state.status === "checking" ? (
                <p role="status">Un momento, estamos preparando tu espacio.</p>
              ) : state.status === "unavailable" ? (
                <>
                  <p role="alert">
                    Revisa tu conexión y reintenta. Conservamos los datos que
                    estabas escribiendo en esta ventana.
                  </p>
                  <button
                    type="button"
                    className="button human"
                    onClick={() => void guard.current?.check()}
                  >
                    Reintentar
                  </button>
                </>
              ) : (
                <>
                  <p role="status">
                    {state.accountPresent === false
                      ? "Entra de nuevo para abrir tu espacio."
                      : "Vuelve a abrir tu espacio con la cuenta actual."}
                  </p>
                  {/* Navegación de documento: no restaura RSC de otra cuenta. */}
                  <a className="button human" href="/mi">
                    Volver a abrir mi espacio
                  </a>
                </>
              )}
              <noscript>
                <p>
                  Activa JavaScript para comprobar tu sesión y ver tu espacio.
                </p>
              </noscript>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
