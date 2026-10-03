import { moneyLabel, paymentMethodLabels } from "@/lib/practice/domain";
import type { readReceiptHistory } from "@/lib/practice/receipt-queries";
import { receiptDateLabel } from "@/lib/practice/receipts";
import styles from "./receipts.module.css";

type History = NonNullable<Awaited<ReturnType<typeof readReceiptHistory>>>;

export { receiptStatusLabels } from "@/lib/practice/receipts";
export function ReceiptHistory({
  history,
  timeZone,
}: {
  history: History;
  timeZone: string;
}) {
  const { original, events } = history;
  const referenceLabel = (value: string) =>
    value.startsWith(`${history.current.professionalId}:`)
      ? value.slice(history.current.professionalId.length + 1)
      : value;
  return (
    <section className="workspace-card" aria-labelledby="receipt-history-title">
      <h2 id="receipt-history-title">Historial del registro</h2>
      <p className="hint">
        Cada cambio conserva su fecha y motivo. El registro original permanece
        al final del historial.
      </p>
      <ol className={styles.history} aria-label="Correcciones del registro">
        {events.map((event) => (
          <li key={event.id} className={styles.event}>
            <div className={styles.heading}>
              <span className="workspace-tag">
                {event.kind === "voided" ? "Anulación" : "Corrección"} ·{" "}
                {event.revision}
              </span>
              <time dateTime={event.createdAt}>
                {receiptDateLabel(event.createdAt, timeZone)}
              </time>
            </div>
            <strong>
              {event.kind === "voided"
                ? "Anulado"
                : moneyLabel(event.amountCents, event.currency)}
            </strong>
            <p>{event.reason}</p>
            <p className="hint">
              Referencia: {referenceLabel(event.reference)}
            </p>
            <p className="hint">
              {paymentMethodLabels[event.method] || "Pago externo"} · recibido
              el{" "}
              <time dateTime={event.receivedAt}>
                {receiptDateLabel(event.receivedAt, timeZone)}
              </time>
            </p>
            <p className="hint">
              {event.authorAvailable
                ? "Guardado por tu profesional"
                : "Autor del registro ya no disponible"}
            </p>
          </li>
        ))}
        <li className={`${styles.event} ${styles.original}`}>
          <span className="workspace-tag">Registro original</span>
          <strong>{moneyLabel(original.amountCents, original.currency)}</strong>
          <p className="hint">
            Referencia: {referenceLabel(original.reference)}
          </p>
          <p className="hint">
            {paymentMethodLabels[original.method] || "Pago externo"} · recibido
            el{" "}
            <time dateTime={original.receivedAt}>
              {receiptDateLabel(original.receivedAt, timeZone)}
            </time>
          </p>
          <p className="hint">
            {original.recordedAt ? (
              <>
                Guardado en Nido el{" "}
                <time dateTime={original.recordedAt}>
                  {receiptDateLabel(original.recordedAt, timeZone)}
                </time>
              </>
            ) : (
              "Fecha original de registro no disponible"
            )}
          </p>
        </li>
      </ol>
    </section>
  );
}
