"use client";

import { useCallback, useId, useState } from "react";
import { loadRecoveryKeystore } from "@/app/actions-e2ee";
import { useE2eeSessionGuard } from "@/components/use-e2ee-session-guard";
import { restoreFromBackup } from "@/lib/e2ee-client";
import type { E2eeActorCheck } from "@/lib/e2ee-session-guard";
import { recoveryIdFor } from "@/shared/e2ee";
import styles from "./chat.module.css";

const denyUnverifiedActor = async () => ({ ok: false });

/**
 * Pantalla de restauración: este dispositivo no tiene la clave de cifrado pero
 * el historial (o el otro dispositivo) sí existe. Dos salidas: recuperar con el
 * código, o empezar de cero (el historial anterior deja de ser legible aquí).
 */
export function E2eeRestorePanel({
  audience,
  recoveryScope,
  onRestored,
  onUseNewKeys,
  checkActor = denyUnverifiedActor,
}: {
  audience: "seeker" | "professional";
  recoveryScope?: string;
  /** Devuelve true si la clave de ESTA sala quedó disponible. */
  onRestored: () => Promise<boolean>;
  onUseNewKeys: () => Promise<void>;
  checkActor?: E2eeActorCheck;
}) {
  const inputId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const invalidate = useCallback(() => {
    setCode("");
    setError("");
    setConfirmNew(false);
    setBusy(false);
    setBlocked(true);
  }, []);
  const guard = useE2eeSessionGuard(checkActor, invalidate);

  async function restore() {
    const ticket = guard.ticket();
    if (!(await guard.authorize(ticket))) return;
    setBusy(true);
    setError("");
    try {
      const id = await recoveryIdFor(code);
      if (!guard.current(ticket)) return;
      if (!id) {
        setError(
          "Ese código no es válido. Revisa que tenga 26 caracteres (se pueden escribir con o sin espacios).",
        );
        return;
      }
      const stored = await loadRecoveryKeystore(id);
      if (!(await guard.authorize(ticket))) return;
      if (!stored) {
        setError(
          "No encontramos ningún respaldo con ese código. Si no llegaste a guardarlo, tendrás que empezar de cero.",
        );
        return;
      }
      const result = await restoreFromBackup(
        code,
        stored.wrapped,
        recoveryScope,
        () => guard.current(ticket),
      );
      if (!(await guard.authorize(ticket))) return;
      if (!result.ok) {
        setError(
          "No pudimos abrir el respaldo. Revisa el código e inténtalo de nuevo.",
        );
        return;
      }
      const usable = await onRestored();
      if (!guard.current(ticket)) return;
      if (!usable) {
        setError(
          "El respaldo no contiene la clave de esta conversación (quizá se guardó antes de crearla).",
        );
      }
    } catch {
      if (guard.current(ticket))
        setError("No pudimos restaurar en este momento. Inténtalo de nuevo.");
    } finally {
      if (guard.current(ticket)) setBusy(false);
    }
  }

  async function startFresh() {
    const ticket = guard.ticket();
    if (!confirmNew || !(await guard.authorize(ticket))) return;
    setBusy(true);
    setError("");
    try {
      await onUseNewKeys();
    } catch {
      if (guard.current(ticket))
        setError(
          "No pudimos confirmar la nueva clave. Recarga la página antes de reintentar.",
        );
    } finally {
      if (guard.current(ticket)) setBusy(false);
    }
  }

  if (blocked)
    return (
      <p role="status">
        La sesión cambió o caducó. Verifica tu cuenta antes de restaurar el
        cifrado.
      </p>
    );

  return (
    <div className={styles.restore}>
      <h2 className={styles.restoreTitle}>Recupera el acceso a tus mensajes</h2>
      <p className={styles.restoreText}>
        {audience === "seeker"
          ? "Esta conversación está cifrada de extremo a extremo y este dispositivo no tiene la clave."
          : "El historial cifrado con otra clave solo se puede leer con tu código de recuperación. El mismo código sirve para todas tus conversaciones."}{" "}
        Escribe tu código para volver a leer los mensajes anteriores.
      </p>

      <label className={styles.restoreLabel} htmlFor={inputId}>
        Código de recuperación
      </label>
      <input
        id={inputId}
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
