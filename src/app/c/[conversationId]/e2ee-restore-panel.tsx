"use client";

import { useState } from "react";
import { loadRecoveryKeystore } from "@/app/actions-e2ee";
import { restoreFromBackup } from "@/lib/e2ee-client";
import { recoveryIdFor } from "@/shared/e2ee";
import styles from "./chat.module.css";

/**
 * Pantalla de restauración: este dispositivo no tiene la clave de cifrado pero
 * el historial (o el otro dispositivo) sí existe. Dos salidas: recuperar con el
 * código, o empezar de cero (el historial anterior deja de ser legible aquí).
 */
export function E2eeRestorePanel({
  audience,
  onRestored,
  onUseNewKeys,
}: {
  audience: "seeker" | "professional";
  /** Devuelve true si la clave de ESTA sala quedó disponible. */
  onRestored: () => Promise<boolean>;
  onUseNewKeys: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const id = await recoveryIdFor(code);
      if (!id) {
        setError(
          "Ese código no es válido. Revisa que tenga 26 caracteres (se pueden escribir con o sin espacios).",
        );
        return;
      }
      const stored = await loadRecoveryKeystore(id);
      if (!stored) {
        setError(
          "No encontramos ningún respaldo con ese código. Si no llegaste a guardarlo, tendrás que empezar de cero.",
        );
        return;
      }
      const result = await restoreFromBackup(code, stored.wrapped);
      if (!result.ok) {
        setError(
          "No pudimos abrir el respaldo. Revisa el código e inténtalo de nuevo.",
        );
        return;
      }
      const usable = await onRestored();
      if (!usable) {
        setError(
          "El respaldo no contiene la clave de esta conversación (quizá se guardó antes de crearla).",
        );
      }
    } catch {
      setError("No pudimos restaurar en este momento. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function startFresh() {
    setBusy(true);
    await onUseNewKeys();
    setBusy(false);
  }

  return (
    <div className={styles.restore}>
      <h2 className={styles.restoreTitle}>Recupera el acceso a tus mensajes</h2>
      <p className={styles.restoreText}>
        {audience === "seeker"
          ? "Esta conversación está cifrada de extremo a extremo y este dispositivo no tiene la clave."
          : "Tu cuenta tiene la clave de cifrado, pero este dispositivo no."}{" "}
        Sin tu código de recuperación no puedes leer ni escribir aquí: escríbelo
        para volver a leer el historial.
      </p>

      <label className={styles.restoreLabel} htmlFor="e2ee-recovery-code">
        Código de recuperación
      </label>
      <input
        id="e2ee-recovery-code"
        className={styles.restoreInput}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="XXXXXX XXXXXX XXXXXX…"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.modalActions}>
        <button
          type="button"
          className="button human"
          disabled={busy || code.trim().length === 0}
          aria-busy={busy}
          onClick={restore}
        >
          {busy ? "Restaurando…" : "Restaurar mensajes"}
        </button>
      </div>

      <details className={styles.restoreFresh}>
        <summary>¿Perdiste el código? Empezar de cero</summary>
        <p className={styles.restoreText}>
          Se creará una clave nueva en este dispositivo. El historial anterior
          dejará de poder leerse aquí y en cualquier dispositivo sin la clave
          antigua (nadie, tampoco Nido, puede recuperarlo).
        </p>
        <label className={styles.restoreCheck}>
          <input
            type="checkbox"
            checked={confirmNew}
            onChange={(event) => setConfirmNew(event.target.checked)}
          />
          Entiendo que perderé el acceso al historial anterior en este
          dispositivo
        </label>
        <button
          type="button"
          className="button danger"
          disabled={busy || !confirmNew}
          onClick={startFresh}
        >
          Continuar sin historial
        </button>
      </details>
    </div>
  );
}
