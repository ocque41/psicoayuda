import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

// Métricas para el panel /admin. Depende de la sesión (cookies) → dinámico y sin
// caché. Consulta D1 directamente (agregados) y NUNCA expone datos sensibles.
export const dynamic = "force-dynamic";

type Row = { label: string; n: number };

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as { DB?: D1Database }).DB;
  if (!db) {
    return NextResponse.json({ error: "sin binding DB" }, { status: 500 });
  }

  const notTest = "(label IS NULL OR label != 'VERIF-DESPLIEGUE')";
  const rows = async (sql: string, ...binds: unknown[]) =>
    ((
      await db
        .prepare(sql)
        .bind(...binds)
        .all()
    ).results ?? []) as Row[];
  const num = async (sql: string, ...binds: unknown[]) =>
    (await db
      .prepare(sql)
      .bind(...binds)
      .first<number>("n")) ?? 0;

  const now = Date.now();
  const since24 = now - 24 * 60 * 60 * 1000;

  const [
    total,
    last24,
    bySource,
    byType,
    psychologists,
    aliados,
    recent,
    approvedPros,
    inPersonPros,
    requests,
  ] = await Promise.all([
    num(`SELECT COUNT(*) n FROM click_events WHERE ${notTest}`),
    num(
      `SELECT COUNT(*) n FROM click_events WHERE created_at >= ? AND ${notTest}`,
      since24,
    ),
    rows(
      `SELECT COALESCE(utm_source,'directo') label, COUNT(*) n FROM click_events WHERE ${notTest} GROUP BY 1 ORDER BY n DESC`,
    ),
    rows(
      `SELECT type label, COUNT(*) n FROM click_events WHERE ${notTest} GROUP BY type ORDER BY n DESC`,
    ),
    rows(
      `SELECT label, COUNT(*) n FROM click_events
       WHERE (href LIKE 'https://wa.me/%' OR href LIKE 'tel:%') AND label IS NOT NULL
       AND page IN ('/ayuda','/profesionales','/')
       AND label NOT LIKE '%Guardianes%' AND label NOT LIKE '%Francys%' AND label NOT LIKE '%0424%'
       GROUP BY 1 ORDER BY n DESC LIMIT 25`,
    ),
    rows(
      `SELECT label, COUNT(*) n FROM click_events
       WHERE type = 'outbound' AND label IS NOT NULL
       AND (page IN ('/alianzas','/recursos') OR label LIKE '%↗%')
       GROUP BY 1 ORDER BY n DESC LIMIT 25`,
    ),
    db
      .prepare(
        `SELECT id, type, label, page, utm_source AS source, created_at AS ts FROM click_events WHERE ${notTest} ORDER BY created_at DESC LIMIT 15`,
      )
      .all()
      .then((r) => r.results ?? []),
    num(`SELECT COUNT(*) n FROM professionals WHERE status = 'approved'`),
    num(
      `SELECT COUNT(*) n FROM professionals WHERE status = 'approved' AND in_person_available = 1`,
    ),
    num(`SELECT COUNT(*) n FROM help_requests`),
  ]);

  return NextResponse.json(
    {
      generatedAt: now,
      total,
      last24,
      bySource,
      byType,
      psychologists,
      aliados,
      recent,
      approvedPros,
      inPersonPros,
      requests,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
