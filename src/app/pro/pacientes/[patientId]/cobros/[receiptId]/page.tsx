import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PracticeNav } from "@/components/practice/nav";
import { PracticePagination } from "@/components/practice/pagination";
import { ReceiptChangeForm } from "@/components/practice/receipt-change-form";
import {
  ReceiptHistory,
  receiptStatusLabels,
} from "@/components/practice/receipt-history";
import styles from "@/components/practice/receipts.module.css";
import { db } from "@/db";
import { practiceSettings } from "@/db/schema";
import {
  ownedPatient,
  requirePracticeProfessional,
} from "@/lib/practice/access";
import { moneyLabel, paymentMethodLabels } from "@/lib/practice/domain";
import { pageNumber } from "@/lib/practice/queries";
import { readReceiptHistory } from "@/lib/practice/receipt-queries";
import { receiptDateLabel } from "@/lib/practice/receipts";

export const metadata: Metadata = {
  title: "Registro de pago externo",
  robots: { index: false, follow: false },
};
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string; receiptId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const pro = await requirePracticeProfessional();
  const { patientId, receiptId } = await params;
  const patient = await ownedPatient(patientId, pro.id);
  if (!patient || patient.program === "earthquake") notFound();
  const query = await searchParams;
  const [history, settings] = await Promise.all([
    readReceiptHistory(pro.id, patient.id, receiptId, pageNumber(query.pagina)),
    db.query.practiceSettings.findFirst({
      where: eq(practiceSettings.professionalId, pro.id),
    }),
  ]);
  if (!history) notFound();
  const zone = settings?.timeZone || "America/Caracas";
  const receipt = history.current;
  return (
    <section className="section">
      <div className="container practice-shell">
        <PracticeNav />
        <div className="practice-main">
          <Link href={`/pro/pacientes/${patient.id}#cobros`}>
            ← Cobros de {patient.name}
          </Link>
          <p className="eyebrow">Registro de pago externo</p>
          <h1>El cobro, con su historia</h1>
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
              {paymentMethodLabels[receipt.method] || "Pago externo"} · recibido
              el{" "}
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
            <p className="hint">
              Revisión {receipt.revision} · zona de tu consulta: {zone}.{" "}
              {receipt.status === "voided"
                ? "Este registro no cuenta en los cobros registrados."
                : "Estos datos se utilizan en el resumen de cobros."}
            </p>
            <p className="hint">
              Registro manual del profesional. Nido no ha procesado ni
              verificado el movimiento.
            </p>
          </section>
          <ReceiptChangeForm receipt={receipt} timeZone={zone} />
          <ReceiptHistory history={history} timeZone={zone} />
          <PracticePagination
            page={history.page}
            pages={history.pages}
            total={history.total}
            href={(page) =>
              `/pro/pacientes/${patient.id}/cobros/${receipt.id}?pagina=${page}#receipt-history-title`
            }
          />
        </div>
      </div>
    </section>
  );
}
