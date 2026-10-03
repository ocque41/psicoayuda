export type CalendarView = "mes" | "agenda";
export type CalendarPageKey = "pagina" | "chats" | "solicitudes";

export function calendarMonth(value: unknown, fallback: string): string {
  return typeof value === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    !value.startsWith("0000-")
    ? value
    : fallback;
}

export function calendarDay(value: unknown, month: string): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !value.startsWith(`${month}-`)
  )
    return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function calendarView(value: unknown): CalendarView {
  return value === "agenda" ? "agenda" : "mes";
}

export function shiftCalendarMonth(
  month: string,
  offset: number,
): string | null {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  if (!Number.isFinite(date.getTime())) return null;
  const target = date.toISOString().slice(0, 7);
  return calendarMonth(target, "") || null;
}

function pageNumber(value: string | number): number {
  return /^\d{1,5}$/.test(String(value))
    ? Math.max(1, Math.min(10000, Number(value)))
    : 1;
}

/** Sólo añade fechas, vista y páginas; conserva los filtros existentes de la ruta. */
export function calendarHref(
  pathname: string,
  parameters: string,
  month: string,
  changes: {
    mes?: string;
    dia?: string | null;
    vista?: CalendarView;
    pagina?: number;
    chats?: number;
    solicitudes?: number;
  } = {},
  anchor = "calendario",
): string {
  const query = new URLSearchParams(parameters);
  const targetMonth = calendarMonth(changes.mes ?? query.get("mes"), month);
  const day = calendarDay(
    changes.dia === undefined ? query.get("dia") : changes.dia,
    targetMonth,
  );
  query.set("mes", targetMonth);
  if (day) query.set("dia", day);
  else query.delete("dia");
  query.set("vista", calendarView(changes.vista ?? query.get("vista")));
  for (const key of ["pagina", "chats", "solicitudes"] as const) {
    const value = changes[key] ?? query.get(key);
    if (value !== null) query.set(key, String(pageNumber(value)));
  }
  return `${pathname}?${query}${anchor ? `#${anchor}` : ""}`;
}
