import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type AdminMetrics,
  isAdminMetrics,
  METRICS_GROUP_LIMITS,
  type MetricRow,
  type RecentMetric,
  type WindowMetric,
} from "@/shared/admin-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function readAdminMetrics(
  now = Date.now(),
): Promise<AdminMetrics> {
  const notTest = `(label IS NULL OR label != 'VERIF-DESPLIEGUE') AND created_at <= ${now}`;
  const rawRows = (query: string) => db.all<unknown>(sql.raw(query));
  const cell = (row: unknown, key: string, index: number) => {
    if (Array.isArray(row)) return row[index];
    if (row && typeof row === "object") {
      return (row as Record<string, unknown>)[key];
    }
    return undefined;
  };
  const text = (value: unknown) => {
    if (typeof value !== "string") throw new Error("metrics_invalid_text");
    return value;
  };
  const nullableText = (value: unknown) => {
    if (value === null || value === "") return null;
    return text(value);
  };
  const integer = (value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw new Error("metrics_invalid_count");
    return value;
  };
  const groupedRows = (rows: unknown[]): MetricRow[] =>
    rows.map((row) => ({
      label: text(cell(row, "label", 0)),
      n: integer(cell(row, "n", 1)),
    }));
  const recentRows = (rows: unknown[]): RecentMetric[] =>
    rows.map((row) => ({
      id: text(cell(row, "id", 0)),
      type: text(cell(row, "type", 1)),
      label: nullableText(cell(row, "label", 2)),
      page: nullableText(cell(row, "page", 3)),
      source: nullableText(cell(row, "source", 4)),
      ts: integer(cell(row, "ts", 5)),
    }));
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
  // Las tres ventanas comparten consulta y el mismo corte temporal.
  const windowMetricsQuery = rawRows(`
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
      (SELECT COUNT(*) FROM contact_messages c WHERE c.created_at >= w.since_iso AND c.created_at <= '${new Date(now).toISOString()}') AS contact_forms,
      COALESCE(SUM(CASE WHEN e.type = 'professional_referral_share' THEN 1 ELSE 0 END), 0) AS referral_shares,
      COALESCE(SUM(CASE WHEN e.type = 'signup' AND e.utm_campaign = 'referidos_profesionales' THEN 1 ELSE 0 END), 0) AS referral_signups
    FROM (${windowValues}) w
    LEFT JOIN click_events e
      ON e.created_at >= w.since_ms
      AND (e.label IS NULL OR e.label != 'VERIF-DESPLIEGUE') AND e.created_at <= ${now}
    GROUP BY w.key, w.since_ms, w.since_iso
    ORDER BY w.since_ms DESC
  `);

  // Un batch es una lectura coherente y secuencial con un solo viaje a D1.
  // Las doce consultas paralelas anteriores podían mezclarse con escrituras.
  const [
    windowsRows,
    summaryRows,
    sourceRows,
    campaignRows,
    typeRows,
    psychologistRows,
    allyRows,
    emailRows,
    activityRows,
  ] = await db.batch([
    windowMetricsQuery,
    rawRows(`SELECT
      (SELECT COUNT(*) FROM click_events WHERE ${notTest}) AS total,
      (SELECT COUNT(*) FROM professionals WHERE status = 'approved') AS approved_pros,
      (SELECT COUNT(*) FROM professionals WHERE status = 'approved' AND in_person_available = 1) AS in_person_pros,
      (SELECT COUNT(*) FROM help_requests) AS requests`),
    rawRows(
      `SELECT COALESCE(utm_source,'directo') label, COUNT(*) n FROM click_events WHERE ${notTest} GROUP BY 1 ORDER BY n DESC, label ASC LIMIT ${METRICS_GROUP_LIMITS.bySource + 1}`,
    ),
    rawRows(`SELECT COALESCE(utm_source,'directo') || ' / ' || COALESCE(utm_campaign,'sin campaña') label, COUNT(*) n
      FROM click_events WHERE created_at >= ${windows[2].since} AND ${notTest}
      GROUP BY 1 ORDER BY n DESC, label ASC LIMIT ${METRICS_GROUP_LIMITS.byCampaign + 1}`),
    rawRows(`SELECT type label, COUNT(*) n FROM click_events WHERE ${notTest}
      GROUP BY type ORDER BY n DESC, label ASC LIMIT ${METRICS_GROUP_LIMITS.byType + 1}`),
    rawRows(`SELECT label, COUNT(*) n FROM click_events WHERE ${professionalContactWhere}
      GROUP BY 1 ORDER BY n DESC, label ASC LIMIT ${METRICS_GROUP_LIMITS.psychologists + 1}`),
    rawRows(`SELECT label, COUNT(*) n FROM click_events WHERE ${allyContactWhere}
      GROUP BY 1 ORDER BY n DESC, label ASC LIMIT ${METRICS_GROUP_LIMITS.aliados + 1}`),
    rawRows(`SELECT COALESCE(page,'sin página') || ' · ' || COALESCE(label,'Correo') label, COUNT(*) n
      FROM click_events WHERE type = 'contact_email' AND ${notTest}
      GROUP BY 1 ORDER BY n DESC, label ASC LIMIT ${METRICS_GROUP_LIMITS.contactEmails + 1}`),
    rawRows(`SELECT id, type, label, page, utm_source AS source, created_at AS ts
      FROM click_events WHERE ${notTest} ORDER BY created_at DESC, id DESC LIMIT 15`),
  ]);
  const windowMetrics: WindowMetric[] = windowsRows.map((row) => {
    const key = text(cell(row, "key", 0)) as WindowMetric["key"];
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
  });

  const summary = summaryRows[0];
  const groups = {
    bySource: groupedRows(sourceRows),
    byCampaign: groupedRows(campaignRows),
    byType: groupedRows(typeRows),
    psychologists: groupedRows(psychologistRows),
    aliados: groupedRows(allyRows),
    contactEmails: groupedRows(emailRows),
  };
  const data: AdminMetrics = {
    generatedAt: now,
    windows: windowMetrics,
    total: integer(cell(summary, "total", 0)),
    last24: windowMetrics[0].total,
    ...groups,
    recent: recentRows(activityRows),
    approvedPros: integer(cell(summary, "approved_pros", 1)),
    inPersonPros: integer(cell(summary, "in_person_pros", 2)),
    requests: integer(cell(summary, "requests", 3)),
    truncated: {
      bySource: false,
      byCampaign: false,
      byType: false,
      psychologists: false,
      aliados: false,
      contactEmails: false,
    },
  };
  for (const key of Object.keys(METRICS_GROUP_LIMITS) as Array<
    keyof typeof groups
  >) {
    const limit = METRICS_GROUP_LIMITS[key];
    data.truncated[key] = groups[key].length > limit;
    data[key] = groups[key].slice(0, limit);
  }
  if (!isAdminMetrics(data)) throw new Error("metrics_invalid_snapshot");
  return data;
}
