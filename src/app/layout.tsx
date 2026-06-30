import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
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
                  <path d="M7.500,10.166 7.713,10.823 8.404,10.823 7.845,11.228 8.058,11.885 7.500,11.479 6.942,11.885 7.155,11.228 6.596,10.823 7.287,10.823Z" />
                  <path d="M9.507,9.143 9.720,9.800 10.410,9.800 9.852,10.205 10.065,10.862 9.507,10.456 8.948,10.862 9.162,10.205 8.603,9.800 9.294,9.800Z" />
                  <path d="M11.649,8.447 11.862,9.103 12.552,9.103 11.994,9.509 12.207,10.165 11.649,9.760 11.091,10.165 11.304,9.509 10.745,9.103 11.436,9.103Z" />
                  <path d="M13.874,8.094 14.087,8.751 14.777,8.751 14.219,9.156 14.432,9.813 13.874,9.407 13.315,9.813 13.529,9.156 12.970,8.751 13.660,8.751Z" />
                  <path d="M16.126,8.094 16.340,8.751 17.030,8.751 16.471,9.156 16.685,9.813 16.126,9.407 15.568,9.813 15.781,9.156 15.223,8.751 15.913,8.751Z" />
                  <path d="M18.351,8.447 18.564,9.103 19.255,9.103 18.696,9.509 18.909,10.165 18.351,9.760 17.793,10.165 18.006,9.509 17.448,9.103 18.138,9.103Z" />
                  <path d="M20.493,9.143 20.706,9.800 21.397,9.800 20.838,10.205 21.052,10.862 20.493,10.456 19.935,10.862 20.148,10.205 19.590,9.800 20.280,9.800Z" />
                  <path d="M22.500,10.166 22.713,10.823 23.404,10.823 22.845,11.228 23.058,11.885 22.500,11.479 21.942,11.885 22.155,11.228 21.596,10.823 22.287,10.823Z" />
                </g>
              </svg>
              <span>Nido</span>
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
