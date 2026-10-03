"use client";

import { useEffect, useRef, useState } from "react";
import {
  createMetricsPoller,
  type MetricsPoller,
  type MetricsPollingState,
} from "@/lib/admin-metrics-polling";
import type {
  AdminMetrics,
  MetricRow,
  WindowMetric,
} from "@/shared/admin-metrics";

// El panel conserva la última fotografía real ante fallos temporales.
// No lanza peticiones simultáneas ni sondea una pestaña oculta.
const numberFormatter = new Intl.NumberFormat("es");
const dateFormatter = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "medium",
});

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

function BarList({
  rows,
  truncated = false,
}: {
  rows: MetricRow[];
  truncated?: boolean;
}) {
  if (!rows.length) return <p className="muted">Sin datos aún.</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <>
      {truncated ? (
        <p className="muted">
          Se muestran los {rows.length} grupos con más acciones. Los totales
          incluyen todos los grupos.
        </p>
      ) : null}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {rows.map((r) => (
          <li
            key={r.label}
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              padding: "5px 10px",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                insetBlock: 0,
                insetInlineStart: 0,
                width: `${(r.n / max) * 100}%`,
                background: "var(--accent-soft, #e8f0ea)",
                borderRadius: 6,
              }}
            />
            <span style={{ position: "relative", zIndex: 1 }}>{r.label}</span>
            <strong style={{ position: "relative", zIndex: 1 }}>{r.n}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

function MetricWindowCard({ metric }: { metric: WindowMetric }) {
  return (
    <article className="card metric-window">
      <h3>{metric.label}</h3>
      <div className="metric-window-total">
        <strong>{num(metric.total)}</strong>
        <span>acciones registradas</span>
      </div>
      <dl className="metric-breakdown">
        <div>
          <dt>Profesionales</dt>
          <dd>{num(metric.professionalContacts)}</dd>
        </div>
        <div>
          <dt>Aliados</dt>
          <dd>{num(metric.allyContacts)}</dd>
        </div>
        <div>
          <dt>Botones de acción</dt>
          <dd>{num(metric.ctas)}</dd>
        </div>
        <div>
          <dt>Solicitudes</dt>
          <dd>{num(metric.leads)}</dd>
        </div>
        <div>
          <dt>Altas pro</dt>
          <dd>{num(metric.signups)}</dd>
        </div>
        <div>
          <dt>Clics en correos</dt>
          <dd>{num(metric.emailClicks)}</dd>
        </div>
        <div>
          <dt>Formularios</dt>
          <dd>{num(metric.contactForms)}</dd>
        </div>
        <div>
          <dt>Intentos de compartir</dt>
          <dd>{num(metric.referralShares)}</dd>
        </div>
        <div>
          <dt>Altas por invitación</dt>
          <dd>{num(metric.referralSignups)}</dd>
        </div>
      </dl>
    </article>
  );
}

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
      className="button secondary"
      onClick={() => pollerRef.current?.retry()}
      disabled={status.loading}
    >
      {status.loading ? "Actualizando…" : "Volver a intentar"}
    </button>
  );
  if (!data) {
    return (
      <div aria-busy={status.loading}>
        <p className="muted" role={status.error ? "alert" : "status"}>
          {status.error === "unauthorized"
            ? failureMessage
            : status.error
              ? "No se pudieron cargar las métricas. Puedes volver a intentarlo."
              : "Cargando métricas…"}
        </p>
        {status.error ? retryButton : null}
      </div>
    );
  }

  return (
    <div aria-busy={status.loading}>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        Actualización automática cada 30 segundos mientras esta pestaña esté
        visible.
        {` Última lectura: ${hora(data.generatedAt)}.`}
        {status.error ? " Datos desactualizados." : ""}
      </p>
      {status.error ? (
        <div role="alert" style={{ marginBottom: 12 }}>
          <p>
            {failureMessage}
            {status.nextRetryMs
              ? ` Reintentaremos automáticamente tras una espera de ${Math.ceil(status.nextRetryMs / 1000)} segundos.`
              : ""}
          </p>
          {retryButton}
        </div>
      ) : null}

      <div className="panel-chips" style={{ marginBottom: 16 }}>
        <span className="panel-chip ok">
          {num(data.total)}{" "}
          {data.total === 1 ? "acción registrada" : "acciones registradas"}
        </span>
        <span className="panel-chip">{num(data.last24)} en 24h</span>
        <span className="panel-chip">
          {num(data.approvedPros)}{" "}
          {data.approvedPros === 1 ? "perfil aprobado" : "perfiles aprobados"}
        </span>
        <span className="panel-chip">
          {num(data.inPersonPros)} presenciales
        </span>
        <span className="panel-chip">
          {num(data.requests)}{" "}
          {data.requests === 1
            ? "solicitud registrada"
            : "solicitudes registradas"}
        </span>
      </div>

      <div className="metric-window-grid">
        {data.windows.map((metric) => (
          <MetricWindowCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="grid grid-2">
        <article className="card">
          <h3>Origen del tráfico</h3>
          <BarList rows={data.bySource} truncated={data.truncated.bySource} />
        </article>
        <article className="card">
          <h3>Campañas con más acciones</h3>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            Fuente y campaña de entrada en los últimos 30 días.
          </p>
          <BarList
            rows={data.byCampaign}
            truncated={data.truncated.byCampaign}
          />
        </article>
      </div>

      <article className="card">
        <h3>Contactos con profesionales</h3>
        <BarList
          rows={data.psychologists}
          truncated={data.truncated.psychologists}
        />
      </article>

      <article className="card">
        <h3>Aliados y recursos externos</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Clics a los contactos y webs de las asociaciones y recursos.
        </p>
        <BarList rows={data.aliados} truncated={data.truncated.aliados} />
      </article>

      <article className="card">
        <h3>Correos de contacto</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Clics separados por página y dirección pública.
        </p>
        <BarList
          rows={data.contactEmails}
          truncated={data.truncated.contactEmails}
        />
      </article>

      <article className="card">
        <h3>Tipos de acción</h3>
        <BarList rows={data.byType} truncated={data.truncated.byType} />
      </article>

      <article className="card">
        <h3>Actividad reciente</h3>
        {data.recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Qué</th>
                  <th>Página</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Hora">{hora(r.ts)}</td>
                    <td data-label="Tipo">{r.type}</td>
                    <td data-label="Qué">{r.label ?? "—"}</td>
                    <td data-label="Página">{r.page ?? "—"}</td>
                    <td data-label="Fuente">{r.source ?? "directo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Todavía no hay acciones registradas.</p>
        )}
      </article>
    </div>
  );
}
