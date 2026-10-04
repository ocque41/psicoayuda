"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { WorkspaceIcon } from "@/components/workspace/icon";
import {
  type CalendarPageKey,
  type CalendarView,
  calendarDay,
  calendarHref,
  calendarPeriod,
  calendarView,
  shiftCalendarDay,
  shiftCalendarMonth,
} from "@/lib/practice/calendar";
import styles from "./calendar-views.module.css";
import { PracticePagination } from "./pagination";

export type CalendarEvent = {
  id: string;
  startsAt: string;
  endsAt?: string;
  dateText: string;
  patientId?: string;
  href?: string;
  name: string;
  status: string;
};

const statuses: Record<string, string> = {
  scheduled: "Programada",
  cancelled: "Cancelada",
  completed: "Realizada",
  no_show: "Ausencia",
  requested: "Solicitud",
};
const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

function CalendarEventCard({
  event,
  audience,
  clockFormat,
}: {
  event: CalendarEvent;
  audience: "professional" | "patient";
  clockFormat: Intl.DateTimeFormat;
}) {
  const href =
    event.href ||
    (audience === "professional" && event.patientId
      ? `/pro/pacientes/${event.patientId}`
      : undefined);
  return (
    <article className={`calendar-event calendar-event-${event.status}`}>
      <time className="calendar-event-time" dateTime={event.startsAt}>
        {clockFormat.format(new Date(event.startsAt))}
        {event.endsAt ? (
          <span className="calendar-event-end">
            – {clockFormat.format(new Date(event.endsAt))}
          </span>
        ) : null}
      </time>
      <div className="calendar-event-copy">
        <h4>{href ? <Link href={href}>{event.name}</Link> : event.name}</h4>
        <p>{event.dateText}</p>
        <span className={`calendar-status calendar-status-${event.status}`}>
          {statuses[event.status] || "Por confirmar"}
        </span>
      </div>
      {href ? (
        <Link
          className="calendar-event-open"
          href={href}
          aria-label={`Abrir ${audience === "patient" ? "detalle de la sesión con" : "ficha de"} ${event.name}`}
        >
          ↗
        </Link>
      ) : null}
    </article>
  );
}

/** Los enlaces siguen el contexto actual, también tras cambios locales de History. */
export function CalendarPagination({
  page,
  pages,
  total,
  month,
  pageKey,
  anchor = "",
}: {
  page: number;
  pages: number;
  total: number;
  month: string;
  pageKey: CalendarPageKey;
  anchor?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <PracticePagination
      page={page}
      pages={pages}
      total={total}
      prefetch={false}
      href={(number) =>
        calendarHref(
          pathname,
          params.toString(),
          month,
          { [pageKey]: number },
          anchor,
        )
      }
    />
  );
}

