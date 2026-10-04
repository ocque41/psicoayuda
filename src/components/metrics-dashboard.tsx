"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import {
  createMetricsPoller,
  type MetricsPoller,
  type MetricsPollingState,
} from "@/lib/admin-metrics-polling";
import type {
  AdminMetrics,
  MetricRow,
  MetricsGroup,
  WindowMetric,
} from "@/shared/admin-metrics";
import styles from "./metrics-dashboard.module.css";

const numberFormatter = new Intl.NumberFormat("es");
const dateFormatter = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "medium",
});
const sections = [
  { key: "resumen", label: "Resumen" },
  { key: "adquisicion", label: "Adquisición" },
  { key: "contactos", label: "Contactos" },
  { key: "actividad", label: "Actividad" },
] as const;
type MetricsSection = (typeof sections)[number]["key"];
const breakdownFields = [
  ["professionalContacts", "Contactos con profesionales"],
  ["allyContacts", "Contactos con aliados"],
  ["ctas", "Botones de acción"],
  ["leads", "Solicitudes"],
  ["signups", "Altas profesionales"],
  ["emailClicks", "Clics en correos"],
  ["contactForms", "Formularios"],
  ["referralShares", "Intentos de compartir"],
  ["referralSignups", "Altas por invitación"],
] as const;
const groupLabels: Record<MetricsGroup, string> = {
  bySource: "Origen del tráfico",
  byCampaign: "Campañas",
  byType: "Tipos de acción",
  psychologists: "Profesionales",
  aliados: "Aliados y recursos externos",
  contactEmails: "Correos de contacto",
};
const groupDescriptions: Record<MetricsGroup, string> = {
  bySource: "Acciones por fuente de entrada, desde el inicio del registro.",
  byCampaign: "Fuente y campaña de entrada en los últimos 30 días.",
  byType: "Acciones por tipo, desde el inicio del registro.",
  psychologists:
    "Clics de contacto con profesionales, desde el inicio del registro.",
  aliados:
    "Clics en contactos y webs de asociaciones y recursos, desde el inicio del registro.",
  contactEmails:
    "Clics por página y dirección pública, desde el inicio del registro.",
};
const eventLabels = new Map([
  ["cta", "Botón de acción"],
  ["outbound", "Contacto o enlace externo"],
  ["lead", "Solicitud de ayuda"],
  ["signup", "Alta profesional"],
  ["contact_email", "Correo de contacto"],
  ["professional_referral_share", "Invitación compartida"],
  ["aliado", "Contacto con un aliado"],
]);
function eventLabel(type: string) {
  return eventLabels.get(type) ?? "Otro tipo de acción";
}

