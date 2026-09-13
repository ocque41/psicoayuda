"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteConversation } from "@/app/c/[conversationId]/actions";

/**
 * Borrado definitivo y bilateral de una conversación (persona o profesional).
 * Doble paso en línea: el botón se convierte en confirmación con la advertencia
 * clara (no hay vuelta atrás) antes de ejecutar. Al terminar navega fuera del
 * chat, porque el link deja de existir.
 */
export function ConversationDeleteButton({
  conversationId,
  redirectTo,
  label = "Borrar conversación",
  className = "button secondary danger",
}: {
  conversationId: string;
  redirectTo: string;
  label?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteConversation(conversationId).catch(() => ({
        ok: false as const,
        message: "No pudimos borrar la conversación. Inténtalo de nuevo.",
      }));
      if (result.ok) {
        router.push(redirectTo);
        router.refresh();
      } else {
        setConfirming(false);
        setError(result.message);
      }
    });
  }

  return (
    <div className="conversation-delete">
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirmar borrado de la conversación"
        >
          <p className="muted conversation-delete-warning">
            Se borrará para siempre, también para la otra persona, y el link
            dejará de funcionar. No se puede deshacer.
          </p>
          <div className="conversation-delete-actions">
            <button
              type="button"
              className="button danger"
              onClick={handleDelete}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Borrando…" : "Sí, borrar para siempre"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setConfirming(false)}
              disabled={pending}
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
