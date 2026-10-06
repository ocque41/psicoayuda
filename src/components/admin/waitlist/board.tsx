import Link from "next/link";
import {
  type AdminWaitlistData,
  generalWaitlistStatusLabels,
  helpQueueFilterLabels,
} from "@/lib/admin-waitlist/types";
import { WaitlistDetailDialog } from "./detail-dialog";
import { waitlistDate, waitlistHref } from "./view-model";
import styles from "./waitlist.module.css";

export function AdminWaitlistBoard({ data }: { data: AdminWaitlistData }) {
  const items = data.items.filter((item) => item.tab === data.tab);
  const labels =
    data.tab === "general"
      ? generalWaitlistStatusLabels
      : helpQueueFilterLabels;
  return (
    <div className={styles.workspace}>
      <nav className={styles.tabs} aria-label="Listas de espera independientes">
        <Link
          href={waitlistHref(data, { tab: "general" })}
          aria-current={data.tab === "general" ? "page" : undefined}
          prefetch={false}
          aria-label={
            data.failed
              ? "Apoyo general"
              : `Apoyo general, ${data.sourceCounts.general} registros`
          }
        >
          Apoyo general{" "}
          {!data.failed ? (
            <span className={styles.count} aria-hidden="true">
              {data.sourceCounts.general}
            </span>
          ) : null}
        </Link>
        <Link
          href={waitlistHref(data, { tab: "terremoto" })}
          aria-current={data.tab === "terremoto" ? "page" : undefined}
          prefetch={false}
          aria-label={
            data.failed
              ? "Ayuda Terremoto gratis"
              : `Ayuda Terremoto gratis, ${data.sourceCounts.terremoto} solicitudes`
          }
        >
          Ayuda Terremoto · $0{" "}
          {!data.failed ? (
            <span className={styles.count} aria-hidden="true">
              {data.sourceCounts.terremoto}
            </span>
          ) : null}
        </Link>
      </nav>
      <div className={styles.notice}>
        <strong>
          {data.tab === "general"
            ? "Solicitudes de apoyo general"
            : "Acompañamiento gratuito por el terremoto"}
        </strong>
        <p>
          {data.tab === "general"
            ? "Esta lista tiene su propio seguimiento. No se combina con las solicitudes de Ayuda Terremoto."
            : "Las solicitudes y sus asignaciones se consultan aquí. La gestión del programa gratuito se mantiene en Solicitudes."}
        </p>
      </div>
      <form
        method="get"
        action="/admin/lista-de-espera"
        className={styles.toolbar}
      >
        <input type="hidden" name="fuente" value={data.tab} />
        <label>
          {data.tab === "general"
            ? "Buscar por referencia"
            : "Buscar por referencia o alias"}
          <input
            name="q"
            type="search"
            maxLength={100}
            autoComplete="off"
            pattern="[^@]*"
            placeholder={
              data.tab === "general" ? "Referencia" : "Referencia o alias"
            }
            title="Usa una referencia o un alias. El correo se consulta en el detalle privado."
            defaultValue={data.q}
          />
        </label>
        <label>
          Seguimiento
          <select name="estado" defaultValue={data.status}>
            <option value="all">
              Todos los estados
              {!data.failed ? ` (${data.counts.all ?? 0})` : ""}
            </option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
                {!data.failed ? ` (${data.counts[key] ?? 0})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>
            Filtrar
          </button>
          {data.q ||
          data.status !== (data.tab === "general" ? "all" : "waiting") ? (
            <Link
              className={styles.secondary}
              href={waitlistHref(data, {
                q: "",
                status: data.tab === "general" ? "all" : "waiting",
                page: 1,
              })}
              prefetch={false}
            >
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>
      {data.queryWarning ? (
        <p className={styles.error} role="alert">
          {data.queryWarning}
        </p>
      ) : null}
      {data.failed ? (
        <section
          className={styles.empty}
          aria-labelledby="waitlist-error-title"
        >
          <h2 id="waitlist-error-title">No pudimos abrir la lista</h2>
          <p role="alert">
            Los registros se conservan. Vuelve a intentarlo en unos momentos; no
            hace falta crearlos otra vez.
          </p>
          <Link
            href={waitlistHref(data)}
            className={styles.secondary}
            prefetch={false}
          >
            Volver a intentar
          </Link>
        </section>
      ) : (
        <>
          <p className={styles.summary} role="status">
            {data.total} {data.total === 1 ? "registro" : "registros"} con estos
            filtros · Página {data.page} de {data.pages}. Los datos de contacto
            y el contexto se abren por separado.
          </p>
          {items.length ? (
            <ul
              className={styles.list}
              aria-label="Registros de la página actual"
            >
              {items.map((item) => (
                <li key={`${item.tab}:${item.id}`}>
                  <Link
                    href={waitlistHref(data, { person: item.id })}
                    className={styles.entry}
                    data-waitlist-entry={item.id}
                    prefetch={false}
                  >
                    <span>
                      <strong>
                        {item.tab === "general"
                          ? "Registro de apoyo general"
                          : item.name || "Persona sin alias"}
                      </strong>
                      <small>Referencia: {item.id.slice(-8)}</small>
                      <small>Registrada {waitlistDate(item.createdAt)}</small>
                      {item.tab === "terremoto" ? (
                        <small>
                          {item.activeAssignments} asignaciones activas ·{" "}
                          {item.offeredAssignments} ofertas pendientes
                          {item.requiresReview ? " · revisar seguimiento" : ""}
                        </small>
                      ) : null}
                    </span>
                    <span className={styles.entryMeta}>
                      <span className={styles.status}>{item.statusLabel}</span>
                      <small>Abrir detalle →</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <section
              className={styles.empty}
              aria-labelledby="waitlist-empty-title"
            >
              <h2 id="waitlist-empty-title">
                {data.q
                  ? "No encontramos coincidencias"
                  : "No hay registros en este seguimiento"}
              </h2>
              <p>
                {data.q
                  ? "Prueba otra referencia o revisa todos los estados de esta lista."
                  : "Puedes cambiar el seguimiento para consultar otros registros de esta lista."}
              </p>
            </section>
          )}
          <nav
            className={styles.pagination}
            aria-label="Páginas de la lista de espera"
          >
            <span className={styles.summary}>
              Hasta 25 registros por página
            </span>
            <div className={styles.actions}>
              {data.page > 1 ? (
                <Link
                  href={waitlistHref(data, { page: data.page - 1 })}
                  className={styles.secondary}
                  prefetch={false}
                >
                  ← Anterior
                </Link>
              ) : null}
              {data.page < data.pages ? (
                <Link
                  href={waitlistHref(data, { page: data.page + 1 })}
                  className={styles.secondary}
                  prefetch={false}
                >
                  Siguiente →
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      )}
      {!data.failed && data.selected?.tab === data.tab ? (
        <WaitlistDetailDialog
          key={`${data.selected.tab}:${data.selected.id}`}
          data={data}
          detail={data.selected}
        />
      ) : null}
    </div>
  );
}
