export const METRICS_GROUP_LIMITS = {
  bySource: 40,
  byCampaign: 20,
  byType: 40,
  psychologists: 25,
  aliados: 25,
  contactEmails: 25,
} as const;
export type MetricsGroup = keyof typeof METRICS_GROUP_LIMITS;
export type MetricRow = { label: string; n: number };
export type RecentMetric = {
  id: string;
  type: string;
  label: string | null;
  page: string | null;
  source: string | null;
  ts: number;
};
export type WindowMetric = {
  key: "24h" | "7d" | "30d";
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
export type AdminMetrics = Record<MetricsGroup, MetricRow[]> & {
  generatedAt: number;
  windows: WindowMetric[];
  total: number;
  last24: number;
  recent: RecentMetric[];
  approvedPros: number;
  inPersonPros: number;
  requests: number;
  truncated: Record<MetricsGroup, boolean>;
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1024;
}
function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}
const WINDOW_COUNTS = [
  "total",
  "professionalContacts",
  "allyContacts",
  "ctas",
  "leads",
  "signups",
  "emailClicks",
  "contactForms",
  "referralShares",
  "referralSignups",
] as const;

/** Un fallo o una respuesta parcial nunca se convierte en métricas con ceros. */
export function isAdminMetrics(value: unknown): value is AdminMetrics {
  if (!object(value) || !object(value.truncated)) return false;
  if (
    !count(value.generatedAt) ||
    !count(value.total) ||
    !count(value.last24) ||
    !count(value.approvedPros) ||
    !count(value.inPersonPros) ||
    !count(value.requests)
  )
    return false;
  const generatedAt = value.generatedAt;
  for (const [key, limit] of Object.entries(METRICS_GROUP_LIMITS)) {
    const rows = value[key];
    if (
      !Array.isArray(rows) ||
      rows.length > limit ||
      typeof value.truncated[key] !== "boolean" ||
      !rows.every((row) => object(row) && text(row.label) && count(row.n))
    )
      return false;
  }
  if (!Array.isArray(value.windows) || value.windows.length !== 3) return false;
  for (const [index, key] of ["24h", "7d", "30d"].entries()) {
    const window = value.windows[index];
    if (
      !object(window) ||
      window.key !== key ||
      !text(window.label) ||
      !WINDOW_COUNTS.every((field) => count(window[field]))
    )
      return false;
  }
  const windows = value.windows as WindowMetric[];
  if (
    value.last24 !== windows[0].total ||
    windows[0].total > windows[1].total ||
    windows[1].total > windows[2].total ||
    windows[2].total > value.total ||
    value.inPersonPros > value.approvedPros
  )
    return false;
  if (
    !Array.isArray(value.recent) ||
    value.recent.length > 15 ||
    !value.recent.every(
      (row) =>
        object(row) &&
        text(row.id) &&
        text(row.type) &&
        nullableText(row.label) &&
        nullableText(row.page) &&
        nullableText(row.source) &&
        count(row.ts) &&
        row.ts <= generatedAt,
    )
  )
    return false;
  return true;
}
