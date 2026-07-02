import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Crear contraseña nueva",
  robots: { index: false },
};

/**
 * Aterrizaje del enlace de restablecimiento de contraseña. El token viene en
 * la query (?token=…), lo lee el formulario cliente; por eso el Suspense.
 */
export default function RestablecerPage() {
  return (
    <section className="section">
      <div className="container">
        <h1>Crear contraseña nueva</h1>
        <p className="muted">
          Elige una contraseña de al menos 8 caracteres. La usarás junto a tu
          correo para entrar en Nido.
        </p>
        <div className="card auth-panel">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
