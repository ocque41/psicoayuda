"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { E2eeActorCheck } from "@/lib/e2ee-session-guard";
import styles from "./e2ee.module.css";
import { useE2eeSessionGuard } from "./use-e2ee-session-guard";

const denyUnverifiedActor = async () => ({ ok: false });

/**
 * Se muestra UNA vez, cuando este dispositivo genera la primera clave de
 * cifrado. El código es la única forma de leer el historial cifrado en otro
 * dispositivo: el servidor no puede recuperarlo ni ver los mensajes.
 */
export function E2eeBackupModal({
  code,
  onClose,
  returnFocusRef,
  checkActor = denyUnverifiedActor,
}: {
  code: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  checkActor?: E2eeActorCheck;
}) {
  const [visibleCode, setVisibleCode] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [escapeNotice, setEscapeNotice] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const invalidate = useCallback(() => {
    setVisibleCode(null);
    setCopied(false);
    setCopyError("");
    setEscapeNotice("");
    setBlocked(true);
    // Cerrar inmediatamente, antes del siguiente commit de React.
    dialogRef.current?.close();
  }, []);
  const guard = useE2eeSessionGuard(checkActor, invalidate);
  const groups = visibleCode?.match(/.{1,6}/gu)?.join(" ") ?? "";

  useEffect(() => {
    const ticket = guard.ticket();
    let cancelled = false;
    setVisibleCode(null);
    void guard.authorize(ticket).then((ok) => {
      if (ok && !cancelled && guard.current(ticket)) setVisibleCode(code);
    });
    return () => {
      cancelled = true;
    };
  }, [code, guard]);

  useEffect(() => {
    if (!visibleCode) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      const target =
        previousFocus instanceof HTMLElement &&
        previousFocus !== document.body &&
        previousFocus.isConnected
          ? previousFocus
          : returnFocusRef?.current;
      target?.focus({ preventScroll: true });
    };
  }, [returnFocusRef, visibleCode]);

  async function copyCode() {
    const ticket = guard.ticket();
    if (!visibleCode || !(await guard.authorize(ticket))) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(visibleCode);
      if (guard.current(ticket)) setCopied(true);
    } catch {
      if (guard.current(ticket))
        setCopyError("No pudimos copiarlo. Escríbelo o descárgalo.");
    }
  }

  async function downloadCode() {
    const ticket = guard.ticket();
    if (!visibleCode || !(await guard.authorize(ticket))) return;
    const blob = new Blob(
      [
        "Nido — código de recuperación de mensajes cifrados\n\n",
        `${groups}\n\n`,
        "Guárdalo en un lugar seguro. Sin este código no se puede leer el\n",
        "historial en un dispositivo nuevo, y nadie (tampoco Nido) puede\n",
        "recuperarlo.\n",
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nido-codigo-recuperacion.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (blocked || !visibleCode) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.modalOverlay}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (
          event.shiftKey &&
          (active === first || active === titleRef.current || active === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        // Escape no equivale a haber guardado la única recuperación disponible.
        // Siempre hay una salida explícita, incluso sin copiar el código.
        event.preventDefault();
        setEscapeNotice(
          "Elige «Ya lo guardé» o «Continuar sin guardarlo» para cerrar este aviso.",
        );
      }}
    >
      <div className={styles.modalCard}>
        <h2
          ref={titleRef}
          id={titleId}
          className={styles.modalTitle}
          tabIndex={-1}
        >
          Guarda tu código de recuperación
        </h2>
        <p id={descriptionId} className={styles.modalText}>
          Tus mensajes están cifrados de extremo a extremo: solo tú y la otra
          persona pueden leerlos. Este código es la única manera de verlos en
          otro dispositivo. <strong>Ni Nido puede recuperarlo</strong>.
        </p>
        <code className={styles.recoveryCode}>{groups}</code>
        <div className={styles.modalActions}>
          <button type="button" className="button secondary" onClick={copyCode}>
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={downloadCode}
          >
            Descargar
          </button>
          <button type="button" className="button human" onClick={onClose}>
            Ya lo guardé
          </button>
        </div>
        {copyError ? (
          <p className="form-error" role="alert">
            {copyError}
          </p>
        ) : null}
        {escapeNotice ? (
          <p className={styles.modalText} role="status">
            {escapeNotice}
          </p>
        ) : null}
        <button type="button" className={styles.modalSkip} onClick={onClose}>
          Continuar sin guardarlo (no podré leer mi historial en otro
          dispositivo)
        </button>
      </div>
    </dialog>
  );
}
