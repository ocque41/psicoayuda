"use client";

/**
 * Botón "Salir rápido" para personas que pueden estar siendo vigiladas por un
 * agresor (violencia familiar/pareja). Patrón estándar en sitios de violencia y
 * salud mental: al activarlo, abre un sitio neutro en una pestaña nueva y
 * reemplaza la página actual por otra neutra (sin dejar entrada en el historial
 * que vuelva fácil a Nido).
 *
 * No borra el historial del navegador: por eso se acompaña de una nota que
 * recomienda navegación privada. Accesible por teclado y con la tecla Escape
 * pulsada dos veces seguidas.
 */

import { useEffect } from "react";

const NEUTRAL_REPLACE = "https://www.google.com";
const NEUTRAL_NEW_TAB = "https://www.google.com/search?q=el+tiempo";

function leaveNow() {
  try {
    window.open(NEUTRAL_NEW_TAB, "_blank", "noopener,noreferrer");
  } catch {
    /* si el navegador bloquea la pestaña, igual reemplazamos abajo */
  }
  // Reemplaza (no agrega) la entrada de historial para dificultar el "atrás".
  window.location.replace(NEUTRAL_REPLACE);
}

export function QuickExit() {
  useEffect(() => {
    let lastEsc = 0;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const now = e.timeStamp;
      if (now - lastEsc < 600) {
        leaveNow();
        return;
      }
      lastEsc = now;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={leaveNow}
      className="quick-exit"
      aria-label="Salir rápido de esta página e ir a un sitio neutro"
      style={{
        position: "fixed",
        top: "10px",
        right: "12px",
        zIndex: 80,
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "40px",
        padding: "8px 14px",
        borderRadius: "999px",
        border: "1.5px solid #1b3a63",
        background: "#1b3a63",
        color: "#fff",
        fontWeight: 700,
        fontSize: "0.9rem",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(27, 58, 99, 0.25)",
      }}
    >
      <span aria-hidden="true">✕</span> Salir rápido
    </button>
  );
}

/** Nota breve de seguridad para acompañar al botón de salida rápida. */
export function QuickExitNote() {
  return (
    <p className="hint" style={{ marginTop: "8px" }}>
      El botón <strong>«Salir rápido»</strong> te lleva a otra página, pero no
      borra tu historial. Si te preocupa que alguien revise este dispositivo,
      considera usar una ventana de navegación privada o incógnito.
    </p>
  );
}
