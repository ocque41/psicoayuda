"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./admission.module.css";

export function AdmissionDialog({
  title,
  description,
  children,
  onClose,
  busy = false,
  dirty = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  dirty?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resumeFocus = useRef<HTMLElement | null>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [discard, setDiscard] = useState(false);
  useLayoutEffect(() => {
    if (discard) {
      continueButton.current?.focus({ preventScroll: true });
      return;
    }
    const previous = resumeFocus.current;
    resumeFocus.current = null;
    if (previous && dialog.current?.contains(previous))
      previous.focus({ preventScroll: true });
    else if (previous) heading.current?.focus({ preventScroll: true });
  }, [discard]);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || typeof element.showModal !== "function") return;
    element.showModal();
    if (
      typeof element.animate === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const animation = element.animate(
        [
          { opacity: 0, transform: "translateY(8px) scale(.985)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      return () => {
        animation.cancel();
        element.close();
      };
    }
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!dirty && !busy) {
      setDiscard(false);
      return;
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
  function close() {
    if (busy) return;
    if (dirty) {
      if (!discard && document.activeElement instanceof HTMLElement)
        resumeFocus.current = document.activeElement;
      setDiscard(true);
      return;
    }
    onClose();
  }
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape y foco los gestiona el diálogo nativo
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== dialog.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
    >
      <div className={styles.dialogBody}>
        <header className={styles.dialogHead}>
          <div>
            <p className={styles.eyebrow}>Admisión en Nido</p>
            <h2 ref={heading} id={titleId} tabIndex={-1}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Cerrar detalle de admisión"
            onClick={close}
            disabled={busy}
          >
            ×
          </button>
        </header>
        {discard ? (
          <div className={styles.notice} role="alert">
            <p>
              Tienes cambios sin guardar. Puedes seguir revisando o descartarlos
              al cerrar.
            </p>
            <div className={styles.rowActions}>
              <button
                ref={continueButton}
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setDiscard(false)}
              >
                Seguir revisando
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={onClose}
              >
                Descartar y cerrar
              </button>
            </div>
          </div>
        ) : null}
        {children}
        <footer className={styles.dialogFooter}>
          <span className={styles.muted}>
            {busy
              ? "Guardando en Nido…"
              : dirty
                ? "Hay cambios sin guardar."
                : "Cada decisión conserva su historial."}
          </span>
          <button
            type="button"
            className={styles.secondary}
            onClick={close}
            disabled={busy}
          >
            Volver al tablero
          </button>
        </footer>
      </div>
    </dialog>
  );
}
