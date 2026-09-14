"use client";

import { useEffect, useState } from "react";
import {
  publishProIdentityKey,
  saveRecoveryKeystore,
} from "@/app/actions-e2ee";
import {
  createRecoveryBackup,
  getOrCreateIdentity,
  getStoredRecoveryCode,
  PRO_SLOT,
  refreshRecoveryBackup,
} from "@/lib/e2ee-client";
import styles from "./e2ee.module.css";
import { E2eeBackupModal } from "./e2ee-backup-modal";

/**
 * Primer paso del E2EE para el profesional: al entrar al panel, este
 * dispositivo genera su clave, la publica en su ficha (para que las personas
 * puedan cifrarle) y muestra el código de recuperación UNA vez. Sin clave
 * publicada, las personas no pueden escribirle: el chat queda en espera.
 *
 * Si ya existe una clave local (p. ej. la creó al abrir una sala), solo la
 * republica y ofrece ver/crear el respaldo.
 */
export function E2eeProSetupBanner() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { identity } = await getOrCreateIdentity(PRO_SLOT);
        if (cancelled) return;
        const published = await publishProIdentityKey(identity.publicKey);
        if (cancelled) return;
        if (!published.ok) {
          setError(
            "No pudimos guardar tu clave. Recarga la página e inténtalo de nuevo.",
          );
          return;
        }
        const storedCode = await getStoredRecoveryCode();
        if (storedCode) {
          const refreshed = await refreshRecoveryBackup();
          if (refreshed) {
            await saveRecoveryKeystore(
              refreshed.id,
              refreshed.wrapped,
              "professional",
            );
          }
        } else {
          const created = await createRecoveryBackup();
          if (created) {
            await saveRecoveryKeystore(
              created.id,
              created.wrapped,
              "professional",
            );
            if (!cancelled) setCode(created.code);
          }
        }
      } catch {
        if (!cancelled) {
          setError("No pudimos activar el cifrado en este dispositivo.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function showOrCreateBackup() {
    setError("");
    const stored = await getStoredRecoveryCode();
    if (stored) {
      setCode(stored);
      return;
    }
    const created = await createRecoveryBackup();
    if (!created) {
      setError("No pudimos crear el respaldo en este dispositivo.");
      return;
    }
    await saveRecoveryKeystore(created.id, created.wrapped, "professional");
    setCode(created.code);
  }

  return (
    <div className={styles.setupBanner}>
      <p>
        <strong>Cifrado de extremo a extremo.</strong>{" "}
        {busy
          ? "Preparando la clave de este dispositivo…"
          : "Listo: tus conversaciones se cifran en tu dispositivo y Nido no puede leer su contenido. Guarda tu código de recuperación para poder leerlas en otro dispositivo."}
      </p>
      {!busy && !code ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => void showOrCreateBackup()}
        >
          Ver mi código de recuperación
        </button>
      ) : null}
      {error ? (
        <p className={styles.setupError} role="alert">
          {error}
        </p>
      ) : null}
      {code ? (
        <E2eeBackupModal code={code} onClose={() => setCode(null)} />
      ) : null}
    </div>
  );
}
