"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { SESSION_NOTE_ENTRY_ID } from "@/lib/practice/note-entry";

/** Abre sólo la entrada elegida por el fragmento; el editor autoriza el texto. */
export function SessionNoteEntry({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function openLinkedEntry() {
      if (window.location.hash === `#${SESSION_NOTE_ENTRY_ID}` && panel.current)
        panel.current.open = true;
    }
    openLinkedEntry();
    window.addEventListener("hashchange", openLinkedEntry);
    return () => window.removeEventListener("hashchange", openLinkedEntry);
  }, []);
  return (
    <details
      id={SESSION_NOTE_ENTRY_ID}
      ref={panel}
      tabIndex={-1}
      onFocus={(event) => {
        // App Router enfoca el destino también al cambiar sólo el fragmento.
        if (
          event.target !== event.currentTarget ||
          window.location.hash !== `#${SESSION_NOTE_ENTRY_ID}`
        )
          return;
        event.currentTarget.open = true;
        const text = event.currentTarget.querySelector("textarea");
        if (text && !text.disabled) text.focus();
      }}
    >
      <summary>Escribir una nota para esta sesión</summary>
      {children}
    </details>
  );
}
