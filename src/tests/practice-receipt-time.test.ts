import { describe, expect, it } from "vitest";
import { receiptLocalInput, receiptReceivedAt } from "@/lib/practice/receipts";

describe("fecha efectiva de un pago externo", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");

  it("conserva el día del pago, aunque se registre en otro mes", () => {
    expect(
      receiptReceivedAt("2026-09-30T23:30", "America/Caracas", now),
    ).toEqual({ ok: true, iso: "2026-10-01T03:30:00.000Z" });
  });

  it("el mismo pago se convierte al mismo instante entre países", () => {
    expect(
      receiptReceivedAt("2026-10-02T10:00", "America/Caracas", now),
    ).toEqual(receiptReceivedAt("2026-10-02T16:00", "Europe/Madrid", now));
  });

  it("rechaza fechas futuras, ausentes e imposibles", () => {
    for (const value of ["2026-10-03T12:01", "", "2026-02-30T10:00"])
      expect(receiptReceivedAt(value, "UTC", now).ok).toBe(false);
  });

  it("rechaza horas ambiguas o inexistentes por DST", () => {
    const later = Date.parse("2026-12-01T00:00:00Z");
    for (const value of ["2026-03-29T02:30", "2026-10-25T02:30"])
      expect(receiptReceivedAt(value, "Europe/Madrid", later).ok).toBe(false);
  });

  it.each([
    "America/Caracas",
    "Europe/Madrid",
    "Asia/Kathmandu",
    "UTC",
  ])("rellena el campo en la zona explícita de la consulta: %s", (zone) => {
    const input = receiptLocalInput(now, zone);
    expect(receiptReceivedAt(input, zone, now)).toEqual({
      ok: true,
      iso: new Date(now).toISOString(),
    });
  });

  it("no usa la fecha del servidor cuando falta la fecha enviada", () => {
    expect(receiptReceivedAt("", "America/Caracas", now).ok).toBe(false);
  });
});
