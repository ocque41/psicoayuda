"use client";

import { useEffect, useState } from "react";
import {
  publishProIdentityKey,
  saveRecoveryKeystore,
} from "@/app/actions-e2ee";
import { E2eeRestorePanel } from "@/app/c/[conversationId]/e2ee-restore-panel";
import {
  createRecoveryBackup,
  getOrCreateIdentity,
  getStoredRecoveryCode,
  loadIdentity,
  PRO_SLOT,
  replaceIdentity,
} from "@/lib/e2ee-client";
import styles from "./e2ee.module.css";
import { E2eeBackupModal } from "./e2ee-backup-modal";

/**
 * Cifrado de extremo a extremo del profesional, SIEMPRE visible en su panel:
 * aquí (y no dentro de cada chat) se gestiona la clave del dispositivo y su
 * código de recuperación. Tres estados:
 *
 * - Este dispositivo ya tiene la clave: se republica (idempotente) y se puede
 *   ver el código de recuperación.
 * - La cuenta tiene clave pero este dispositivo no: se ofrece recuperarla con
 *   el código o crear una nueva (nunca en silencio: rotar deja ilegible el
 *   historial anterior).
 * - Ni cuenta ni dispositivo tienen clave: se genera y publica, y se muestra
 *   el código UNA vez.
 *
 * Dentro de cada sala el profesional nunca recibe este código: solo un aviso
 * discreto con acceso a este mismo flujo.
 */
export function E2eeProSetupCard({
  accountPublicKey,
}: {
  /** Clave pública E2EE ya publicada en la ficha (null si no hay ninguna). */
  accountPublicKey: string | null;
}) {
  const [hasLocalKey, setHasLocalKey] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await loadIdentity(PRO_SLOT);
        if (cancelled) return;
        if (existing) {
          setHasLocalKey(true);
          // Republicar es idempotente cuando coinciden; si la cuenta tiene otra
          // clave distinta, no pisamos nada: el estado `needsKey` lo decide.
          if (!accountPublicKey || accountPublicKey === existing.publicKey) {
            await publishProIdentityKey(existing.publicKey);
          } else {
            setNeedsKey(true);
          }
          return;
        }
        if (accountPublicKey) {
          // La clave vive en otro dispositivo: decidir con el panel.
          setNeedsKey(true);
          return;
        }
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
        setHasLocalKey(true);
        const created = await createRecoveryBackup();
        if (created) {
          await saveRecoveryKeystore(
            created.id,
            created.wrapped,
            "professional",
          );
          if (!cancelled) setCode(created.code);
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
  }, [accountPublicKey]);

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
      {busy ? (
        <p>
          <strong>Cifrado de extremo a extremo.</strong> Preparando la clave de
          este dispositivo…
        </p>
      ) : needsKey ? (
        <>
          <p>
            <strong>Este dispositivo no tiene tu clave de cifrado.</strong> Tus
            conversaciones están cifradas de extremo a extremo y la clave vive
            solo en los dispositivos donde la creaste. Recupérala con tu código
            de recuperación o crea una nueva aquí (el historial anterior dejará
            de poder leerse).
          </p>
          <E2eeRestorePanel
            audience="professional"
            onRestored={async () => {
              const restored = await loadIdentity(PRO_SLOT);
              if (!restored) return false;
              await publishProIdentityKey(restored.publicKey);
              setNeedsKey(false);
              setHasLocalKey(true);
              return true;
            }}
            onUseNewKeys={async () => {
              const { identity } = await replaceIdentity(PRO_SLOT);
              await publishProIdentityKey(identity.publicKey);
              setNeedsKey(false);
              setHasLocalKey(true);
              await showOrCreateBackup();
            }}
          />
        </>
      ) : (
        <>
          <p>
            <strong>Cifrado de extremo a extremo.</strong>{" "}
            {hasLocalKey
              ? "Listo: tus conversaciones se cifran en tu dispositivo y Nido no puede leer su contenido. Guarda tu código de recuperación para poder leerlas en otro dispositivo."
              : "Preparando la clave de este dispositivo…"}
          </p>
          {hasLocalKey && !code ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => void showOrCreateBackup()}
            >
              Ver mi código de recuperación
            </button>
          ) : null}
        </>
      )}
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