function hora(ms: number): string {
  try {
    return dateFormatter.format(ms);
  } catch {
    return "";
  }
}
function num(value: number): string {
  return numberFormatter.format(value);
}
function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function Pagination({
  currentPage,
  pages,
  onChange,
  label,
}: {
  currentPage: number;
  pages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button
        type="button"
        disabled={currentPage === 0}
        onClick={() => onChange(currentPage - 1)}
      >
        <span aria-hidden="true">←</span> Anterior
      </button>
      <span role="status">
        {currentPage + 1} de {pages}
      </span>
      <button
        type="button"
        disabled={currentPage + 1 >= pages}
        onClick={() => onChange(currentPage + 1)}
      >
        Siguiente <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}

function BarList({
  rows,
  max,
  eventTypes = false,
}: {
  rows: MetricRow[];
  max: number;
  eventTypes?: boolean;
}) {
  return (
    <ul className={styles.bars} aria-label="Acciones por grupo">
      {rows.map((row) => (
        <li key={row.label}>
          <span
            className={styles.bar}
            aria-hidden="true"
            style={{ width: `${(row.n / max) * 100}%` }}
          />
          <span className={styles.barLabel}>
            {eventTypes ? (
              <>
                {eventLabel(row.label)}
                <small className={styles.eventCode}>{row.label}</small>
              </>
            ) : (
              row.label
            )}
          </span>
          <strong>{num(row.n)}</strong>
        </li>
      ))}
    </ul>
  );
}

function GroupDetail({
  data,
  groups,
}: {
  data: AdminMetrics;
  groups: readonly MetricsGroup[];
}) {
  const id = useId();
  const [group, setGroup] = useState<MetricsGroup>(groups[0]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const rows = data[group];
  const needle = normalized(query);
  const matching = rows.filter((row) =>
    normalized(
      group === "byType" ? `${eventLabel(row.label)} ${row.label}` : row.label,
    ).includes(needle),
  );
  const pages = Math.max(1, Math.ceil(matching.length / 8));
  const currentPage = Math.min(page, pages - 1);
  const max = Math.max(...rows.map((row) => row.n), 1);
  return (
    <section className={styles.detail} aria-labelledby={`${id}-title`}>
      <div className={styles.detailHeading}>
        <div>
          <h3 id={`${id}-title`}>{groupLabels[group]}</h3>
          <p>{groupDescriptions[group]}</p>
        </div>
        <label className={styles.control} htmlFor={`${id}-group`}>
          <span>Ver desglose</span>
          <select
            id={`${id}-group`}
            value={group}
            onChange={(event) => {
              setGroup(event.target.value as MetricsGroup);
              setQuery("");
              setPage(0);
            }}
          >
            {groups.map((key) => (
              <option key={key} value={key}>
                {groupLabels[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length ? (
        <>
          <div className={styles.filterRow}>
            <label className={styles.control} htmlFor={`${id}-filter`}>
              <span>Filtrar este desglose</span>
              <input
                id={`${id}-filter`}
                type="search"
                value={query}
                placeholder="Buscar un grupo…"
                maxLength={200}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <span className={styles.resultCount} role="status">
              {matching.length} de {rows.length} grupos
            </span>
          </div>
          {data.truncated[group] ? (
            <p className={styles.scopeNote}>
              Se muestran los {rows.length} grupos con más acciones. El filtro
              busca en estos grupos; los totales incluyen todos los grupos.
            </p>
          ) : null}
          {matching.length ? (
            <BarList
              rows={matching.slice(currentPage * 8, (currentPage + 1) * 8)}
              max={max}
              eventTypes={group === "byType"}
            />
          ) : (
            <p className={styles.empty}>
              Ningún grupo coincide con tu búsqueda.
            </p>
          )}
          <Pagination
            currentPage={currentPage}
            pages={pages}
            onChange={setPage}
            label="Páginas del desglose"
          />
        </>
      ) : (
        <p className={styles.empty}>
          Todavía no hay acciones en este desglose.
        </p>
      )}
    </section>
  );
}

function RecentActivity({ data }: { data: AdminMetrics }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(data.recent.length / 5));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className={styles.detail} aria-label="Actividad reciente">
      <div className={styles.detailHeading}>
        <div>
          <h3>Actividad reciente</h3>
          <p>Las {data.recent.length} acciones más recientes registradas.</p>
        </div>
      </div>
      {data.recent.length ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.activityTable}>
              <caption className={styles.srOnly}>
                Últimas acciones: hora, tipo, descripción, página y fuente.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Página</th>
                  <th scope="col">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {data.recent
                  .slice(currentPage * 5, (currentPage + 1) * 5)
                  .map((row) => (
                    <tr key={row.id}>
                      <td data-label="Hora">{hora(row.ts)}</td>
                      <td data-label="Tipo">
                        {eventLabel(row.type)}
                        <small className={styles.eventCode}>{row.type}</small>
                      </td>
                      <td data-label="Acción">{row.label ?? "—"}</td>
                      <td data-label="Página">{row.page ?? "—"}</td>
                      <td data-label="Fuente">{row.source ?? "directo"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            pages={pages}
            onChange={setPage}
            label="Páginas de actividad reciente"
          />
        </>
      ) : (
        <p className={styles.empty}>Todavía no hay acciones registradas.</p>
      )}
    </section>
  );
}

/** Navegación local: todas las áreas mantienen la misma fotografía del servidor. */
export function MetricsSnapshot({ data }: { data: AdminMetrics }) {
  const id = useId();
  const [section, setSection] = useState<MetricsSection>("resumen");
  const [windowKey, setWindowKey] = useState<WindowMetric["key"]>("24h");
  const metric = data.windows.find((window) => window.key === windowKey);
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + sections.length) % sections.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sections.length - 1;
    else return;
    event.preventDefault();
    setSection(sections[next].key);
    document.getElementById(`${id}-tab-${sections[next].key}`)?.focus();
  }
  return (
    <>
      <dl className={styles.summary} aria-label="Resumen acumulado">
        <div>
          <dt>Acciones registradas</dt>
          <dd>
            <strong>{num(data.total)}</strong>
            <span>Desde el inicio</span>
          </dd>
        </div>
        <div>
          <dt>Perfiles aprobados</dt>
          <dd>
            <strong>{num(data.approvedPros)}</strong>
            <span>{num(data.inPersonPros)} con atención presencial</span>
          </dd>
        </div>
        <div>
          <dt>Solicitudes registradas</dt>
          <dd>
            <strong>{num(data.requests)}</strong>
            <span>Total acumulado</span>
          </dd>
        </div>
        <div>
          <dt>Actividad en 24 horas</dt>
          <dd>
            <strong>{num(data.last24)}</strong>
            <span>Acciones registradas</span>
          </dd>
        </div>
      </dl>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Áreas de métricas"
      >
        {sections.map((item, index) => (
          <button
            key={item.key}
            id={`${id}-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={section === item.key}
            aria-controls={`${id}-panel-${item.key}`}
            tabIndex={section === item.key ? 0 : -1}
            onClick={() => setSection(item.key)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {sections.map((item) => (
        <div
          key={item.key}
          id={`${id}-panel-${item.key}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${item.key}`}
          hidden={section !== item.key}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: el panel ARIA recibe foco para leer su contenido con teclado.
          tabIndex={0}
          className={styles.panel}
        >
          {item.key === "resumen" && metric ? (
            <section
              className={styles.detail}
              aria-label="Actividad por período"
            >
              <div className={styles.detailHeading}>
                <div>
                  <h3>Actividad por período</h3>
                  <p>Elige la ventana de tiempo que quieres revisar.</p>
                </div>
                <fieldset className={styles.periods}>
                  <legend className={styles.srOnly}>
                    Período de actividad
                  </legend>
                  {data.windows.map((window) => (
                    <button
                      key={window.key}
                      type="button"
                      aria-pressed={windowKey === window.key}
                      aria-label={window.label}
                      onClick={() => setWindowKey(window.key)}
                    >
                      {window.key === "24h"
                        ? "24 horas"
                        : window.key === "7d"
                          ? "7 días"
                          : "30 días"}
                    </button>
                  ))}
                </fieldset>
              </div>
              <div className={styles.windowTotal} aria-live="polite">
                <strong>{num(metric.total)}</strong>
                <div>
                  <span>acciones registradas</span>
                  <small>{metric.label}</small>
                </div>
              </div>
              <dl className={styles.breakdown}>
                {breakdownFields.map(([field, label]) => (
                  <div key={field}>
                    <dt>{label}</dt>
                    <dd>{num(metric[field])}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.scopeNote}>
                Los contactos y los tipos de acción pueden coincidir en una
                misma acción. Los formularios se cuentan por separado.
              </p>
            </section>
          ) : item.key === "adquisicion" ? (
            <GroupDetail
              data={data}
              groups={["bySource", "byCampaign", "byType"]}
            />
          ) : item.key === "contactos" ? (
            <GroupDetail
              data={data}
              groups={["psychologists", "aliados", "contactEmails"]}
            />
          ) : item.key === "actividad" ? (
            <RecentActivity data={data} />
          ) : null}
        </div>
      ))}
    </>
  );
}

// Conserva la última lectura real ante fallos temporales. Una petición por panel;
// no sondea una pestaña oculta y descarta datos tras perder la autorización.
export function MetricsDashboard() {
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [status, setStatus] = useState<MetricsPollingState>({
    loading: true,
    error: null,
    nextRetryMs: null,
  });
  const pollerRef = useRef<MetricsPoller | null>(null);
  useEffect(() => {
    const poller = createMetricsPoller({
      onData: setData,
      onState: (next) => {
        if (next.error === "unauthorized") setData(null);
        setStatus(next);
      },
      isVisible: () => document.visibilityState === "visible",
    });
    pollerRef.current = poller;
    const onVisibility = () => {
      if (document.visibilityState === "visible") poller.refresh();
      else poller.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    poller.refresh();
    return () => {
      poller.stop();
      pollerRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const failureMessage =
    status.error === "unauthorized"
      ? "Tu sesión no tiene permiso para consultar estas métricas. Vuelve a iniciar sesión con una cuenta administradora verificada."
      : "No se pudieron actualizar las métricas. Conservamos la última lectura disponible.";
  const retryButton = (
    <button
      type="button"
      className={styles.refresh}
      onClick={() => pollerRef.current?.retry()}
      disabled={status.loading}
    >
      {status.loading ? "Actualizando…" : "Volver a intentar"}
    </button>
  );
  if (!data)
    return (
      <div className={styles.loadingState} aria-busy={status.loading}>
        <p role={status.error ? "alert" : "status"}>
          {status.error === "unauthorized"
            ? failureMessage
            : status.error
              ? "No se pudieron cargar las métricas. Puedes volver a intentarlo."
              : "Cargando métricas…"}
        </p>
        {status.error ? retryButton : null}
      </div>
    );
  return (
    <div className={styles.dashboard} aria-busy={status.loading}>
      <div className={styles.statusRow}>
        <div>
          <p className={styles.liveStatus}>
            <span
              className={status.error ? styles.staleDot : styles.liveDot}
              aria-hidden="true"
            />
            {status.error ? "Lectura anterior" : "Actualización automática"}
          </p>
          <p className={styles.updateNote}>
            Cada 30 segundos mientras esta pestaña esté visible.
            {` Última lectura: ${hora(data.generatedAt)}.`}
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => pollerRef.current?.refresh()}
          disabled={status.loading}
        >
          {status.loading ? "Actualizando…" : "Actualizar ahora"}
        </button>
      </div>
      {status.error ? (
        <div role="alert" className={styles.error}>
          <p>
            {failureMessage}
            {status.nextRetryMs
              ? ` Reintentaremos automáticamente tras una espera de ${Math.ceil(status.nextRetryMs / 1000)} segundos.`
              : ""}
          </p>
          {retryButton}
        </div>
      ) : null}
      <MetricsSnapshot data={data} />
    </div>
  );
}
