"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  publishProIdentityKey,
  saveRecoveryKeystore,
  verifyProfessionalE2eeActor,
} from "@/app/actions-e2ee";
import { E2eeRestorePanel } from "@/app/c/[conversationId]/e2ee-restore-panel";
import { persistRecoveryBackup } from "@/lib/e2ee-backup";
import {
  getOrCreateIdentity,
  loadProfessionalIdentity,
  professionalSlot,
  replaceIdentity,
} from "@/lib/e2ee-client";
import styles from "./e2ee.module.css";
import { E2eeBackupModal } from "./e2ee-backup-modal";
import { useE2eeSessionGuard } from "./use-e2ee-session-guard";

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
  professionalId,
}: {
  /** Clave pública E2EE ya publicada en la ficha (null si no hay ninguna). */
  accountPublicKey: string | null;
  professionalId: string;
}) {
  return (
    <ProfessionalSetup
      key={professionalId}
      accountPublicKey={accountPublicKey}
      professionalId={professionalId}
    />
  );
}

function ProfessionalSetup({
  accountPublicKey,
  professionalId,
}: {
  accountPublicKey: string | null;
  professionalId: string;
}) {
  const slot = professionalSlot(professionalId);
  const [hasLocalKey, setHasLocalKey] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const backupTriggerRef = useRef<HTMLButtonElement>(null);
  const [code, setCode] = useState<string | null>(null);

  const [blocked, setBlocked] = useState(false);
  const invalidate = useCallback(() => {
    setBlocked(true);
    setHasLocalKey(false);
    setNeedsKey(false);
    setBusy(false);
    setCode(null);
    setError("");
  }, []);
  const checkActor = useCallback(
    () => verifyProfessionalE2eeActor(professionalId),
    [professionalId],
  );
  const guard = useE2eeSessionGuard(checkActor, invalidate);

  const showOrCreateBackup = useCallback(async () => {
    const ticket = guard.ticket();
    if (!(await guard.authorize(ticket))) return;
    setError("");
    setBusy(true);
    try {
      const backup = await persistRecoveryBackup(
        "professional",
        saveRecoveryKeystore,
        slot,
      );
      // Comprobar también el actor después de cualquier respuesta tardía.
      if (!(await guard.authorize(ticket))) return;
      if (backup.ok) setCode(backup.code);
      else
        setError(
          "No pudimos guardar tu respaldo. Puedes reintentarlo con el mismo código.",
        );
    } finally {
      if (guard.current(ticket)) setBusy(false);
    }
  }, [guard, slot]);

  useEffect(() => {
    const ticket = guard.ticket();
    let cancelled = false;
    const current = () => !cancelled && guard.current(ticket);
    const authorize = async () =>
      current() && (await guard.authorize(ticket)) && current();
    setBusy(true);
    setHasLocalKey(false);
    setNeedsKey(false);
    setCode(null);
    setError("");
    void (async () => {
      try {
        if (!(await authorize())) return;
        const existing = await loadProfessionalIdentity(
          professionalId,
          accountPublicKey,
        );
        if (!(await authorize())) return;
        if (existing) {
          if (!accountPublicKey || accountPublicKey === existing.publicKey) {
            const result = await publishProIdentityKey(
              existing.publicKey,
              undefined,
              professionalId,
            );
            if (!(await authorize())) return;
            if (!result.ok) setNeedsKey(true);
            else setHasLocalKey(true);
          } else setNeedsKey(true);
          return;
        }
        if (accountPublicKey) {
          setNeedsKey(true);
          return;
        }
        const { identity } = await getOrCreateIdentity(slot);
        if (!(await authorize())) return;
        const published = await publishProIdentityKey(
          identity.publicKey,
          undefined,
          professionalId,
        );
        if (!(await authorize())) return;
        if (!published.ok) {
          setError(
            "No pudimos guardar tu clave. Recarga la página e inténtalo de nuevo.",
          );
          return;
        }
        setHasLocalKey(true);
        await showOrCreateBackup();
      } catch {
        if (current())
          setError("No pudimos activar el cifrado en este dispositivo.");
      } finally {
        if (current()) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountPublicKey, professionalId, slot, guard, showOrCreateBackup]);

  if (blocked)
    return (
      <p role="status">
        La sesión cambió o caducó.{" "}
        <a href="/pro/dashboard">
          Verifica tu cuenta para gestionar el cifrado.
        </a>
      </p>
    );

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
            solo en los dispositivos donde la creaste. Tienes UN solo código
            para todas tus conversaciones: recupérala con él o crea una nueva
            aquí (el historial anterior dejará de poder leerse).
          </p>
          <E2eeRestorePanel
            audience="professional"
            recoveryScope={slot}
            checkActor={checkActor}
            onRestored={async () => {
              const ticket = guard.ticket();
              if (!(await guard.authorize(ticket))) return false;
              const restored = await loadProfessionalIdentity(
                professionalId,
                accountPublicKey,
              );
              if (!restored || !(await guard.authorize(ticket))) return false;
              if (
                !(
                  await publishProIdentityKey(
                    restored.publicKey,
                    undefined,
                    professionalId,
                  )
                ).ok
              )
                return false;
              if (!(await guard.authorize(ticket))) return false;
              setNeedsKey(false);
              setHasLocalKey(true);
              return true;
            }}
            onUseNewKeys={async () => {
              const ticket = guard.ticket();
              if (!(await guard.authorize(ticket))) return;
              const { identity } = await replaceIdentity(slot);
              if (!(await guard.authorize(ticket))) return;
              if (
                !(
                  await publishProIdentityKey(
                    identity.publicKey,
                    accountPublicKey,
                    professionalId,
                  )
                ).ok
              )
                throw new Error(
                  "La cuenta tiene otra clave. Recarga para recuperarla.",
                );
              if (!(await guard.authorize(ticket))) return;
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
              ? "Listo: tus conversaciones se cifran en tu dispositivo y Nido no puede leer su contenido. Un único código de recuperación sirve para TODAS tus conversaciones; guárdalo para poder leerlas en otro dispositivo."
              : "Preparando la clave de este dispositivo…"}
          </p>
          {hasLocalKey && !code ? (
            <button
              ref={backupTriggerRef}
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
        <E2eeBackupModal
          code={code}
          checkActor={checkActor}
          onClose={() => setCode(null)}
          returnFocusRef={backupTriggerRef}
        />
      ) : null}
    </div>
  );
}
