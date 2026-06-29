import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/site";

/**
 * robots.txt generado.
 *
 * Permite el rastreo del contenido público y bloquea rutas privadas o
 * transaccionales que no aportan valor de búsqueda y no deben indexarse:
 * panel de administración, API, panel/onboarding profesional y la página
 * de confirmación tras enviar una solicitud.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/pro/dashboard",
        "/pro/onboarding",
        "/ayuda/gracias",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
