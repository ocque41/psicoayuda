"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  loadPatientNoteVersion,
  type NoteVersion,
  type NoteVersionInput,
} from "@/app/pro/pacientes/[patientId]/note-version-actions";
import { noteDraftGeneration } from "@/lib/practice/note-drafts";
import styles from "./note-conflict.module.css";

export function NoteConflictRecovery({
  input,
  draft,
  disabled,
  onBusy,
  onAccept,
  onDenied,
  onKeep,
}: {
  input: NoteVersionInput;
  draft: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onAccept: (version: NoteVersion, keepDraft: boolean) => void;
  onDenied: (accountChanged: boolean, message: string) => void;
  onKeep: () => void;
}) {
  const id = useId();
  const [version, setVersion] = useState<NoteVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const copy = useRef<HTMLTextAreaElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const replaceButton = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      onBusy(false);
    },
    [onBusy],
  );
  useEffect(() => {
    if (busy) return;
    if (message) feedback.current?.focus();
    else if (version) heading.current?.focus();
  }, [version, busy, message]);
  useEffect(() => {
    if (confirmReplace) confirmation.current?.focus();
  }, [confirmReplace]);
  async function consult(choice?: "draft" | "saved") {
    if (operation.current || disabled) return;
    operation.current = true;
    setBusy(true);
    onBusy(true);
    setMessage("");
    const epoch = noteDraftGeneration();
    const mount = generation.current;
    const active = () =>
      epoch === noteDraftGeneration() && mount === generation.current;
    try {
      const result = await loadPatientNoteVersion(input);
      if (!active()) return;
      if (!result.ok) {
        setVersion(null);
        setConfirmReplace(false);
        setReviewed(false);
        if (result.accessDenied)
          onDenied(!!result.accountChanged, result.message);
        else setMessage(result.message);
        return;
      }
      const latest = result.version;
      if (choice && version) {
        if (
          latest.id !== version.id ||
          latest.revision !== version.revision ||
          latest.content !== version.content ||
          latest.updatedAt !== version.updatedAt
        ) {
          setVersion(latest);
          setConfirmReplace(false);
          setReviewed(false);
          setMessage(
            "La versión guardada volvió a cambiar. Revisa el texto actualizado antes de elegir; tu borrador se conserva.",
          );
          return;
        }
        onAccept(latest, choice === "draft");
        setConfirmReplace(false);
        setReviewed(false);
        setMessage(
          choice === "draft"
            ? "Tu borrador permanece sin guardar. Combina tus cambios con la versión consultada antes de guardar."
            : "",
        );
        return;
      }
      setVersion(latest);
    } catch {
      if (active()) {
        setVersion(null);
        setConfirmReplace(false);
        setReviewed(false);
        setMessage(
          "No pudimos consultar la versión guardada. Tu borrador sigue aquí; reintenta.",
        );
      }
    } finally {
      if (active()) {
        operation.current = false;
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <section
      className={styles.panel}
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <h3 ref={heading} id={`${id}-title`} tabIndex={-1}>
        Revisar el conflicto
      </h3>
      <p>
        Tu borrador sigue en el editor. Consultar la versión guardada no
        reemplaza tu texto ni guarda cambios.
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={busy || disabled}
        onClick={() => void consult()}
      >
        {busy ? "Comprobando acceso y versión…" : "Consultar versión guardada"}
      </button>
      {message ? (
        <p ref={feedback} role="status" tabIndex={-1}>
          {message}
        </p>
      ) : null}
      {version ? (
        <>
          <div className={styles.versions}>
            <label htmlFor={`${id}-draft`}>
              Mi borrador sin guardar
              <textarea
                ref={copy}
                id={`${id}-draft`}
                readOnly
                value={draft}
                rows={6}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label htmlFor={`${id}-saved`}>
              Versión guardada
              <textarea
                id={`${id}-saved`}
                readOnly
                value={version.content}
                rows={6}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={busy || disabled}
            onClick={() => {
              copy.current?.focus();
              copy.current?.select();
            }}
          >
            Seleccionar mi borrador
          </button>
          <p>
            Para combinar los cambios, puedes preparar tu borrador sobre esta
            versión. Sólo se escribirá cuando pulses Guardar nota, y se
            comprobará de nuevo que no haya cambiado.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="button human"
              disabled={busy || disabled}
              onClick={() => void consult("draft")}
            >
              Revisé la versión; continuar con mi borrador
            </button>
            <button
              ref={replaceButton}
              type="button"
              className="button secondary"
              disabled={busy || disabled}
              onClick={() => {
                setConfirmReplace(true);
                setReviewed(false);
              }}
            >
              Usar versión guardada
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || disabled}
              onClick={() => {
                setVersion(null);
                setMessage("");
                setConfirmReplace(false);
                setReviewed(false);
                onKeep();
              }}
            >
              Cerrar comparación y seguir editando
            </button>
          </div>
          {confirmReplace ? (
            <div className={styles.confirm}>
              <p>
                Esto reemplazará el borrador del editor por la versión
                consultada. No guarda ni elimina nada en el servidor.
              </p>
              <label>
                <input
                  ref={confirmation}
                  type="checkbox"
                  disabled={busy || disabled}
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                He conservado los cambios del borrador que necesito.
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={!reviewed || busy || disabled}
                onClick={() => void consult("saved")}
              >
                Confirmar uso de la versión guardada
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || disabled}
                onClick={() => {
                  setConfirmReplace(false);
                  setReviewed(false);
                  replaceButton.current?.focus();
                }}
              >
                Cancelar reemplazo
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
