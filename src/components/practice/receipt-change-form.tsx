"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  correctReceipt,
  voidReceipt,
} from "@/app/pro/pacientes/[patientId]/receipt-actions";
import { moneyLabel, paymentMethodLabels } from "@/lib/practice/domain";
import type { EffectiveReceipt } from "@/lib/practice/receipt-queries";
import type { ReceiptFormState } from "@/lib/practice/receipt-write";
import { receiptLocalInput } from "@/lib/practice/receipts";
import styles from "./receipts.module.css";

export function ReceiptChangeForm({
  receipt,
  timeZone,
}: {
  receipt: EffectiveReceipt;
  timeZone: string;
}) {
  const router = useRouter();
  const id = useId();
  const [kind, setKind] = useState<"corrected" | "voided">("corrected");
  const [amount, setAmount] = useState((receipt.amountCents / 100).toFixed(2));
  const [currency, setCurrency] = useState(receipt.currency);
  const [method, setMethod] = useState(receipt.method);
  const [reference, setReference] = useState(
    receipt.reference.startsWith(`${receipt.professionalId}:`)
      ? receipt.reference.slice(receipt.professionalId.length + 1)
      : receipt.reference,
  );
  const [receivedAt, setReceivedAt] = useState(
    receiptLocalInput(Date.parse(receipt.receivedAt), timeZone),
  );
  const [reason, setReason] = useState("");
  const submission = useRef<{
    fingerprint: string;
    id: string;
    revision: number;
  } | null>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const safeAction = useCallback(
    async (
      previous: ReceiptFormState,
      data: FormData,
    ): Promise<ReceiptFormState> => {
      const fingerprint = JSON.stringify([
        receipt.id,
        kind,
        ...[
          "amount",
          "currency",
          "method",
          "reference",
          "receivedAt",
          "receivedTimeZone",
          "reason",
        ].map((key) =>
          kind === "voided" && key !== "reason" ? null : data.get(key),
        ),
      ]);
      if (submission.current?.fingerprint !== fingerprint)
        submission.current = {
          fingerprint,
          id: crypto.randomUUID(),
          revision: receipt.revision,
        };
      data.set("submissionId", submission.current.id);
      data.set("revision", String(submission.current.revision));
      try {
        return await (kind === "corrected" ? correctReceipt : voidReceipt)(
          previous,
          data,
        );
      } catch (error) {
        const digest =
          error && typeof error === "object" && "digest" in error
            ? String(error.digest)
            : "";
        if (
          digest.startsWith("NEXT_REDIRECT") ||
          digest.startsWith("NEXT_NOT_FOUND") ||
          digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
        )
          throw error;
        return {
          ok: false,
          code: "unavailable",
          message:
            "No pudimos confirmar el guardado. Tu borrador sigue aquí. Actualiza el historial para comprobarlo; repetir exactamente este cambio evita duplicarlo.",
        };
      }
    },
    [kind, receipt.id, receipt.revision],
  );
  const [state, action, pending] = useActionState(safeAction, null);
  useEffect(() => {
    if (state?.ok) {
      setReason("");
      submission.current = null;
    } else if (state) notice.current?.focus();
  }, [state]);
  const previewAmount = /^\d{1,6}([.,]\d{1,2})?$/.test(amount)
    ? Math.round(Number(amount.replace(",", ".")) * 100)
    : null;
  return (
    <section
      className={`workspace-card ${styles.edit}`}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>Actualizar el registro</h2>
      <p className="hint">
        El movimiento de dinero se coordina con el paciente. Aquí conservamos el
        original y añadimos tu cambio al historial.
      </p>
      <form
        action={action}
        method="post"
        className="practice-form"
        aria-busy={pending}
      >
        <input type="hidden" name="patientId" value={receipt.patientId} />
        <input type="hidden" name="receiptId" value={receipt.id} />
        <input type="hidden" name="receivedTimeZone" value={timeZone} />
        <label htmlFor={`${id}-kind`}>Qué necesitas actualizar</label>
        <select
          id={`${id}-kind`}
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as "corrected" | "voided")
          }
          disabled={pending}
        >
          <option value="corrected">
            {receipt.status === "voided"
              ? "Restablecer con los datos correctos"
              : "Corregir los datos"}
          </option>
          <option value="voided">Anular este registro</option>
        </select>
        {kind === "corrected" ? (
          <div className={styles.fields}>
            <label>
              Importe
              <input
                name="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                readOnly={pending}
                required
              />
            </label>
            <label>
              Moneda
              <select
                name="currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                disabled={pending}
              >
                <option value="usd">USD · dólares</option>
                <option value="eur">EUR · euros</option>
                <option value="ves">VES · bolívares</option>
              </select>
            </label>
            <label className={styles.wide}>
              Fecha y hora en que recibiste el pago
              <input
                name="receivedAt"
                type="datetime-local"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
                readOnly={pending}
                required
                aria-describedby={`${id}-zone`}
              />
              <small id={`${id}-zone`} className="hint">
                Zona de tu consulta: {timeZone}. Esta fecha determina el periodo
                del resumen.
              </small>
            </label>
            <label>
              Método
              <select
                name="method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                disabled={pending}
              >
                {Object.entries(paymentMethodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Referencia propia
              <input
                name="reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                readOnly={pending}
                minLength={3}
                maxLength={80}
                required
              />
            </label>
          </div>
        ) : (
          <p className={styles.voidNotice}>
            El registro quedará anulado y dejará de contar en los cobros
            registrados. El original y las correcciones anteriores seguirán
            visibles.
          </p>
        )}
        <label htmlFor={`${id}-reason`}>Motivo del cambio</label>
        <textarea
          id={`${id}-reason`}
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          readOnly={pending}
          required
          minLength={3}
          maxLength={160}
          rows={3}
          aria-describedby={`${id}-reason-help`}
        />
        <small id={`${id}-reason-help`} className="hint">
          Explica el ajuste de forma breve, por ejemplo «Importe escrito
          incorrectamente». El paciente podrá verlo. Evita datos de tarjeta e
          información clínica.
        </small>
        <div className={styles.preview} aria-live="polite">
          <span>
            {kind === "voided"
              ? "Resultado del registro"
              : "Importe que contará en el resumen"}
          </span>
          <strong>
            {kind === "voided"
              ? "Anulado · 0"
              : previewAmount !== null
                ? moneyLabel(previewAmount, currency)
                : "Revisa el importe"}
          </strong>
        </div>
        <button className="button human" type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : kind === "voided"
              ? "Guardar anulación"
              : "Guardar corrección"}
        </button>
        {state ? (
          <p
            ref={notice}
            tabIndex={-1}
            role={state.ok ? "status" : "alert"}
            className={state.ok ? "hint" : "form-error"}
          >
            {state.message}
          </p>
        ) : null}
        {state && !state.ok ? (
          <button
            type="button"
            className="button ghost"
            disabled={pending}
            onClick={() => router.refresh()}
          >
            Actualizar registro y revisar borrador
          </button>
        ) : null}
      </form>
    </section>
  );
}
