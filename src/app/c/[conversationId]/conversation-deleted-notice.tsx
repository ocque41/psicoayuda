"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { restoreConversation } from "./actions";
import styles from "./chat.module.css";

/**
 * Pantalla de la PAPELERA: la conversación se borró para las dos partes, pero
 * hay 7 días para deshacerlo. Sin contenido: el historial no se sirve hasta
 * restaurar.
 */
export function ConversationDeletedNotice({
  conversationId,
  purgeAfter,
  asPersona,
}: {
  conversationId: string;
  purgeAfter: number | null;
  asPersona: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const deadline = purgeAfter
    ? new Date(purgeAfter).toLocaleDateString("es-VE", {
        day: "numeric",
        month: "long",
      })
    : null;

  async function restore() {
    setBusy(true);
    setError("");
    const result = await restoreConversation(conversationId, asPersona).catch(
      () => ({
        ok: false as const,
        message: "No pudimos recuperarla. Inténtalo de nuevo.",
      }),
    );
    setBusy(false);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <div className={styles.restore}>
      <h1 className={styles.restoreTitle}>Esta conversación se borró</h1>
      <p className={styles.restoreText}>
        El contenido no se muestra mientras esté en la papelera.
        {deadline
          ? ` Se eliminará para siempre el ${deadline}.`
          : " Se eliminará para siempre en unos días."}{" "}
        Si fue sin querer, puedes recuperarla ahora mismo.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.modalActions}>
        <button
          type="button"
          className="button human"
          onClick={restore}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Recuperando…" : "Recuperar conversación"}
        </button>
      </div>
      <p className={styles.restoreText}>
        Recuperarla no avisa a la otra persona ni cambia el estado del caso.
      </p>
    </div>
  );
}
