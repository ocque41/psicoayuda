import { paymentMethodLabels } from "./domain";
import { receiptStatusLabels } from "./receipts";

/** Primer instante real del mes local, incluso si la medianoche se repite o no existe. */
function monthBoundary(month: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const target = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  const utc = Date.parse(`${month}-01T00:00:00Z`) / 1000;
  let lower = utc - 172800;
  let upper = utc + 172800;
  const localMonth = (seconds: number) => {
    const parts = formatter.formatToParts(new Date(seconds * 1000));
    return (
      Number(parts.find((part) => part.type === "year")?.value) * 12 +
      Number(parts.find((part) => part.type === "month")?.value)
    );
  };
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (localMonth(middle) >= target) upper = middle;
    else lower = middle;
  }
  return new Date(upper * 1000).toISOString();
}
export function receiptPeriod(
  value: unknown,
  timeZone: string,
  now = Date.now(),
) {
  const current = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(new Date(now));
  const month =
    typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)
      ? value
      : current;
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    month,
    startsAt: monthBoundary(month, timeZone),
    endsAt: monthBoundary(end.toISOString().slice(0, 7), timeZone),
  };
}
export function receiptCurrency(
  value: unknown,
): "usd" | "eur" | "ves" | undefined {
  return value === "usd" || value === "eur" || value === "ves"
    ? value
    : undefined;
}
/** Cada celda se escapa y neutraliza las fórmulas de hojas de cálculo. */
export function receiptCsv(
  rows: Array<{
    id: string;
    amountCents: number;
    currency: string;
    method: string;
    reference: string;
    receivedAt: string;
    revision: number;
    status: string;
    recordedAt: string | null;
    professionalId: string;
  }>,
) {
  const cell = (value: string | number | null) => {
    const text = String(value ?? "");
    const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const lines = [
    [
      "Registro",
      "Recibido_UTC",
      "Importe",
      "Moneda",
      "Metodo",
      "Referencia",
      "Estado",
      "Revision",
      "Registrado_UTC",
    ],
    ...rows.map((row) => [
      row.id,
      row.receivedAt,
      (row.amountCents / 100).toFixed(2),
      row.currency.toUpperCase(),
      paymentMethodLabels[row.method] || "Pago externo",
      row.reference.startsWith(`${row.professionalId}:`)
        ? row.reference.slice(row.professionalId.length + 1)
        : row.reference,
      receiptStatusLabels[row.status] || "Registrado",
      row.revision,
      row.recordedAt,
    ]),
  ];
  return `\uFEFF${lines.map((line) => line.map(cell).join(",")).join("\r\n")}\r\n`;
}
