import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteJsonLd } from "@/components/structured-data";
import {
  SITE_DESCRIPTION,
  SITE_GOOGLE_VERIFICATION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  SITE_NAME,
  SITE_TITLE_DEFAULT,
  SITE_TITLE_TEMPLATE,
  SITE_URL,
} from "@/lib/site";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE_DEFAULT,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "health",
  alternates: {
    canonical: "/",
    languages: {
      "es-VE": "/",
      es: "/",
    },
  },
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
  verification: SITE_GOOGLE_VERIFICATION
    ? { google: SITE_GOOGLE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f7a5b",
  colorScheme: "light",
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
              <svg
                className="brand-flag"
                viewBox="0 0 30 20"
                width="26"
                height="17"
                role="img"
                aria-label="Venezuela"
              >
                <title>Venezuela</title>
                <rect width="30" height="20" rx="2.5" fill="#FCD116" />
                <rect y="6.667" width="30" height="6.667" fill="#00247D" />
                <rect y="13.333" width="30" height="6.667" fill="#CF142B" />
                <g fill="#ffffff">
                  <circle cx="7.5" cy="9.0" r="0.62" />
                  <circle cx="9.6" cy="9.7" r="0.62" />
                  <circle cx="11.8" cy="10.1" r="0.62" />
                  <circle cx="13.9" cy="10.4" r="0.62" />
                  <circle cx="16.1" cy="10.4" r="0.62" />
                  <circle cx="18.2" cy="10.1" r="0.62" />
                  <circle cx="20.4" cy="9.7" r="0.62" />
                  <circle cx="22.5" cy="9.0" r="0.62" />
                </g>
              </svg>
              <span>Nido</span>
            </Link>
            <div className="nav-links">
              <Link href="/ayuda">Pedir ayuda</Link>
              <Link href="/profesionales">Profesionales</Link>
              <Link href="/recursos">Recursos</Link>
              <Link href="/pro">Soy profesional</Link>
            </div>
          </nav>
        </header>
        <main id="contenido">{children}</main>
        <footer className="footer">
          <div className="container">
            <nav className="footer-links" aria-label="Enlaces del sitio">
              <Link href="/como-funciona">Cómo funciona</Link>
              <Link href="/quienes-somos">Quiénes somos</Link>
              <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>
              <Link href="/seguridad">Seguridad</Link>
              <Link href="/transparencia">Transparencia</Link>
              <Link href="/recursos">Recursos</Link>
              <Link href="/emergencia">Emergencia</Link>
              <Link href="/contacto">Contacto</Link>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
            </nav>
            <p className="footer-note">
              Nido es un proyecto sin fines de lucro y de código abierto. La
              atención la brindan personas voluntarias verificadas. No atiende
              emergencias en tiempo real.
            </p>
          </div>
        </footer>
        <SiteJsonLd />
      </body>
    </html>
  );
}
