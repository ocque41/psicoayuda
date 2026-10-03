import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PracticeNav } from "@/components/practice/nav";
import { PracticePagination } from "@/components/practice/pagination";
import { receiptStatusLabels } from "@/components/practice/receipt-history";
import styles from "@/components/practice/receipts.module.css";
import { db } from "@/db";
import { practiceSettings } from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { moneyLabel, paymentMethodLabels } from "@/lib/practice/domain";
import { pageNumber } from "@/lib/practice/queries";
import { receiptCurrency, receiptPeriod } from "@/lib/practice/receipt-export";
import {
  readPracticeReceiptPage,
  receiptTotals,
} from "@/lib/practice/receipt-queries";
import { receiptDateLabel } from "@/lib/practice/receipts";

export const metadata: Metadata = {
  title: "Cobros registrados",
  robots: { index: false, follow: false },
};
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; moneda?: string; pagina?: string }>;
}) {
  const pro = await requirePracticeProfessional(),
    query = await searchParams;
  const settings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const zone = settings?.timeZone || "America/Caracas",
    range = receiptPeriod(query.mes, zone),
    currency = receiptCurrency(query.moneda);
  const filters = { ...range, currency };
  const [receipts, totals] = await Promise.all([
    readPracticeReceiptPage(
      pro.id,
      undefined,
      pageNumber(query.pagina),
      25,
      filters,
    ),
    receiptTotals(pro.id, filters),
  ]);
  const parameters = new URLSearchParams({
    mes: range.month,
    ...(currency ? { moneda: currency } : {}),
  });
  function href(page: number) {
    const p = new URLSearchParams(parameters);
    p.set("pagina", String(page));
    return `/pro/cobros?${p}`;
  }
  return (
    <section className="section">
      <div className="container practice-shell">
        <PracticeNav />
        <div className="practice-main">
          <p className="eyebrow">Tu consulta</p>
          <h1>Cobros, con todo claro</h1>
          <p className="lead">
            Los pagos externos que has registrado, con su fecha efectiva y un
            historial que conserva cada cambio.
          </p>
          <form method="get" className={styles.filters}>
            <label>
              Periodo
              <input
                type="month"
                name="mes"
                defaultValue={range.month}
                min="2000-01"
                max="2099-12"
                required
              />
            </label>
            <label>
              Moneda
              <select name="moneda" defaultValue={currency || ""}>
                <option value="">Todas, por separado</option>
                <option value="usd">USD · dólares</option>
                <option value="eur">EUR · euros</option>
                <option value="ves">VES · bolívares</option>
              </select>
            </label>
            <button className="button human" type="submit">
              Ver cobros
            </button>
          </form>
          <p className="hint">
            Periodo según {zone}. Los registros anulados conservan su historial
            y dejan de contar en estos importes.
          </p>
          <section
            className={styles.summary}
            aria-label="Importes registrados por moneda"
          >
            {totals.length ? (
              totals.map((total) => (
                <div className={styles.total} key={total.currency}>
                  <span>
                    {total.currency.toUpperCase()} · registrado en el periodo
                  </span>
                  <strong>
                    {moneyLabel(total.amountCents, total.currency)}
                  </strong>
                </div>
              ))
            ) : (
              <p className="workspace-empty">
                No hay importes registrados en este periodo.
              </p>
            )}
          </section>
          <div className={styles.actions}>
            <Link className="button secondary" href="/pro/pacientes">
              Registrar un pago en una ficha
            </Link>
            {receipts.rows.length ? (
              <a
                className="button ghost"
                href={`/pro/cobros/exportar?${parameters}&pagina=${receipts.page}`}
              >
                Descargar esta página CSV
              </a>
            ) : null}
          </div>
          <p className="hint">
            El CSV contiene hasta 25 registros de la página y filtros actuales.
            Es un resumen operativo de lo que has guardado.
          </p>
          <div className={styles.list}>
            {receipts.rows.map((receipt) => (
              <article className={styles.row} key={receipt.id}>
                <div>
                  <span className="workspace-tag">
                    {receiptStatusLabels[receipt.status]}
                  </span>
                  <h2>{moneyLabel(receipt.amountCents, receipt.currency)}</h2>
                  <p>
                    {paymentMethodLabels[receipt.method] || "Pago externo"} ·{" "}
                    <time dateTime={receipt.receivedAt}>
                      {receiptDateLabel(receipt.receivedAt, zone)}
                    </time>
                  </p>
                  <p className="hint">
                    Referencia:{" "}
                    {receipt.reference.startsWith(`${pro.id}:`)
                      ? receipt.reference.slice(pro.id.length + 1)
                      : receipt.reference}
                  </p>
                </div>
                <div className={styles.actions}>
                  <Link
                    className="button secondary"
                    href={`/pro/pacientes/${receipt.patientId}/cobros/${receipt.id}`}
                    prefetch={false}
                  >
                    Ver registro
                  </Link>
                  <Link
                    href={`/pro/pacientes/${receipt.patientId}#cobros`}
                    prefetch={false}
                  >
                    Abrir ficha
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <PracticePagination
            page={receipts.page}
            pages={receipts.pages}
            total={receipts.total}
            href={href}
          />
          <p className="hint">
            Nido no ha procesado ni verificado estos movimientos. Los cobros
            integrados y los ciclos de acuerdos se consultan en su espacio
            correspondiente.
          </p>
        </div>
      </div>
    </section>
  );
}
