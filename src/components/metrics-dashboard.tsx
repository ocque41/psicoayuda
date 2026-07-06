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
type Metrics = {
  generatedAt: number;
  total: number;
  last24: number;
  bySource: Row[];
  byType: Row[];
  psychologists: Row[];
  aliados: Row[];
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
        <span className="panel-chip ok">{data.total} clics totales</span>
        <span className="panel-chip">{data.last24} en 24h</span>
        <span className="panel-chip">
          {data.approvedPros} psicólogos aprobados
        </span>
        <span className="panel-chip">{data.inPersonPros} presenciales</span>
        <span className="panel-chip">{data.requests} solicitudes</span>
      </div>

      <div className="grid grid-2">
        <article className="card">
          <h3>Origen del tráfico</h3>
          <BarList rows={data.bySource} />
        </article>
        <article className="card">
          <h3>Tipo de clic</h3>
          <BarList rows={data.byType} />
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
                  <td>{hora(r.ts)}</td>
                  <td>{r.type}</td>
                  <td>{r.label ?? "—"}</td>
                  <td>{r.page ?? "—"}</td>
                  <td>{r.source ?? "directo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
