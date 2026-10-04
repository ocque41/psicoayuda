export type CalendarView = "mes" | "semana" | "dia" | "agenda";
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
  return value === "agenda" || value === "semana" || value === "dia"
    ? value
    : "mes";
}

export function calendarReferenceDay(
  month: string,
  value: unknown,
  timeZone: string,
  now = new Date(),
): string {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return (
    calendarDay(value, month) || calendarDay(today, month) || `${month}-01`
  );
}

function offsetDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().split("T")[0];
}

export function shiftCalendarDay(day: string, offset: number): string | null {
  if (
    !calendarMonth(day.slice(0, 7), "") ||
    !calendarDay(day, day.slice(0, 7)) ||
    !Number.isSafeInteger(offset) ||
    Math.abs(offset) > 3660000
  )
    return null;
  const target = offsetDay(day, offset);
  return calendarMonth(target.slice(0, 7), "") ? target : null;
}

/** Fechas civiles; la conversión a UTC se hace después con la zona de la cuenta. */
export function calendarPeriod(month: string, day: string, view: CalendarView) {
  const reference = calendarDay(day, month) || `${month}-01`;
  if (view === "dia")
    return {
      from: reference,
      until: offsetDay(reference, 1),
      days: [reference],
    };
  if (view === "semana") {
    const weekday = (new Date(`${reference}T12:00:00Z`).getUTCDay() + 6) % 7;
    const days = Array.from({ length: 7 }, (_, i) =>
      shiftCalendarDay(reference, i - weekday),
    ).filter((value): value is string => value !== null);
    return {
      from: days[0],
      until: offsetDay(days.at(-1) || reference, 1),
      days,
    };
  }
  const first = `${month}-01`;
  const end = new Date(`${first}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { from: first, until: end.toISOString().split("T")[0], days: [] };
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
