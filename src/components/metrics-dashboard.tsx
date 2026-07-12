"use client";

import { useCallback, useEffect, useState } from "react";

// Panel de métricas que se refresca solo (cada 30s) llamando a /api/admin/metrics.
// Sin librerías: fetch + setInterval. Solo lo ve un admin (el endpoint valida).
// Estilos inline a propósito (globals.css tiene deuda de formato y el pre-commit
// lo reformatearía entero).

type Row = { label: string; n: number };
type Recent = {
  id: string;
  type: string;
  label: string | null;
  page: string | null;
  source: string | null;
  ts: number;
};
type WindowMetric = {
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
type Metrics = {
  generatedAt: number;
  windows: WindowMetric[];
  total: number;
  last24: number;
  bySource: Row[];
  byCampaign: Row[];
  byType: Row[];
  psychologists: Row[];
  aliados: Row[];
  contactEmails: Row[];
  recent: Recent[];
  approvedPros: number;
  inPersonPros: number;
  requests: number;
};

const REFRESH_MS = 30_000;

function hora(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function num(value: number): string {
  return new Intl.NumberFormat("es").format(value);
}

function BarList({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="muted">Sin datos aún.</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
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
          <dt>CTAs</dt>
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
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as Metrics;
      setData(json);
      setError(false);
      setUpdated(Date.now());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (!data) {
    return (
      <p className="muted">
        {error ? "No se pudieron cargar las métricas." : "Cargando métricas…"}
      </p>
    );
  }

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        Se actualiza solo cada 30s
        {updated ? ` · última: ${hora(updated)}` : ""}
        {error ? " · (reintentando…)" : ""}
      </p>

      <div className="panel-chips" style={{ marginBottom: 16 }}>
        <span className="panel-chip ok">{num(data.total)} clics totales</span>
        <span className="panel-chip">{num(data.last24)} en 24h</span>
        <span className="panel-chip">
          {num(data.approvedPros)} psicólogos aprobados
        </span>
        <span className="panel-chip">
          {num(data.inPersonPros)} presenciales
        </span>
        <span className="panel-chip">{num(data.requests)} solicitudes</span>
      </div>

      <div className="metric-window-grid">
        {data.windows.map((metric) => (
          <MetricWindowCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="grid grid-2">
        <article className="card">
          <h3>Origen del tráfico</h3>
          <BarList rows={data.bySource} />
        </article>
        <article className="card">
          <h3>Campañas con más acciones</h3>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            Fuente y campaña de entrada en los últimos 30 días.
          </p>
          <BarList rows={data.byCampaign} />
        </article>
      </div>

      <article className="card">
        <h3>Psicólogos contactados por WhatsApp</h3>
        <BarList rows={data.psychologists} />
      </article>

      <article className="card">
        <h3>Aliados y recursos externos</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Clics a los contactos y webs de las asociaciones y recursos.
        </p>
        <BarList rows={data.aliados} />
      </article>

      <article className="card">
        <h3>Correos de contacto</h3>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          Clics separados por página y dirección pública.
        </p>
        <BarList rows={data.contactEmails} />
      </article>

      <article className="card">
        <h3>Tipos de acción</h3>
        <BarList rows={data.byType} />
      </article>

      <article className="card">
        <h3>Actividad reciente</h3>
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
      </article>
    </div>
  );
}
