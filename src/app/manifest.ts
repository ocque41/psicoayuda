import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_LANG, SITE_NAME } from "@/lib/site";

/**
 * Web App Manifest. Mejora la experiencia móvil (donde ocurre la mayoría de
 * las búsquedas de salud mental) y refuerza la identidad de marca.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Ayuda psicológica gratis en Venezuela`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: SITE_LANG,
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf6f0",
    theme_color: "#2f7a5b",
    categories: ["health", "medical", "lifestyle"],
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/brand/nido-icon-180.png",
        type: "image/png",
        sizes: "180x180",
        purpose: "maskable",
      },
      {
        src: "/brand/nido-icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/brand/nido-icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "maskable",
      },
      {
        src: "/brand/nido-icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/brand/nido-icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
