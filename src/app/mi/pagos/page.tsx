import Link from "next/link";
import { PracticePagination } from "@/components/practice/pagination";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import {
  cycleCreditDescriptions,
  cycleCreditLabels,
  cycleDateLabel,
} from "@/lib/patient/credits";
import { patientPayments } from "@/lib/patient/queries";
import {
  dateLabel,
  moneyLabel,
  paymentMethodLabels,
} from "@/lib/practice/domain";
import styles from "../mi.module.css";
import creditStyles from "./credits.module.css";

const planStatuses: Record<string, string> = {
  proposed: "Por revisar",
  accepted: "Aceptado",
  active: "Activo",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  past_due: "Pago pendiente",
  unpaid: "Pendiente",
  incomplete: "En preparación",
  needs_review: "En revisión",
  incomplete_expired: "Preparación caducada",
  paused: "En pausa",
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
                <p className="hint">
                  {p.sessionsCount}{" "}
                  {p.sessionsCount === 1 ? "sesión" : "sesiones"} de{" "}
                  {p.durationMinutes} minutos
                  {p.interval === "month" ? " por ciclo" : " en el paquete"}. El
                  saldo aparece al confirmar un ciclo.
                </p>
              </div>
              <Link
                className="button secondary"
                href={`/acompanamiento/${p.id}`}
                prefetch={false}
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
        <h2>Ciclos de sesiones</h2>
        <p className="hint">
          Cada ciclo conserva su saldo y su vigencia. Las reservas ocupan una
          sesión; se libera cuando el profesional la registra como cancelada.
          Una solicitud de cambio o cancelación todavía no modifica el saldo.
        </p>
        {payments.cycles.length ? (
          <div className={creditStyles.cycles}>
            {payments.cycles.map((c) => (
              <article key={c.id} className={creditStyles.cycle}>
                <div className={creditStyles.heading}>
                  <div>
                    <span
                      className={`workspace-tag ${c.credits.state === "active" || c.credits.state === "upcoming" ? "" : creditStyles.unavailable}`}
                    >
                      {cycleCreditLabels[c.credits.state]}
                    </span>
                    <h3>{c.title}</h3>
                    <p className="hint">{c.name}</p>
                  </div>
                  <strong className={creditStyles.amount}>
                    {moneyLabel(c.amountCents, c.currency)}
                  </strong>
                </div>
                <dl className={creditStyles.balance}>
                  <div>
                    <dt>Incluidas</dt>
                    <dd>{c.credits.included}</dd>
                  </div>
                  <div>
                    <dt>Realizadas</dt>
                    <dd>{c.credits.completed}</dd>
                  </div>
                  <div>
                    <dt>Reservadas</dt>
                    <dd>{c.credits.reserved}</dd>
                  </div>
                  <div
                    className={
                      c.credits.available > 0
                        ? creditStyles.available
                        : undefined
                    }
                  >
                    <dt>Disponibles</dt>
                    <dd>{c.credits.available}</dd>
                  </div>
                </dl>
                <p className={creditStyles.period}>
                  Desde {cycleDateLabel(c.startsAt, account.timezone)} hasta{" "}
                  {cycleDateLabel(c.endsAt, account.timezone)}
                </p>
                <p className={creditStyles.explanation}>
                  {cycleCreditDescriptions[c.credits.state]}
                </p>
                {c.credits.noShows > 0 ? (
                  <p className="hint">
                    {c.credits.noShows}{" "}
                    {c.credits.noShows === 1
                      ? "ausencia registrada también ocupa una sesión."
                      : "ausencias registradas también ocupan sesiones."}{" "}
                    Revisa con tu profesional las condiciones acordadas.
                  </p>
                ) : null}
                {c.credits.otherConsumed > 0 ? (
                  <p className="hint">
                    Hay {c.credits.otherConsumed}{" "}
                    {c.credits.otherConsumed === 1
                      ? "sesión contabilizada"
                      : "sesiones contabilizadas"}{" "}
                    con otro estado. Pide a tu profesional que revise el
                    registro.
                  </p>
                ) : null}
                <div className={creditStyles.footer}>
                  <p className="hint">
                    {c.confirmation === "processor"
                      ? "Origen: procesador de pago."
                      : c.confirmation === "manual"
                        ? "Confirmación externa registrada por el profesional; Nido no verifica el movimiento en el proveedor."
                        : "Confirmación registrada. Consulta su origen con tu profesional."}
                  </p>
                  <div className={creditStyles.actions}>
                    <Link
                      className="button secondary"
                      href={`/acompanamiento/${c.planId}`}
                      prefetch={false}
                    >
                      Revisar este acuerdo
                    </Link>
                    <Link
                      className="button secondary"
                      href={`/mi/mensajes/${c.conversationId}`}
                      prefetch={false}
                    >
                      Consultar por chat
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">
            <p>Todavía no hay ciclos confirmados en tus acuerdos vinculados.</p>
            <p>
              Una propuesta de acuerdo no añade sesiones disponibles. Ayuda
              Terremoto es gratuita y se organiza por separado.
            </p>
          </div>
        )}
        <p className="hint">
          Las citas canceladas no ocupan sesiones en este saldo. La vigencia se
          aplica al inicio de la cita, antes de la hora final del ciclo. Los
          reembolsos y la continuidad se revisan con tu profesional; este
          resumen no inicia pagos ni cambia una renovación.
        </p>
        <p className="hint">
          Las fechas se muestran en la zona horaria de tu cuenta.
        </p>
        <PracticePagination
          {...payments.cyclesPagination}
          href={(page) => historyHref("ciclos", page)}
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
    </WorkspaceShell>
  );
}
