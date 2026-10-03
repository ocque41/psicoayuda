import type { readSupportThread } from "@/lib/practice/support-queries";
import { supportDateFormatter } from "./date";
import { SupportPagination } from "./list";
import styles from "./support.module.css";

type Thread = NonNullable<Awaited<ReturnType<typeof readSupportThread>>>;
export function SupportThread({
  thread,
  basePath,
  staff = false,
  timeZone = "UTC",
}: {
  thread: Thread;
  basePath: string;
  staff?: boolean;
  timeZone?: string;
}) {
  const dateLabel = supportDateFormatter(timeZone);
  return (
    <section aria-label="Historial de la consulta">
      <article className={styles.message}>
        <div className={styles.messageHeader}>
          <strong>Consulta inicial</strong>
          <time dateTime={thread.ticket.createdAt}>
            {dateLabel(thread.ticket.createdAt)}
          </time>
        </div>
        <p className={styles.body}>{thread.ticket.body}</p>
      </article>
      {thread.total > thread.pageSize ? (
        <p className={styles.meta}>
          Respuestas {(thread.page - 1) * thread.pageSize + 1}–
          {Math.min(thread.page * thread.pageSize, thread.total)} de{" "}
          {thread.total}
        </p>
      ) : null}
      <ol className={styles.timeline} aria-label="Respuestas">
        {thread.replies.map((reply) => (
          <li
            className={styles.message}
            data-author={reply.authorRole}
            key={reply.id}
          >
            <div className={styles.messageHeader}>
              <strong>
                {reply.authorRole === "staff"
                  ? "Equipo de Nido"
                  : staff
                    ? "Profesional"
                    : "Tú"}
              </strong>
              <time dateTime={reply.createdAt}>
                {dateLabel(reply.createdAt)}
              </time>
            </div>
            <p className={styles.body}>{reply.body}</p>
          </li>
        ))}
      </ol>
      {!thread.total ? (
        <p className={styles.notice}>
          El equipo aún no ha respondido. Puedes añadir un detalle a esta misma
          consulta.
        </p>
      ) : null}
      <SupportPagination {...thread} basePath={basePath} />
    </section>
  );
}
