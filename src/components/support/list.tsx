import Link from "next/link";
import {
  type ContactStatus,
  contactCategoryLabels,
  contactStatuses,
  contactStatusLabels,
} from "@/lib/contact-messages";
import type { readProfessionalSupportList } from "@/lib/practice/support-queries";
import { supportDateFormatter } from "./date";
import styles from "./support.module.css";

type SupportList = Awaited<ReturnType<typeof readProfessionalSupportList>>;
function listHref(basePath: string, status: string, page = 1) {
  return `${basePath}?${new URLSearchParams({ estado: status, pagina: String(page) })}`;
}
export function SupportStatus({ status }: { status: string }) {
  return (
    <span className={styles.status} data-status={status}>
      {contactStatusLabels[status as ContactStatus] || "En revisión"}
    </span>
  );
}
export function SupportPagination({
  page,
  pageCount,
  total,
  basePath,
  status,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  status?: string;
}) {
  if (pageCount <= 1) return null;
  const href = (value: number) =>
    status === undefined
      ? `${basePath}?pagina=${value}`
      : listHref(basePath, status, value);
  return (
    <nav className={styles.pagination} aria-label="Páginas del historial">
      {page > 1 ? (
        <Link
          className={styles.pageLink}
          href={href(page - 1)}
          prefetch={false}
        >
          ← Anterior
        </Link>
      ) : (
        <span className={styles.pageLink} aria-disabled="true">
          ← Anterior
        </span>
      )}
      <span>
        Página {page} de {pageCount} · {total} registros
      </span>
      {page < pageCount ? (
        <Link
          className={styles.pageLink}
          href={href(page + 1)}
          prefetch={false}
        >
          Siguiente →
        </Link>
      ) : (
        <span className={styles.pageLink} aria-disabled="true">
          Siguiente →
        </span>
      )}
    </nav>
  );
}
export function SupportTicketList({
  list,
  basePath,
  detailPath,
  staff = false,
  timeZone = "UTC",
}: {
  list: SupportList;
  basePath: string;
  detailPath: string;
  staff?: boolean;
  timeZone?: string;
}) {
  const dateLabel = supportDateFormatter(timeZone);
  return (
    <>
      <nav className={styles.filters} aria-label="Filtrar consultas por estado">
        {(["all", ...contactStatuses] as const).map((status) => (
          <Link
            className={styles.filter}
            key={status}
            href={listHref(basePath, status)}
            prefetch={false}
            aria-current={list.status === status ? "page" : undefined}
          >
            {status === "all" ? "Todas" : contactStatusLabels[status]}
            <span className={styles.count}>{list.counts[status]}</span>
          </Link>
        ))}
      </nav>
      <p className={styles.meta}>
        {list.total} {list.total === 1 ? "consulta" : "consultas"} · Más
        recientes primero
      </p>
      {list.items.length ? (
        <ul className={styles.list}>
          {list.items.map((ticket) => (
            <li key={ticket.id}>
              <Link
                className={styles.ticket}
                href={`${detailPath}/${ticket.id}`}
                prefetch={false}
              >
                <div>
                  <SupportStatus status={ticket.status} />
                  <h3>
                    {contactCategoryLabels[
                      ticket.category as keyof typeof contactCategoryLabels
                    ] || "Consulta"}
                  </h3>
                  {staff &&
                  "name" in ticket &&
                  typeof ticket.name === "string" ? (
                    <p className={styles.meta}>{ticket.name || "Contacto"}</p>
                  ) : null}
                  <p className={styles.meta}>
                    {dateLabel(ticket.updatedAt)} · {ticket.replyCount}{" "}
                    {ticket.replyCount === 1 ? "respuesta" : "respuestas"}
                    {staff
                      ? ` · ${ticket.source === "professional_dashboard" ? "Panel profesional" : "Contacto público"}`
                      : ""}
                  </p>
                </div>
                <span className={styles.open}>Abrir →</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <h3>
            {list.counts.all
              ? "No hay consultas en este estado"
              : "Tu próxima conversación empieza aquí"}
          </h3>
          <p>
            {list.counts.all
              ? "Puedes consultar el resto del historial cambiando el filtro."
              : "Las consultas y las respuestas del equipo quedarán organizadas en este espacio."}
          </p>
        </div>
      )}
      <SupportPagination {...list} basePath={basePath} status={list.status} />
    </>
  );
}
