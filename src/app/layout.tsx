import "@/app/globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "PsicoAyuda",
  description:
    "Conecta personas afectadas con profesionales voluntarios de apoyo psicológico.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <nav className="container nav" aria-label="Principal">
            <Link href="/" aria-label="PsicoAyuda inicio">
              <strong>PsicoAyuda</strong>
            </Link>
            <div className="nav-links">
              <Link href="/ayuda">Pedir ayuda</Link>
              <Link href="/recursos">Recursos</Link>
              <Link href="/pro">Profesionales</Link>
              <Link href="/admin">Admin</Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <nav className="container footer-links" aria-label="Legal">
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Términos</Link>
            <Link href="/recursos">Recursos</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
