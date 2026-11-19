import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Textos de precio de la web pública (estática): siguen al interruptor de cobro
// de wrangler.jsonc, el mismo que lee el Worker. Con el cobro apagado se ven los
// textos de siempre; al encenderlo, el siguiente despliegue muestra los importes
// reales. NIDO_PUBLIC_PRICING=live|legacy lo fuerza en local.
function publicPricingMode() {
  const forced = process.env.NIDO_PUBLIC_PRICING;
  if (forced === "live" || forced === "legacy") return forced;
  try {
    const wrangler = readFileSync(
      join(process.cwd(), "wrangler.jsonc"),
      "utf8",
    );
    const flag = wrangler.match(
      /"NIDO_MEMBERSHIP_BILLING_ENABLED"\s*:\s*"([^"]*)"/,
    )?.[1];
    return flag === "true" ? "live" : "legacy";
  } catch {
    return "legacy";
  }
}

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
  // challenges.cloudflare.com: widget de Turnstile de los formularios de
  // credenciales (script + iframe + fetch del token). Sin estas excepciones la
  // CSP bloquea el widget y el panel no puede validar el formulario.
  // Turbopack usa eval para reconstruir módulos solo durante `next dev`. Sin
  // esta excepción local React no hidrata y no se pueden probar formularios ni
  // métricas en el navegador. El build de producción mantiene la CSP estricta.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://static.cloudflareinsights.com https://challenges.cloudflare.com`,
  "connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
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
  env: { NIDO_PUBLIC_PRICING: publicPricingMode() },
  // Sin binding de Cloudflare Images, /_next/image solo ejecutaría el Worker
  // para devolver el archivo original (sin transformar) y sin caché persistente.
  // Servimos los archivos tal cual (ya redimensionados en public/) para ahorrar
  // esa invocación y aprovechar la caché de assets del edge.
  images: { unoptimized: true },
  // El alta profesional envía el comprobante (hasta ~1,2 MB en base64) y la foto
  // (~300 KB) dentro del body de la server action. El límite por defecto de Next
  // es 1 MB: con un documento cercano al máximo, la petición se rechazaba entera
  // y el registro fallaba justo al enviar. 3 MB cubre documento + foto + campos.
  experimental: {
    // El prerender abre Miniflare para consultar la D1 local. Varios workers de
    // build compartiendo el mismo SQLite provocan SQLITE_BUSY/READONLY y dejan
    // la portada sin datos. Un único worker hace el build determinista.
    cpus: 1,
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  // Don't advertise the framework on every response (tiny header savings + less fingerprinting).
  poweredByHeader: false,
  // Surface unsafe lifecycles / side effects early; no production runtime cost.
  reactStrictMode: true,
  async headers() {
    const documentHeaders = securityHeaders.map((header) => {
      if (header.key === "Content-Security-Policy")
        return {
          key: header.key,
          value:
            "default-src 'none'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        };
      if (header.key === "Referrer-Policy")
        return { key: header.key, value: "no-referrer" };
      return header;
    });
    // Next aplica las reglas en orden: los comprobantes conservan su aislamiento
    // también cuando OpenNext añade las cabeceras globales a la respuesta.
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/admision/documento/:professionalId",
        headers: documentHeaders,
      },
      {
        source: "/api/practice/credential/:professionalId",
        headers: documentHeaders,
      },
    ];
  },
};

export default nextConfig;
