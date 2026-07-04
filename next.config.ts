import type { NextConfig } from "next";

// Cabeceras de seguridad aplicadas a todas las rutas. La CSP permite los
// scripts/estilos en línea que Next inyecta para hidratar (por eso 'unsafe-inline'
// en script/style); las directivas frame-ancestors/object-src/base-uri/form-action
// sí endurecen sin romper la app (anti-clickjacking, anti-inyección de base/forms).
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  // static.cloudflareinsights.com: script del beacon de Cloudflare Web Analytics
  // (cuenta visitas, sin cookies). cloudflareinsights.com en connect-src: adonde
  // el beacon envía las métricas. El resto sigue restringido a 'self' (nuestro
  // propio beacon de clics va a /api/track, mismo origen).
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "font-src 'self' data:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(), microphone=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // El alta profesional envía el comprobante (hasta ~1,2 MB en base64) y la foto
  // (~300 KB) dentro del body de la server action. El límite por defecto de Next
  // es 1 MB: con un documento cercano al máximo, la petición se rechazaba entera
  // y el registro fallaba justo al enviar. 3 MB cubre documento + foto + campos.
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  // Don't advertise the framework on every response (tiny header savings + less fingerprinting).
  poweredByHeader: false,
  // Surface unsafe lifecycles / side effects early; no production runtime cost.
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
