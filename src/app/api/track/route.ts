import { NextResponse } from "next/server";
import { db } from "@/db";
import { clickEvents } from "@/db/schema";
import { newId } from "@/lib/ids";
import { SITE_URL } from "@/lib/site";

// Beacon público de analítica de clics. Lo llama el navegador (sendBeacon) cuando
// alguien pulsa un CTA o un enlace saliente. Guarda un evento SIN PII en D1 para
// medir "qué clickea la gente" y de qué campaña UTM llegó. Diseño defensivo:
// - Solo acepta peticiones del propio sitio (Origin same-site) → corta abuso
//   cross-site trivial sin bloquear a usuarios reales.
// - Trunca todos los campos → un cliente malicioso no puede inflar filas.
// - Nunca lanza hacia el cliente: si algo falla, responde 204 igual (la analítica
//   jamás debe romper la navegación).

const MAX = { type: 40, label: 160, href: 512, page: 256, utm: 120 } as const;

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// ¿La petición viene del propio sitio? En producción el Origin debe ser
// saludmental-venezuela.com; en local, localhost. Si no hay Origin (algún
// sendBeacon no lo manda), lo damos por bueno para no perder eventos legítimos.
function isSameSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    if (host === new URL(SITE_URL).host) return true;
    return host.startsWith("localhost") || host.startsWith("127.0.0.1");
  } catch {
    return false;
  }
}

type TrackBody = {
  type?: unknown;
  label?: unknown;
  href?: unknown;
  page?: unknown;
  utm?: {
    source?: unknown;
    medium?: unknown;
    campaign?: unknown;
    content?: unknown;
  };
};

export async function POST(request: Request) {
  // 204 en todos los caminos de descarte: al cliente le da igual, es fire-and-forget.
  if (!isSameSite(request)) return new NextResponse(null, { status: 204 });

  let body: TrackBody;
  try {
    body = (await request.json()) as TrackBody;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const type = clean(body.type, MAX.type);
  if (!type) return new NextResponse(null, { status: 204 });

  const utm = body.utm ?? {};

  try {
    await db.insert(clickEvents).values({
      id: newId("clk"),
      type,
      label: clean(body.label, MAX.label),
      href: clean(body.href, MAX.href),
      page: clean(body.page, MAX.page),
      utmSource: clean(utm.source, MAX.utm),
      utmMedium: clean(utm.medium, MAX.utm),
      utmCampaign: clean(utm.campaign, MAX.utm),
      utmContent: clean(utm.content, MAX.utm),
      country: request.headers.get("cf-ipcountry"),
      createdAt: new Date(),
    });
  } catch {
    // Si la escritura falla (D1 caído, etc.) no propagamos: la analítica es
    // secundaria y no debe generar errores visibles ni reintentos del navegador.
  }

  return new NextResponse(null, { status: 204 });
}
