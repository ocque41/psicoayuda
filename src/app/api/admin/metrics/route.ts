import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireAdmin } from "@/lib/admin";

// Métricas para el panel /admin. Depende de la sesión (cookies) → dinámico y sin
// caché. Consulta D1 directamente (agregados) y NUNCA expone datos sensibles.
export const dynamic = "force-dynamic";

type Row = { label: string; n: number };
type RecentRow = {
  id: string;
  type: string;
  label: string | null;
  page: string | null;
  source: string | null;
  ts: number;
};
type WindowKey = "24h" | "7d" | "30d";
type WindowMetric = {
  key: WindowKey;
  label: string;
  total: number;
  professionalContacts: number;
  allyContacts: number;
  ctas: number;
  leads: number;
  signups: number;
  emailClicks: number;
  contactForms: number;
  referralShares: number;
  referralSignups: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const notTest = "(label IS NULL OR label != 'VERIF-DESPLIEGUE')";
  const rawRows = async (query: string) => db.all<unknown>(sql.raw(query));
  const cell = (row: unknown, key: string, index: number) => {
    if (Array.isArray(row)) return row[index];
    if (row && typeof row === "object") {
      return (row as Record<string, unknown>)[key];
    }
    return undefined;
  };
  const text = (value: unknown) => (value == null ? "" : String(value));
  const nullableText = (value: unknown) =>
    value == null || value === "" ? null : String(value);
  const integer = (value: unknown) => Number(value ?? 0);
  const groupedRows = async (query: string): Promise<Row[]> =>
    (await rawRows(query)).map((row) => ({
      label: text(cell(row, "label", 0)),
      n: integer(cell(row, "n", 1)),
    }));
  const recentRows = async (query: string): Promise<RecentRow[]> =>
    (await rawRows(query)).map((row) => ({
      id: text(cell(row, "id", 0)),
      type: text(cell(row, "type", 1)),
      label: nullableText(cell(row, "label", 2)),
      page: nullableText(cell(row, "page", 3)),
      source: nullableText(cell(row, "source", 4)),
      ts: integer(cell(row, "ts", 5)),
    }));
  const num = async (query: string) => {
    const [row] = await rawRows(query);
    return integer(cell(row, "n", 0));
  };

  const now = Date.now();
  const windows = [
    { key: "24h", label: "Últimas 24h", since: now - DAY_MS },
    { key: "7d", label: "Últimos 7 días", since: now - 7 * DAY_MS },
    { key: "30d", label: "Últimos 30 días", since: now - 30 * DAY_MS },
  ] as const;
  const professionalContactWhere = `
    ${notTest}
    AND label IS NOT NULL
    AND page IN ('/ayuda','/profesionales','/')
    AND (href LIKE 'https://wa.me/%' OR href LIKE 'tel:%' OR href LIKE 'mailto:%')
    AND label NOT LIKE '%Guardianes%'
    AND label NOT LIKE '%Francys%'
    AND label NOT LIKE '%0424%'
  `;
  const allyContactWhere = `
    ${notTest}
    AND label IS NOT NULL
    AND (type = 'aliado'
      OR (type = 'outbound' AND (page IN ('/alianzas','/recursos') OR label LIKE '%↗%')))
  `;
  const windowValues = windows
    .map(
      ({ key, since }) =>
        `SELECT '${key}' AS key, ${since} AS since_ms, '${new Date(since).toISOString()}' AS since_iso`,
    )
    .join(" UNION ALL ");
  // Antes se lanzaban diez consultas por ventana (30 en total) cada 30 s. D1
  // permite pocas conexiones simultáneas y su plan gratuito limita las
  // consultas por invocación. Esta única consulta calcula las tres ventanas y
  // deja margen amplio para el resto del panel.
  const windowMetricsPromise = rawRows(`
    SELECT
      w.key,
      COUNT(e.id) AS total,
      COALESCE(SUM(CASE WHEN
        e.label IS NOT NULL
        AND e.page IN ('/ayuda','/profesionales','/')
        AND (e.href LIKE 'https://wa.me/%' OR e.href LIKE 'tel:%' OR e.href LIKE 'mailto:%')
        AND e.label NOT LIKE '%Guardianes%'
        AND e.label NOT LIKE '%Francys%'
        AND e.label NOT LIKE '%0424%'
        THEN 1 ELSE 0 END), 0) AS professional_contacts,
      COALESCE(SUM(CASE WHEN
        e.label IS NOT NULL
        AND (e.type = 'aliado'
          OR (e.type = 'outbound' AND (e.page IN ('/alianzas','/recursos') OR e.label LIKE '%↗%')))
        THEN 1 ELSE 0 END), 0) AS ally_contacts,
      COALESCE(SUM(CASE WHEN e.type = 'cta' THEN 1 ELSE 0 END), 0) AS ctas,
      COALESCE(SUM(CASE WHEN e.type = 'lead' THEN 1 ELSE 0 END), 0) AS leads,
      COALESCE(SUM(CASE WHEN e.type = 'signup' THEN 1 ELSE 0 END), 0) AS signups,
      COALESCE(SUM(CASE WHEN e.type = 'contact_email' THEN 1 ELSE 0 END), 0) AS email_clicks,
      (SELECT COUNT(*) FROM contact_messages c WHERE c.created_at >= w.since_iso) AS contact_forms,
      COALESCE(SUM(CASE WHEN e.type = 'professional_referral_share' THEN 1 ELSE 0 END), 0) AS referral_shares,
      COALESCE(SUM(CASE WHEN e.type = 'signup' AND e.utm_campaign = 'referidos_profesionales' THEN 1 ELSE 0 END), 0) AS referral_signups
    FROM (${windowValues}) w
    LEFT JOIN click_events e
      ON e.created_at >= w.since_ms
      AND (e.label IS NULL OR e.label != 'VERIF-DESPLIEGUE')
    GROUP BY w.key, w.since_ms, w.since_iso
    ORDER BY w.since_ms DESC
  `).then((rows): WindowMetric[] =>
    rows.map((row) => {
      const key = text(cell(row, "key", 0)) as WindowKey;
      return {
        key,
        label: windows.find((window) => window.key === key)?.label ?? key,
        total: integer(cell(row, "total", 1)),
        professionalContacts: integer(cell(row, "professional_contacts", 2)),
        allyContacts: integer(cell(row, "ally_contacts", 3)),
        ctas: integer(cell(row, "ctas", 4)),
        leads: integer(cell(row, "leads", 5)),
        signups: integer(cell(row, "signups", 6)),
        emailClicks: integer(cell(row, "email_clicks", 7)),
        contactForms: integer(cell(row, "contact_forms", 8)),
        referralShares: integer(cell(row, "referral_shares", 9)),
        referralSignups: integer(cell(row, "referral_signups", 10)),
      };
    }),
  );

  const [
    windowMetrics,
    total,
    bySource,
    byCampaign,
    byType,
    psychologists,
    aliados,
    contactEmails,
    recent,
    approvedPros,
    inPersonPros,
    requests,
  ] = await Promise.all([
    windowMetricsPromise,
    num(`SELECT COUNT(*) n FROM click_events WHERE ${notTest}`),
    groupedRows(
      `SELECT COALESCE(utm_source,'directo') label, COUNT(*) n FROM click_events WHERE ${notTest} GROUP BY 1 ORDER BY n DESC`,
    ),
    groupedRows(
      `SELECT COALESCE(utm_source,'directo') || ' / ' || COALESCE(utm_campaign,'sin campaña') label, COUNT(*) n
       FROM click_events
       WHERE created_at >= ${windows[2].since} AND ${notTest}
       GROUP BY 1
       ORDER BY n DESC
       LIMIT 20`,
    ),
    groupedRows(
      `SELECT type label, COUNT(*) n FROM click_events WHERE ${notTest} GROUP BY type ORDER BY n DESC`,
    ),
    groupedRows(
      `SELECT label, COUNT(*) n FROM click_events
       WHERE ${professionalContactWhere}
       GROUP BY 1 ORDER BY n DESC LIMIT 25`,
    ),
    groupedRows(
      `SELECT label, COUNT(*) n FROM click_events
       WHERE ${allyContactWhere}
       GROUP BY 1 ORDER BY n DESC LIMIT 25`,
    ),
    groupedRows(
      `SELECT COALESCE(page,'sin página') || ' · ' || COALESCE(label,'Correo') label, COUNT(*) n
       FROM click_events
       WHERE type = 'contact_email' AND ${notTest}
       GROUP BY 1 ORDER BY n DESC LIMIT 25`,
    ),
    recentRows(
      `SELECT id, type, label, page, utm_source AS source, created_at AS ts FROM click_events WHERE ${notTest} ORDER BY created_at DESC LIMIT 15`,
    ),
    num(`SELECT COUNT(*) n FROM professionals WHERE status = 'approved'`),
    num(
      `SELECT COUNT(*) n FROM professionals WHERE status = 'approved' AND in_person_available = 1`,
    ),
    num(`SELECT COUNT(*) n FROM help_requests`),
  ]);

  return NextResponse.json(
    {
      generatedAt: now,
      windows: windowMetrics,
      total,
      last24: windowMetrics[0]?.total ?? 0,
      bySource,
      byCampaign,
      byType,
      psychologists,
      aliados,
      contactEmails,
      recent,
      approvedPros,
      inPersonPros,
      requests,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
