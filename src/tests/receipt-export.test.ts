import { describe, expect, it } from "vitest";
import {
  receiptCsv,
  receiptCurrency,
  receiptPeriod,
} from "@/lib/practice/receipt-export";

describe("periodos de cobros en la zona de la consulta", () => {
  it.each([
    [
      "2026-10",
      "America/Caracas",
      "2026-10-01T04:00:00.000Z",
      "2026-11-01T04:00:00.000Z",
    ],
    [
      "2026-10",
      "Europe/Madrid",
      "2026-09-30T22:00:00.000Z",
      "2026-10-31T23:00:00.000Z",
    ],
    [
      "2026-10",
      "Asia/Kathmandu",
      "2026-09-30T18:15:00.000Z",
      "2026-10-31T18:15:00.000Z",
    ],
    [
      "2020-11",
      "America/Havana",
      "2020-11-01T04:00:00.000Z",
      "2020-12-01T05:00:00.000Z",
    ],
    [
      "2017-10",
      "America/Asuncion",
      "2017-10-01T04:00:00.000Z",
      "2017-11-01T03:00:00.000Z",
    ],
    ["2026-12", "UTC", "2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
  ])("incluye todo el mes %s en %s, también con cambios de horario", (month, zone, startsAt, endsAt) => {
    expect(receiptPeriod(month, zone)).toEqual({ month, startsAt, endsAt });
  });
  it.each([
    undefined,
    null,
    "2026-13",
    "2026-1",
    ["2026-10"],
    "texto",
  ])("usa el mes local actual cuando el filtro es inválido: %j", (value) => {
    expect(
      receiptPeriod(value, "America/Caracas", Date.parse("2026-10-01T02:00Z"))
        .month,
    ).toBe("2026-09");
  });
  it("valida las monedas sin interpretar entradas arbitrarias", () => {
    for (const currency of ["usd", "eur", "ves"])
      expect(receiptCurrency(currency)).toBe(currency);
    for (const value of ["USD", "gbp", ["usd"], null, undefined])
      expect(receiptCurrency(value)).toBeUndefined();
  });
});

const receipt = {
  id: "recibo-ficticio",
  professionalId: "profesional-ficticio",
  amountCents: 1234,
  currency: "usd",
  method: "cash",
  reference: "profesional-ficticio:REF-01",
  receivedAt: "2026-10-01T12:00:00Z",
  revision: 2,
  status: "corrected",
  recordedAt: "2026-10-02T12:00:00Z",
};
describe("CSV de registros acotados", () => {
  it("exporta el snapshot efectivo, quita el prefijo interno y conserva decimales", () => {
    const csv = receiptCsv([receipt]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"12.34","USD","Efectivo","REF-01","Corregido","2"');
    expect(csv).not.toContain(receipt.professionalId);
    expect(csv.split("\r\n")).toHaveLength(3);
  });
  it.each([
    "=SUM(1,2)",
    "+1",
    "-1",
    "@cmd",
    "  =1",
    "\ttexto",
    "\ntexto",
  ])("neutraliza fórmulas en referencias: %j", (reference) => {
    expect(
      receiptCsv([
        { ...receipt, reference: `${receipt.professionalId}:${reference}` },
      ]),
    ).toContain(`"'${reference}"`);
  });
  it("escapa comillas y comas, conserva un importe anulado de cero y no filtra campos adicionales", () => {
    const csv = receiptCsv([
      {
        ...receipt,
        reference: 'Referencia "propia", literal',
        amountCents: 0,
        status: "voided",
        recordedAt: null,
        ...{ patientName: "No exportar", reason: "No exportar" },
      },
    ]);
    expect(csv).toContain('"Referencia ""propia"", literal"');
    expect(csv).toContain('"0.00"');
    expect(csv).not.toContain("No exportar");
  });
});
