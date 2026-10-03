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

export type CalendarEvent = {
  id: string;
  startsAt: string;
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

function validDay(value: string | null, month: string) {
  if (
    !value ||
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

export function PracticeCalendar({
  events,
  month,
  timeZone,
  audience = "professional",
}: {
  events: CalendarEvent[];
  month: string;
  timeZone: string;
  audience?: "professional" | "patient";
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const headingId = useId();
  const agendaId = useId();
  const [selection, setSelection] = useState<{
    month: string;
    day: string | null;
  }>({ month, day: validDay(params.get("dia"), month) });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [focusedDay, setFocusedDay] = useState(1);
  const dateButtons = useRef(new Map<number, HTMLButtonElement>());
  const restoreFocus = useRef<{ month: string; day: number } | null>(null);
  const transition = useRef<ViewTransition | null>(null);
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const queryDay = validDay(params.get("dia"), month);
  const selected =
    selection.month === month
      ? selection.day
      : queryDay?.startsWith(`${month}-`) && Number(queryDay.slice(-2)) <= days
        ? queryDay
        : null;
  const heading = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(first);
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
        .filter((event) =>
          dateFormat.format(new Date(event.startsAt)).startsWith(month),
        )
        .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt));
      for (const event of ordered) {
        const key = dateFormat.format(new Date(event.startsAt));
        const existing = grouped.get(key);
        if (existing) existing.push(event);
        else grouped.set(key, [event]);
      }
      return { grouped, ordered, dateFormat, longDateFormat, clockFormat };
    }, [events, month, timeZone]);
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
  useEffect(() => () => transition.current?.skipTransition(), []);

  function monthHref(target: string, day?: string) {
    const query = new URLSearchParams(params.toString());
    query.set("mes", target);
    if (day) query.set("dia", day);
    else query.delete("dia");
    return `${pathname}?${query}#calendario`;
  }
  function morph(update: () => void) {
    transition.current?.skipTransition();
    if (
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      transition.current = document.startViewTransition(() =>
        flushSync(update),
      );
      // Rapid repeated selections can legitimately skip the prior snapshot.
      void transition.current.ready.catch(() => {});
    } else update();
  }
  function select(day: string | null) {
    morph(() => setSelection({ month, day }));
  }
  function focusDate(day: number) {
    if (day >= 1 && day <= days) {
      setFocusedDay(day);
      dateButtons.current.get(day)?.focus();
      return;
    }
    const target = new Date(Date.UTC(year, number - 1, day));
    const targetMonth = target.toISOString().slice(0, 7);
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
      const target = new Date(
        Date.UTC(year, number - 1 + (event.key === "PageUp" ? -1 : 1), 1),
      );
      restoreFocus.current = { month: target.toISOString().slice(0, 7), day };
      router.push(monthHref(target.toISOString().slice(0, 7)), {
        scroll: false,
      });
    }
  }
  const previous = new Date(Date.UTC(year, number - 2, 1))
    .toISOString()
    .slice(0, 7);
  const next = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
  const visible = selected ? grouped.get(selected) || [] : ordered;
  const selectedLabel = selected
    ? longDateFormat.format(new Date(`${selected}T12:00:00Z`))
    : "Sesiones del mes";
  const weekCount = Math.ceil((offset + days) / 7);

  return (
    <section
      className={`card calendar-card calendar-view-${view}`}
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
                  select(today);
                }}
              >
                Hoy
              </button>
            ) : (
              <Link
                className="calendar-today"
                href={monthHref(today.slice(0, 7), today)}
                scroll={false}
              >
                Hoy
              </Link>
            )
          ) : null}
          <Link
            className="calendar-arrow"
            href={monthHref(previous)}
            scroll={false}
            aria-label="Mes anterior"
          >
            ←
          </Link>
          <Link
            className="calendar-arrow"
            href={monthHref(next)}
            scroll={false}
            aria-label="Mes siguiente"
          >
            →
          </Link>
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
            aria-pressed={view === "calendar"}
            onClick={() => morph(() => setView("calendar"))}
          >
            <WorkspaceIcon name="calendar" />
            Mes
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => morph(() => setView("list"))}
          >
            <WorkspaceIcon name="people" />
            Agenda
          </button>
        </fieldset>
      </div>
      <div className="calendar-layout">
        {view === "calendar" ? (
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
                {Array.from(
                  { length: weekCount },
                  (_, week) =>
                    new Date(Date.UTC(year, number - 1, week * 7 - offset + 1)),
                ).map((weekStart) => (
                  <tr key={weekStart.toISOString()}>
                    {weekdays.map((weekday, column) => {
                      const cellDate = new Date(weekStart);
                      cellDate.setUTCDate(cellDate.getUTCDate() + column);
                      const dayNumber =
                        cellDate.getUTCMonth() === number - 1
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
        <div className="calendar-agenda" id={agendaId}>
          <div className="calendar-agenda-heading">
            <h3>{selectedLabel}</h3>
            {selected ? (
              <button
                type="button"
                className="calendar-clear"
                onClick={() => select(null)}
              >
                Ver el mes
              </button>
            ) : (
              <span className="workspace-tag">
                {ordered.length} {ordered.length === 1 ? "sesión" : "sesiones"}
              </span>
            )}
          </div>
          <div
            className="calendar-events"
            aria-live="polite"
            aria-atomic="false"
          >
            {visible.map((event) => {
              const href =
                event.href ||
                (audience === "professional" && event.patientId
                  ? `/pro/pacientes/${event.patientId}`
                  : undefined);
              return (
                <article
                  className={`calendar-event calendar-event-${event.status}`}
                  key={event.id}
                >
                  <time
                    className="calendar-event-time"
                    dateTime={event.startsAt}
                  >
                    {clockFormat.format(new Date(event.startsAt))}
                  </time>
                  <div className="calendar-event-copy">
                    <h4>
                      {href ? (
                        <Link href={href}>{event.name}</Link>
                      ) : (
                        event.name
                      )}
                    </h4>
                    <p>{event.dateText}</p>
                    <span
                      className={`calendar-status calendar-status-${event.status}`}
                    >
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
            })}
            {!visible.length ? (
              <div className="calendar-empty">
                <span className="calendar-empty-icon">
                  <WorkspaceIcon name="leaf" />
                </span>
                <h4>
                  {selected ? "Un día con espacio" : "Tu agenda empieza aquí"}
                </h4>
                <p>
                  {audience === "patient"
                    ? "Las sesiones que acuerdes con tu profesional aparecerán aquí."
                    : "Programa una sesión desde la ficha de tu paciente y la encontrarás aquí."}
                </p>
                {audience === "professional" ? (
                  <Link href="/pro/consulta#pacientes">Ir a pacientes →</Link>
                ) : (
                  <Link href="/mi/mensajes">Ir a mis mensajes →</Link>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
