import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PracticePagination } from "@/components/practice/pagination";
import {
  ReceiptHistory,
  receiptStatusLabels,
} from "@/components/practice/receipt-history";
import styles from "@/components/practice/receipts.module.css";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import { moneyLabel, paymentMethodLabels } from "@/lib/practice/domain";
import { pageNumber } from "@/lib/practice/queries";
import { readPatientReceiptHistory } from "@/lib/practice/receipt-queries";
import { receiptDateLabel } from "@/lib/practice/receipts";

export const metadata: Metadata = {
  title: "Historial de pago registrado",
  robots: { index: false, follow: false },
};
export default async function PatientReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { account } = await requirePatientAccount();
  const { receiptId } = await params,
    query = await searchParams;
  const history = await readPatientReceiptHistory(
    account.userId,
    receiptId,
    pageNumber(query.pagina),
  );
  if (!history) notFound();
  const receipt = history.current;
  return (
    <WorkspaceShell
      audience="patient"
      title="Tu pago, con su historia"
      description="El registro actual y los cambios que ha guardado tu profesional."
    >
      <Link href="/mi/pagos">← Todos tus pagos</Link>
      <section
        className="workspace-card"
        aria-label="Estado actual del registro"
      >
        <span className="workspace-tag">
          {receiptStatusLabels[receipt.status]}
        </span>
        <h2 className={styles.amount}>
          {moneyLabel(receipt.amountCents, receipt.currency)}
        </h2>
        <p>
          {paymentMethodLabels[receipt.method] || "Pago externo"} · recibido el{" "}
          <time dateTime={receipt.receivedAt}>
            {receiptDateLabel(receipt.receivedAt, account.timezone)}
          </time>
        </p>
        <p className="hint">
          Revisión {receipt.revision} · fechas en {account.timezone}.
        </p>
        <p className="hint">
          {receipt.status === "voided"
            ? "Tu profesional anuló este registro. El historial conserva los datos anteriores."
            : "Confirmación manual registrada por tu profesional."}{" "}
          Si necesitas aclararlo, escríbele desde Mensajes.
        </p>
        <Link className="button secondary" href="/mi/mensajes">
          Consultar con tu profesional
        </Link>
      </section>
      <ReceiptHistory history={history} timeZone={account.timezone} />
      <PracticePagination
        page={history.page}
        pages={history.pages}
        total={history.total}
        href={(page) =>
          `/mi/pagos/${receiptId}?pagina=${page}#receipt-history-title`
        }
      />
      <p className="hint">
        Nido no procesa estos métodos ni verifica la transacción en el
        proveedor. Este historial muestra los registros guardados por tu
        profesional.
      </p>
    </WorkspaceShell>
  );
}
