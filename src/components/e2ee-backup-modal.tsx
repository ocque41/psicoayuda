"use client";

import { useState } from "react";
import styles from "./e2ee.module.css";

/**
 * Se muestra UNA vez, cuando este dispositivo genera la primera clave de
 * cifrado. El código es la única forma de leer el historial cifrado en otro
 * dispositivo: el servidor no puede recuperarlo ni ver los mensajes.
 */
export function E2eeBackupModal({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const groups = code.match(/.{1,6}/gu)?.join(" ") ?? code;

  async function copyCode() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopyError("No pudimos copiarlo. Escríbelo o descárgalo.");
    }
  }

  function downloadCode() {
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

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Guarda tu código de recuperación"
    >
      <div className={styles.modalCard}>
        <h2 className={styles.modalTitle}>Guarda tu código de recuperación</h2>
        <p className={styles.modalText}>
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
        <button type="button" className={styles.modalSkip} onClick={onClose}>
          Continuar sin guardarlo (no podré leer mi historial en otro
          dispositivo)
        </button>
      </div>
    </div>
  );
}
