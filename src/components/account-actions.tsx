"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMyAccount } from "@/app/actions-account";

const authClient = createAuthClient();

/**
 * Controles de cuenta para profesionales: cerrar sesión y borrar la cuenta.
 * Se muestra aunque el onboarding no esté terminado (ver `deleteMyAccount`).
 */
export function AccountActions() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } catch {
      // Aunque falle el servidor, salimos y refrescamos el estado del cliente.
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

      <details className="disclosure">
        <summary>Borrar mi cuenta</summary>
        <div className="disclosure-body">
          <p className="hint">
            Se eliminarán de forma permanente tu cuenta y, si lo creaste, tu
            perfil profesional. Esta acción no se puede deshacer.
          </p>
          <form action={deleteMyAccount} onSubmit={() => setDeleting(true)}>
            <button
              type="submit"
              className="button"
              disabled={deleting}
              aria-busy={deleting}
              style={{
                background: "var(--danger)",
                borderColor: "var(--danger)",
                color: "#fff",
              }}
            >
              {deleting ? "Borrando…" : "Sí, borrar mi cuenta definitivamente"}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
