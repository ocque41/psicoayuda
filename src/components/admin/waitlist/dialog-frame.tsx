"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./waitlist.module.css";

export function WaitlistDialog({
  title,
  source,
  children,
  onClose,
  busy = false,
  dirty = false,
}: {
  title: string;
  source: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  dirty?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const resumedField = useRef<HTMLElement | null>(null);
  const id = useId();
  const [discard, setDiscard] = useState(false);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || typeof element.showModal !== "function") return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    heading.current?.focus({ preventScroll: true });
    const animation =
      typeof element.animate === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? element.animate(
            [
              { opacity: 0, transform: "translateY(8px) scale(.985)" },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ],
            { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" },
          )
        : null;
    return () => {
      animation?.cancel();
      element.close();
      if (opener?.isConnected && opener !== document.body)
        opener.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    if (discard) continueButton.current?.focus({ preventScroll: true });
    else if (resumedField.current?.isConnected) {
      resumedField.current.focus({ preventScroll: true });
      resumedField.current = null;
    }
  }, [discard]);

  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, dirty]);

  function close() {
    if (busy) return;
    if (dirty) {
      resumedField.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setDiscard(true);
    } else onClose();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: El diálogo nativo gestiona Escape y confina el foco.
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
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
      <header className={styles.dialogHeader}>
        <div>
          <p>{source} · acceso de Superadmin</p>
          <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>
            {title}
          </h2>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Cerrar detalle de la lista de espera"
          onClick={close}
          disabled={busy}
        >
          ×
        </button>
      </header>
      {discard ? (
        <section className={styles.notice} role="alert">
          <strong>Tienes cambios sin guardar</strong>
          <p>Puedes seguir revisando o descartarlos al cerrar.</p>
          <div className={styles.actions}>
            <button
              ref={continueButton}
              className={styles.secondary}
              type="button"
              onClick={() => setDiscard(false)}
            >
              Seguir revisando
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={onClose}
            >
              Descartar y cerrar
            </button>
          </div>
        </section>
      ) : null}
      <div className={styles.dialogBody}>{children}</div>
      <footer className={styles.dialogFooter}>
        <span className={styles.summary}>
          {busy
            ? "Guardando…"
            : dirty
              ? "Cambios sin guardar"
              : "Consulta privada del equipo"}
        </span>
        <button
          type="button"
          className={styles.secondary}
          onClick={close}
          disabled={busy}
        >
          Volver a la lista
        </button>
      </footer>
    </dialog>
  );
}
