"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  type DeleteMyAccountState,
  deleteMyAccount,
} from "@/app/actions-account";
import { clearChatSessionCookies } from "@/app/actions-chat-session";
import { completeChatSignOut } from "@/lib/chat-session-end";

const authClient = createAuthClient();

/**
 * Controles de cuenta para profesionales: cerrar sesión y borrar la cuenta.
 * Se muestra aunque el onboarding no esté terminado (ver `deleteMyAccount`).
 */
export function AccountActions() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const initialDeleteState: DeleteMyAccountState = { error: null };
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteMyAccount,
    initialDeleteState,
  );

  async function onSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await completeChatSignOut(clearChatSessionCookies, () =>
        authClient.signOut(),
      );
    } catch {
      setSignOutError(
        "No se pudo cerrar la sesión. Revisa tu conexión y reintenta.",
      );
      setSigningOut(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div
      style={{
        marginTop: "var(--space-10)",
        paddingTop: "var(--space-6)",
        borderTop: "1px solid var(--border)",
        display: "grid",
        gap: "var(--space-4)",
        maxWidth: "26rem",
      }}
    >
      <button
        type="button"
        className="button secondary"
        onClick={onSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
      >
        {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>

      {signOutError ? (
        <p className="form-error" role="alert">
          {signOutError}
        </p>
      ) : null}
      <details className="disclosure">
        <summary>Borrar mi cuenta</summary>
        <div className="disclosure-body">
          <p className="hint">
            Se eliminarán de forma permanente tu cuenta y, si lo creaste, tu
            perfil profesional. Los mensajes que hayas enviado al equipo de
            coordinación se conservan para poder darles seguimiento; puedes
            pedir que los eliminemos desde la página de contacto. Esta acción no
            se puede deshacer.
          </p>
          <form action={deleteAction}>
            <button
              type="submit"
              className="button danger"
              disabled={deleting}
              aria-busy={deleting}
            >
              {deleting ? "Borrando…" : "Sí, borrar mi cuenta definitivamente"}
            </button>
            {deleteState.error ? (
              <p className="form-error" role="alert">
                {deleteState.error}
              </p>
            ) : null}
          </form>
        </div>
      </details>
    </div>
  );
}
