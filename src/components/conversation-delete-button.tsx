"use client";

import { useState } from "react";
import { deleteConversation } from "@/app/c/[conversationId]/actions";

/**
 * Borrado con PAPELERA (7 días para deshacer) de una conversación. Doble paso
 * en línea: el botón se convierte en confirmación con la advertencia clara
 * antes de ejecutar. Tras borrar usa navegación DURA (`window.location`): la
 * sala ya no existe para el visitante y así se evita quedarse en una versión
 * cacheada de la página. La contraparte recibe un aviso con enlace para
 * recuperarla durante la ventana.
 */
export function ConversationDeleteButton({
  conversationId,
  redirectTo,
  label = "Borrar conversación",
  className = "button secondary danger",
  asPersona = false,
}: {
  conversationId: string;
  redirectTo: string;
  label?: string;
  className?: string;
  /** El profesional está viendo la sala como la persona: borra con ESA
   *  identidad (cierra el caso en vez de reencolarlo). */
  asPersona?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setBusy(true);
    const result = await deleteConversation(conversationId, asPersona).catch(
      () => ({
        ok: false as const,
        message: "No pudimos borrar la conversación. Inténtalo de nuevo.",
      }),
    );
    if (result.ok) {
      window.location.assign(redirectTo);
      return;
    }
    setBusy(false);
    setConfirming(false);
    setError(result.message);
  }

  return (
    <div className="conversation-delete">
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirmar borrado de la conversación"
        >
          <p className="muted conversation-delete-warning">
            Se ocultará para las dos partes. Tienes 7 días para recuperarla; si
            nadie la recupera, se borrará para siempre y el link dejará de
            funcionar. La otra persona recibirá un aviso con la opción de
            recuperarla.
          </p>
          <div className="conversation-delete-actions">
            <button
              type="button"
              className="button danger"
              onClick={() => void handleDelete()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Borrando…" : "Sí, mover a la papelera"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={className}
          onClick={() => setConfirming(true)}
        >
          {label}
        </button>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
