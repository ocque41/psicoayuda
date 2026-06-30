import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
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
              <Image
                className="brand-logo"
                src="/brand/nido-icon-128.png"
                width="128"
                height="128"
                alt="Nido"
              />
            </Link>
            <SiteNav />
          </nav>
        </header>
        <main id="contenido">{children}</main>
        <footer className="footer">
          <div className="container">
            <nav className="footer-links" aria-label="Enlaces del sitio">
              <Link href="/como-funciona">Cómo funciona</Link>
              <Link href="/quienes-somos">Quiénes somos</Link>
              <Link href="/psicologos">Psicólogos voluntarios</Link>
              <Link href="/preguntas-frecuentes">Preguntas frecuentes</Link>
              <Link href="/seguridad">Seguridad</Link>
              <Link href="/transparencia">Transparencia</Link>
              <Link href="/recursos">Recursos</Link>
              <Link href="/emergencia">Emergencia</Link>
              <Link href="/situacion">Situación del terremoto</Link>
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
