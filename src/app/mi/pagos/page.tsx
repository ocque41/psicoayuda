import Link from "next/link";
import { PracticePagination } from "@/components/practice/pagination";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import { patientPayments } from "@/lib/patient/queries";
import {
  dateLabel,
  moneyLabel,
  paymentMethodLabels,
} from "@/lib/practice/domain";
import styles from "../mi.module.css";

const planStatuses: Record<string, string> = {
  proposed: "Por revisar",
  accepted: "Aceptado",
  active: "Activo",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  past_due: "Pago pendiente",
  unpaid: "Pendiente",
  incomplete: "En preparación",
};
export default async function PatientPayments({
  searchParams,
}: {
  searchParams: Promise<{
    pagina?: string;
    acuerdos?: string;
    ciclos?: string;
    tarjetas?: string;
  }>;
}) {
  const { account } = await requirePatientAccount(),
    params = await searchParams,
    payments = await patientPayments(account.userId, params.pagina, {
      plansPage: params.acuerdos,
      cyclesPage: params.ciclos,
      cardsPage: params.tarjetas,
    });
  function historyHref(key: string, page: number) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set(key, String(page));
    return `/mi/pagos?${q}`;
  }
  return (
    <WorkspaceShell
      audience="patient"
      title="Todo claro, todo a mano"
      description="Los acuerdos y pagos registrados por tus profesionales, organizados sin mezclar monedas."
    >
      <section className="workspace-card">
        <h2>Acuerdos de acompañamiento</h2>
        {payments.plans.length ? (
          payments.plans.map((p) => (
            <article className={styles.row} key={p.id}>
              <div className={styles.rowMain}>
                <span className="workspace-tag">
                  {planStatuses[p.status] || "En revisión"}
                </span>
                <h3>{p.title}</h3>
                <p className="hint">
                  {p.name} · {moneyLabel(p.priceCents, p.currency)}
                  {p.interval === "month" ? " por ciclo mensual" : ""}
                </p>
              </div>
              <Link
                className="button secondary"
                href={`/acompanamiento/${p.id}`}
              >
                Revisar acuerdo
              </Link>
            </article>
          ))
        ) : (
          <div className="workspace-empty">
            <p>
              Aquí aparecerán los acuerdos que revises con tu profesional. El
              programa Ayuda Terremoto es gratuito.
            </p>
          </div>
        )}
        <PracticePagination
          {...payments.plansPagination}
          href={(page) => historyHref("acuerdos", page)}
        />
      </section>
      <section className="workspace-card">
        <h2>Pagos externos registrados</h2>
        <p className="hint">
          Son confirmaciones registradas por el profesional. Nido no procesa
          estos métodos ni verifica la transacción en el proveedor. Si falta
          algo, consúltalo por chat.
        </p>
        {payments.rows.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Historial de pagos externos</caption>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Profesional</th>
                  <th>Método</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {payments.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dateLabel(r.receivedAt, account.timezone)}</td>
                    <td>{r.name}</td>
                    <td>{paymentMethodLabels[r.method] || "Externo"}</td>
                    <td>{moneyLabel(r.amountCents, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-empty">
            <p>
              Todavía no hay pagos externos registrados en tus fichas
              vinculadas.
            </p>
          </div>
        )}
        <PracticePagination
          {...payments}
          href={(page) => historyHref("pagina", page)}
        />
      </section>
      {payments.cardsPagination.total ? (
        <section className="workspace-card">
          <h2>Pagos por tarjeta</h2>
          <p className="hint">
            Estado confirmado por el procesador del pago. Los importes se
            mantienen en la moneda acordada.
          </p>
          {payments.cards.map((p) => (
            <article className={styles.row} key={p.id}>
              <div className={styles.rowMain}>
                <span className="workspace-tag">
                  {{
                    paid: "Pagado",
                    pending: "Pendiente",
                    failed: "Fallido",
                    expired: "Enlace caducado",
                    refunded: "Reembolsado",
                    disputed: "En revisión",
                  }[p.status] || "En revisión"}
                </span>
                <h3>{p.title || "Sesiones"}</h3>
                <p className="hint">
                  {p.professionalName || "Profesional"} ·{" "}
                  {dateLabel(p.paidAt || p.createdAt, account.timezone)}
                </p>
              </div>
              <strong>{moneyLabel(p.amountCents, p.currency)}</strong>
            </article>
          ))}
          <PracticePagination
            {...payments.cardsPagination}
            href={(page) => historyHref("tarjetas", page)}
          />
        </section>
      ) : null}
      {payments.cycles.length ? (
        <section className="workspace-card">
          <h2>Ciclos de sesiones</h2>
          {payments.cycles.map((c) => (
            <article key={c.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className="workspace-tag">
                  {c.status === "paid" ? "Confirmado" : "En revisión"}
                </span>
                <h3>{c.title}</h3>
                <p className="hint">
                  {dateLabel(c.startsAt, account.timezone)} —{" "}
                  {dateLabel(c.endsAt, account.timezone)}
                </p>
              </div>
              <strong>{moneyLabel(c.amountCents, c.currency)}</strong>
            </article>
          ))}
          <PracticePagination
            {...payments.cyclesPagination}
            href={(page) => historyHref("ciclos", page)}
          />
        </section>
      ) : null}
    </WorkspaceShell>
  );
}
