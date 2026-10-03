import { localToUtc } from "@/lib/practice/domain";

export const receiptStatusLabels: Record<string, string> = {
  recorded: "Registrado",
  corrected: "Corregido",
  voided: "Anulado",
};

export function receiptReceivedAt(
  value: string,
  timeZone: string,
  now: number,
): { ok: true; iso: string } | { ok: false; message: string } {
  const iso = localToUtc(value, timeZone);
  if (!iso)
    return {
      ok: false,
      message:
        "Indica cuándo recibiste el pago en la zona de tu consulta. Revisa la fecha: algunas horas se repiten o no existen por el cambio de horario.",
    };
  if (Date.parse(iso) > now)
    return {
      ok: false,
      message: "La fecha del pago recibido no puede estar en el futuro.",
    };
  return { ok: true, iso };
}

export function receiptLocalInput(now: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function receiptDateLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