export function PracticeCalendar({
  events,
  month,
  initialDay,
  timeZone,
  audience = "professional",
  emptyHref,
}: {
  events: CalendarEvent[];
  month: string;
  initialDay?: string;
  timeZone: string;
  audience?: "professional" | "patient";
  emptyHref?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const headingId = useId();
  const agendaId = useId();
  const selected = calendarDay(params.get("dia"), month);
  const view = calendarView(params.get("vista"));
  const referenceDay =
    selected || calendarDay(initialDay, month) || `${month}-01`;
  const period = calendarPeriod(month, referenceDay, view);
  const periodView = view === "semana" || view === "dia";
  const [focusedDay, setFocusedDay] = useState(
    selected ? Number(selected.slice(-2)) : 1,
  );
  const dateButtons = useRef(new Map<number, HTMLButtonElement>());
  const restoreFocus = useRef<{ month: string; day: number } | null>(null);
  const first = new Date(`${month}-01T12:00:00Z`);
  const final = new Date(first);
  final.setUTCMonth(final.getUTCMonth() + 1);
  final.setUTCDate(0);
  const days = final.getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const monthHeading = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(first);
  const periodFormat = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const heading =
    view === "dia"
      ? periodFormat.format(new Date(`${referenceDay}T12:00:00Z`))
      : view === "semana"
        ? periodFormat.formatRange(
            new Date(`${period.from}T12:00:00Z`),
            new Date(`${period.days.at(-1)}T12:00:00Z`),
          )
        : monthHeading;
  const { grouped, ordered, dateFormat, longDateFormat, clockFormat } =
    useMemo(() => {
      const dateFormat = new Intl.DateTimeFormat("sv-SE", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const longDateFormat = new Intl.DateTimeFormat("es", {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const clockFormat = new Intl.DateTimeFormat("es", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      const grouped = new Map<string, CalendarEvent[]>();
      const ordered = events
        .filter(
          (event) =>
            dateFormat.format(new Date(event.startsAt)) >= period.from &&
            dateFormat.format(new Date(event.startsAt)) < period.until,
        )
        .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt));
      for (const event of ordered) {
        const key = dateFormat.format(new Date(event.startsAt));
        const existing = grouped.get(key);
        if (existing) existing.push(event);
        else grouped.set(key, [event]);
      }
      return { grouped, ordered, dateFormat, longDateFormat, clockFormat };
    }, [events, period.from, period.until, timeZone]);
  // Client-only "today" avoids server/browser clock or zone hydration differences.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const updateToday = () => setToday(dateFormat.format(new Date()));
    updateToday();
    document.addEventListener("visibilitychange", updateToday);
    return () => document.removeEventListener("visibilitychange", updateToday);
  }, [dateFormat]);
  useEffect(() => {
    if (restoreFocus.current === null || restoreFocus.current.month !== month)
      return;
    const day = Math.min(restoreFocus.current.day, days);
    restoreFocus.current = null;
    setFocusedDay(day);
    dateButtons.current.get(day)?.focus();
  }, [month, days]);

  function monthHref(target: string, day?: string) {
    return calendarHref(pathname, params.toString(), month, {
      mes: target,
      dia: day ?? null,
    });
  }
  function select(day: string | null) {
    updateContext({ dia: day });
  }
  function dayHref(day: string, targetView = view) {
    return calendarHref(pathname, params.toString(), month, {
      mes: day.slice(0, 7),
      dia: day,
      vista: targetView,
    });
  }
  function updateContext(changes: {
    dia?: string | null;
    vista?: CalendarView;
  }) {
    // Next.js integra History con useSearchParams sin consultar el mes al servidor.
    flushSync(() => {
      // Cada clic se compone desde la URL vigente y se refleja al instante.
      const href = calendarHref(
        pathname,
        window.location.search,
        month,
        { mes: month, ...changes },
        window.location.hash.slice(1),
      );
      if (
        `${window.location.pathname}${window.location.search}${window.location.hash}` ===
        href
      )
        return;
      // Semana y día consultan su rango completo, incluso al cruzar de mes.
      if (periodView || changes.vista === "semana" || changes.vista === "dia")
        router.push(href, { scroll: false });
      else window.history.pushState(null, "", href);
    });
  }
  function focusDate(day: number) {
    if (day >= 1 && day <= days) {
      setFocusedDay(day);
      dateButtons.current.get(day)?.focus();
      return;
    }
    const target = new Date(first);
    target.setUTCDate(day);
    const targetMonth = target.toISOString().slice(0, 7);
    if (!shiftCalendarMonth(month, day < 1 ? -1 : 1)) return;
    restoreFocus.current = { month: targetMonth, day: target.getUTCDate() };
    router.push(monthHref(targetMonth), { scroll: false });
  }
  function dateKey(event: KeyboardEvent<HTMLButtonElement>, day: number) {
    const weekDay = (offset + day - 1) % 7;
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekDay,
      End: 6 - weekDay,
    };
    if (event.key in moves) {
      event.preventDefault();
      focusDate(day + moves[event.key]);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const target = shiftCalendarMonth(month, event.key === "PageUp" ? -1 : 1);
      if (!target) return;
      restoreFocus.current = { month: target, day };
      router.push(monthHref(target), {
        scroll: false,
      });
    }
  }
  const previousDay = shiftCalendarDay(
    referenceDay,
    view === "semana" ? -7 : -1,
  );
  const nextDay = shiftCalendarDay(referenceDay, view === "semana" ? 7 : 1);
  const previous = periodView ? previousDay : shiftCalendarMonth(month, -1);
  const next = periodView ? nextDay : shiftCalendarMonth(month, 1);
  const visible =
    view === "dia"
      ? grouped.get(referenceDay) || []
      : selected
        ? grouped.get(selected) || []
        : ordered;
  const selectedLabel =
    view === "dia" || selected
      ? longDateFormat.format(
          new Date(`${view === "dia" ? referenceDay : selected}T12:00:00Z`),
        )
      : "Sesiones del mes";
  const weekCount = Math.ceil((offset + days) / 7);

  return (
    <section
      className={`card calendar-card ${styles.root} calendar-view-${view === "mes" ? "calendar" : "list"}`}
      data-view={view}
      id="calendario"
      aria-labelledby={headingId}
    >
      <header className="calendar-heading">
        <div>
          <p className="eyebrow">Tu tiempo, en calma</p>
          <h2 id={headingId} aria-live="polite">
            {heading}
          </h2>
        </div>
        <div className="calendar-controls">
          {today ? (
            today.startsWith(month) ? (
              <button
                type="button"
                className="calendar-today"
                onClick={() => {
                  setFocusedDay(Number(today.slice(-2)));
                  if (periodView)
                    router.push(dayHref(today), { scroll: false });
                  else select(today);
                }}
              >
                Hoy
              </button>
            ) : (
              <Link
                className="calendar-today"
                href={monthHref(today.slice(0, 7), today)}
                prefetch={false}
                scroll={false}
              >
                Hoy
              </Link>
            )
          ) : null}
          {previous ? (
            <Link
              className="calendar-arrow"
              href={periodView ? dayHref(previous) : monthHref(previous)}
              prefetch={false}
              scroll={false}
              aria-label={
                view === "semana"
                  ? "Semana anterior"
                  : view === "dia"
                    ? "Día anterior"
                    : "Mes anterior"
              }
            >
              ←
            </Link>
          ) : null}
          {next ? (
            <Link
              className="calendar-arrow"
              href={periodView ? dayHref(next) : monthHref(next)}
              prefetch={false}
              scroll={false}
              aria-label={
                view === "semana"
                  ? "Semana siguiente"
                  : view === "dia"
                    ? "Día siguiente"
                    : "Mes siguiente"
              }
            >
              →
            </Link>
          ) : null}
        </div>
      </header>
      <div className="calendar-subheading">
        <p className="hint">
          Horas en <strong>{timeZone.replaceAll("_", " ")}</strong>
        </p>
        <fieldset
          className="workspace-segmented"
          aria-label="Vista de la agenda"
        >
          <button
            type="button"
            aria-pressed={view === "mes"}
            onClick={() => updateContext({ vista: "mes", dia: null })}
          >
            <WorkspaceIcon name="calendar" />
            Mes
          </button>
          <button
            type="button"
            aria-pressed={view === "semana"}
            onClick={() =>
              updateContext({ vista: "semana", dia: referenceDay })
            }
          >
            Semana
          </button>
          <button
            type="button"
            aria-pressed={view === "dia"}
            onClick={() => updateContext({ vista: "dia", dia: referenceDay })}
          >
            Día
          </button>
          <button
            type="button"
            aria-pressed={view === "agenda"}
            onClick={() => updateContext({ vista: "agenda" })}
          >
            <WorkspaceIcon name="people" />
            Agenda
          </button>
        </fieldset>
      </div>
      {periodView ? (
        <label className="calendar-date-picker">
          Elegir fecha
          <input
            type="date"
            value={referenceDay}
            min="0001-01-01"
            max="9999-12-31"
            onChange={(event) => {
              const day = event.target.value;
              if (calendarDay(day, day.slice(0, 7)))
                router.push(dayHref(day), { scroll: false });
            }}
          />
        </label>
      ) : null}
      <div className="calendar-layout">
        {view === "mes" ? (
          <div className="calendar-month">
            <p className="visually-hidden" id={`${headingId}-help`}>
              Usa las flechas para moverte por las fechas. Inicio y Fin recorren
              la semana. Re Pág y Av Pág cambian de mes. Enter selecciona el
              día.
            </p>
            <table
              className="practice-calendar"
              // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA APG calendar uses table with interactive grid semantics.
              role="grid"
              aria-labelledby={headingId}
              aria-describedby={`${headingId}-help`}
            >
              <thead>
                <tr>
                  {weekdays.map((day) => (
                    <th
                      className="calendar-weekday"
                      key={day}
                      scope="col"
                      abbr={day}
                    >
                      {day.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: weekCount }, (_, week) => {
                  const date = new Date(first);
                  date.setUTCDate(week * 7 - offset + 1);
                  return date;
                }).map((weekStart) => (
                  <tr key={weekStart.toISOString()}>
                    {weekdays.map((weekday, column) => {
                      const cellDate = new Date(weekStart);
                      cellDate.setUTCDate(cellDate.getUTCDate() + column);
                      const dayNumber =
                        cellDate.getUTCMonth() === first.getUTCMonth()
                          ? cellDate.getUTCDate()
                          : 0;
                      if (dayNumber < 1 || dayNumber > days)
                        return <td key={weekday} />;
                      const day = `${month}-${String(dayNumber).padStart(2, "0")}`;
                      const count = (grouped.get(day) || []).filter(
                        (event) => event.status === "scheduled",
                      ).length;
                      const isSelected = selected === day;
                      return (
                        <td key={weekday}>
                          <button
                            type="button"
                            ref={(node) => {
                              if (node)
                                dateButtons.current.set(dayNumber, node);
                              else dateButtons.current.delete(dayNumber);
                            }}
                            tabIndex={
                              Math.min(focusedDay, days) === dayNumber ? 0 : -1
                            }
                            onFocus={() => setFocusedDay(dayNumber)}
                            className={`calendar-day${isSelected ? " selected" : ""}${today === day ? " is-today" : ""}`}
                            onKeyDown={(event) => dateKey(event, dayNumber)}
                            onClick={() => select(isSelected ? null : day)}
                            aria-pressed={isSelected}
                            aria-current={today === day ? "date" : undefined}
                            aria-controls={agendaId}
                            aria-label={`${longDateFormat.format(new Date(`${day}T12:00:00Z`))}, ${count} ${count === 1 ? "sesión programada" : "sesiones programadas"}`}
                          >
                            <span>{dayNumber}</span>
                            {count ? (
                              <small aria-hidden="true">{count}</small>
                            ) : (
                              <span
                                className="calendar-day-dot"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="calendar-grid-hint">
              <span className="calendar-legend-dot" aria-hidden="true" />{" "}
              Selecciona un día para ver sus sesiones
            </p>
          </div>
        ) : null}
        {view === "semana" ? (
          <section
            className="calendar-week"
            aria-label="Sesiones de la semana"
            aria-live="polite"
          >
            {period.days.map((day) => {
              const dayEvents = grouped.get(day) || [];
              return (
                <section
                  className={`calendar-week-column${day === today ? " is-today" : ""}`}
                  key={day}
                >
                  <header className="calendar-week-heading">
                    <h3>
                      <Link
                        href={dayHref(day, "dia")}
                        prefetch={false}
                        scroll={false}
                        aria-label={`Ver el día ${longDateFormat.format(new Date(`${day}T12:00:00Z`))}`}
                      >
                        <time
                          dateTime={day}
                          aria-current={day === today ? "date" : undefined}
                        >
                          <span>
                            {
                              weekdays[
                                (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) %
                                  7
                              ]
                            }
                          </span>
                          <strong>{Number(day.slice(-2))}</strong>
                        </time>
                      </Link>
                    </h3>
                    <span className="hint">
                      {dayEvents.length}{" "}
                      {dayEvents.length === 1 ? "sesión" : "sesiones"}
                    </span>
                  </header>
                  <div className="calendar-week-events">
                    {dayEvents.map((event) => (
                      <CalendarEventCard
                        key={event.id}
                        event={event}
                        audience={audience}
                        clockFormat={clockFormat}
                      />
                    ))}
                    {!dayEvents.length ? (
                      <p className="calendar-week-empty">Sin sesiones</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </section>
        ) : (
          <div className="calendar-agenda" id={agendaId}>
            <div className="calendar-agenda-heading">
              <h3>{selectedLabel}</h3>
              {selected && !periodView ? (
                <button
                  type="button"
                  className="calendar-clear"
                  onClick={() => select(null)}
                >
                  Ver el mes
                </button>
              ) : (
                <span className="workspace-tag">
                  {visible.length}{" "}
                  {visible.length === 1 ? "sesión" : "sesiones"}
                </span>
              )}
            </div>
            <div
              className="calendar-events"
              aria-live="polite"
              aria-atomic="false"
            >
              {visible.map((event) => (
                <CalendarEventCard
                  key={`${view}:${selected ?? "mes"}:${event.id}`}
                  event={event}
                  audience={audience}
                  clockFormat={clockFormat}
                />
              ))}
              {!visible.length ? (
                <div
                  className="calendar-empty"
                  key={`${view}:${selected ?? "mes"}:empty`}
                >
                  <span className="calendar-empty-icon">
                    <WorkspaceIcon name="leaf" />
                  </span>
                  <h4>
                    {selected || view === "dia"
                      ? "Un día con espacio"
                      : "Tu agenda empieza aquí"}
                  </h4>
                  <p>
                    {audience === "patient"
                      ? "Las sesiones que acuerdes con tu profesional aparecerán aquí."
                      : "Programa una sesión desde la ficha de tu paciente y la encontrarás aquí."}
                  </p>
                  {audience === "professional" ? (
                    <Link href={emptyHref || "/pro/pacientes"}>
                      Ir a pacientes →
                    </Link>
                  ) : (
                    <Link href="/mi/mensajes">Ir a mis mensajes →</Link>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
