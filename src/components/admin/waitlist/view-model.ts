import type {
  AdminWaitlistData,
  WaitlistTab,
} from "@/lib/admin-waitlist/types";

type WaitlistNavigation = Pick<
  AdminWaitlistData,
  "tab" | "q" | "status" | "page"
>;

export function waitlistHref(
  data: WaitlistNavigation,
  changes: {
    tab?: WaitlistTab;
    status?: string;
    q?: string;
    page?: number;
    person?: string;
  } = {},
) {
  const tab = changes.tab ?? data.tab;
  const switched = tab !== data.tab;
  const params = new URLSearchParams();
  params.set("fuente", tab);
  const status =
    changes.status ??
    (switched ? (tab === "general" ? "all" : "waiting") : data.status);
  params.set("estado", status);
  const q = changes.q ?? (switched ? "" : data.q);
  if (q && !q.includes("@")) params.set("q", q);
  const page = changes.page ?? (switched ? 1 : data.page);
  if (page > 1) params.set("pagina", String(page));
  if (changes.person) params.set("persona", changes.person);
  return `/admin/lista-de-espera?${params.toString()}`;
}

export function waitlistDate(value: string, time = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Fecha no registrada";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" } : {}),
    timeZone: "UTC",
  }).format(date);
}
