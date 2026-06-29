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
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
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
  // Don't advertise the framework on every response (tiny header savings + less fingerprinting).
  poweredByHeader: false,
  // Surface unsafe lifecycles / side effects early; no production runtime cost.
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
