import Link from "next/link";
import type { adminUpdateContactMessageStatus } from "@/app/actions-contact";
import {
  buildPreparedEmailUrl,
  type ContactCategory,
  type ContactSource,
  type ContactStatus,
  contactCategories,
  contactCategoryLabels,
  contactSourceLabels,
  contactSources,
  contactStatuses,
  contactStatusLabels,
} from "@/lib/contact-messages";

type ContactRow = {
  id: string;
  source: string;
  category: string;
  name: string | null;
  email: string;
  message: string;
  status: string;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
};

const dateFormatter = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Caracas",
});

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function categoryLabel(value: string) {
  return contactCategoryLabels[value as ContactCategory] ?? value;
}

function sourceLabel(value: string) {
  return contactSourceLabels[value as ContactSource] ?? value;
}

function statusLabel(value: string) {
  return contactStatusLabels[value as ContactStatus] ?? value;
}

export function AdminContactInbox({
  rows,
  counts,
  statusFilter,
  sourceFilter,
  categoryFilter,
  updateStatusAction,
}: {
  rows: ContactRow[];
  counts: Record<ContactStatus, number>;
  statusFilter: ContactStatus | "";
  sourceFilter: ContactSource | "";
  categoryFilter: ContactCategory | "";
  updateStatusAction: typeof adminUpdateContactMessageStatus;
}) {
  return (
    <section className="admin-contact-inbox" aria-labelledby="contactos">
      <div className="contact-inbox-summary">
        {contactStatuses.map((status) => (
          <span className={`panel-chip contact-status-${status}`} key={status}>
            {contactStatusLabels[status]}: {counts[status]}
          </span>
        ))}
      </div>

      <form action="/admin#contactos" className="admin-contact-filters">
        <label>
          Estado
          <select name="contacto_estado" defaultValue={statusFilter}>
            <option value="">Todos</option>
            {contactStatuses.map((status) => (
              <option key={status} value={status}>
                {contactStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Origen
          <select name="contacto_origen" defaultValue={sourceFilter}>
            <option value="">Todos</option>
            {contactSources.map((source) => (
              <option key={source} value={source}>
                {contactSourceLabels[source]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Motivo
          <select name="contacto_motivo" defaultValue={categoryFilter}>
            <option value="">Todos</option>
            {contactCategories.map((category) => (
              <option key={category} value={category}>
                {contactCategoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-request-filter-actions">
          <button className="button" type="submit">
            Filtrar
          </button>
          <Link className="button secondary" href="/admin#contactos">
            Limpiar
          </Link>
        </div>
      </form>

      {rows.length ? (
        <div className="admin-contact-list">
          {rows.map((row) => (
            <article className="card admin-contact-card" key={row.id}>
              <div className="admin-contact-head">
                <div>
                  <p className="eyebrow">{sourceLabel(row.source)}</p>
                  <h3>{categoryLabel(row.category)}</h3>
                </div>
                <span className={`panel-chip contact-status-${row.status}`}>
                  {statusLabel(row.status)}
                </span>
              </div>

              <dl className="admin-request-meta">
                <div>
                  <dt>Persona</dt>
                  <dd>{row.name || "No indicó su nombre"}</dd>
                </div>
                <div>
                  <dt>Correo</dt>
                  <dd>
                    <a href={`mailto:${row.email}`}>{row.email}</a>
                  </dd>
                </div>
                <div>
                  <dt>Recibido</dt>
                  <dd>{dateLabel(row.createdAt)}</dd>
                </div>
              </dl>

              <p className="admin-contact-message">{row.message}</p>

              {row.handledBy ? (
                <p className="muted">
                  Última revisión: {row.handledBy}
                  {row.handledAt ? ` · ${dateLabel(row.handledAt)}` : ""}
                </p>
              ) : null}

              <div className="admin-contact-actions">
                <a
                  className="button human"
                  href={buildPreparedEmailUrl(
                    row.email,
                    `Respuesta de Nido: ${categoryLabel(row.category)}`,
                  )}
                >
                  Responder por correo
                </a>
                <form action={updateStatusAction}>
                  <input name="contactMessageId" type="hidden" value={row.id} />
                  <select name="status" defaultValue={row.status}>
                    {contactStatuses.map((status) => (
                      <option key={status} value={status}>
                        {contactStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <button className="button secondary" type="submit">
                    Guardar estado
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">No hay contactos con estos filtros.</p>
      )}
    </section>
  );
}
