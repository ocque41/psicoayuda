"use client";

import { useId, useRef, useState } from "react";

/** Palabra exacta (en mayúsculas) que hay que escribir para poder borrar. */
const CONFIRM_WORD = "ELIMINAR";

export function AdminDeleteAccountForm({
  action,
  userId,
  accountLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  accountLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const titleId = useId();
  const inputId = useId();

  // Case-sensitive a propósito: hay que escribir ELIMINAR en MAYÚSCULAS.
  const canDelete = confirmText === CONFIRM_WORD;

  const openDialog = () => {
    setConfirmText("");
    dialogRef.current?.showModal();
  };
  const closeDialog = () => dialogRef.current?.close();

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Reconfirmación: el botón ya está deshabilitado sin la palabra exacta,
        // pero revalidamos aquí por si se fuerza el submit (p. ej. devtools).
        if (!canDelete) {
          event.preventDefault();
          return;
        }
        setDeleting(true);
      }}
    >
      <input name="userId" type="hidden" value={userId} />

      {/* El botón principal ya NO borra directo: abre el modal de confirmación. */}
      <button
        type="button"
        className="button danger"
        onClick={openDialog}
        disabled={deleting}
        aria-busy={deleting}
      >
        {deleting ? "Borrando…" : "Borrar cuenta"}
      </button>

      {/* Modal con <dialog> nativo (Escape, foco atrapado y backdrop de serie).
          Cierra al pulsar el backdrop; el submit dispara la server action. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape lo maneja el <dialog> nativo */}
      <dialog
        ref={dialogRef}
        className="org-dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeDialog();
        }}
        onClose={() => setConfirmText("")}
      >
        <div className="org-dialog-body">
          <div className="org-dialog-head">
            <h3 id={titleId} className="org-dialog-title">
              Borrar cuenta
            </h3>
            <button
              type="button"
              className="org-dialog-close"
              onClick={closeDialog}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <p className="org-dialog-desc">
            Vas a borrar definitivamente la cuenta{" "}
            <strong>{accountLabel}</strong> y sus sesiones. Esta acción{" "}
            <strong>no se puede deshacer</strong>.
          </p>

          <div className="field" style={{ marginTop: "var(--space-5)" }}>
            <label htmlFor={inputId}>
              Escribe <strong>{CONFIRM_WORD}</strong> para confirmar
            </label>
            <input
              id={inputId}
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="org-dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={closeDialog}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button danger"
              disabled={!canDelete || deleting}
              aria-busy={deleting}
              data-error-context="Borrar una cuenta desde administración"
            >
              {deleting ? "Borrando…" : "Sí, eliminar cuenta"}
            </button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
