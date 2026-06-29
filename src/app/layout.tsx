import "@/app/globals.css";
import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Nido — apoyo psicológico voluntario, gratis y a distancia",
  description:
    "¿Estás pasando por un momento difícil? Te ayudamos a conectar, gratis y a distancia, con psicólogas y psicólogos voluntarios verificados. Sin crear cuenta.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={hanken.variable}>
      <body>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <header className="topbar">
          <nav className="container nav" aria-label="Principal">
            <Link className="brand" href="/" aria-label="Nido, inicio">
              Nido
            </Link>
            <div className="nav-links">
              <Link href="/ayuda">Pedir ayuda</Link>
              <Link href="/recursos">Recursos</Link>
              <Link href="/pro">Soy profesional</Link>
            </div>
          </nav>
        </header>
        <main id="contenido">{children}</main>
        <footer className="footer">
          <div className="container">
            <nav className="footer-links" aria-label="Legal">
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
              <Link href="/recursos">Recursos</Link>
            </nav>
            <p className="footer-note">
              Nido es un proyecto sin fines de lucro y de código abierto.
              La atención la brindan personas voluntarias verificadas. No
              atiende emergencias en tiempo real.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
