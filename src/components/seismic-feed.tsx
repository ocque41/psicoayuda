import { getVenezuelaQuakes, USGS_SOURCE } from "@/lib/usgs";

function magTone(mag: number | null): "fuerte" | "medio" | "leve" {
  if (mag === null) return "leve";
  if (mag >= 5) return "fuerte";
  if (mag >= 4) return "medio";
  return "leve";
}

function formatWhen(ms: number): string {
  if (!ms) return "";
  try {
    return new Intl.DateTimeFormat("es-VE", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export async function SeismicFeed() {
  const quakes = await getVenezuelaQuakes(10);

  return (
    <section className="card seismic" aria-labelledby="seismic-title">
      <h2 id="seismic-title">Últimos sismos en Venezuela</h2>
      <p className="hint">
        Datos en vivo del USGS, se actualizan cada 5 minutos. Fuente:{" "}
        <a href={USGS_SOURCE.url} target="_blank" rel="noopener noreferrer">
          {USGS_SOURCE.name}
        </a>
        .
      </p>

      {quakes.length === 0 ? (
        <p className="muted">
          No pudimos cargar el feed en este momento. Puedes consultarlo
          directamente en el{" "}
          <a href={USGS_SOURCE.url} target="_blank" rel="noopener noreferrer">
            mapa del USGS
          </a>
          .
        </p>
      ) : (
        <ul className="quake-list">
          {quakes.map((q) => (
            <li key={q.id} className="quake">
              <span className={`quake-mag tone-${magTone(q.mag)}`}>
                M {q.mag !== null ? q.mag.toFixed(1) : "—"}
              </span>
              <span className="quake-body">
                <span className="quake-place">{q.place}</span>
                <span className="quake-when muted">{formatWhen(q.time)}</span>
              </span>
              <a
                className="quake-link"
                href={q.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Detalle del sismo en ${q.place} en USGS`}
              >
                Detalle ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
