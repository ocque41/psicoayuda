import { z } from "zod";

export { patientStateLabels, patientStates } from "./patient-states";
export const appointmentStates = [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
] as const;
export const appointmentStateLabels: Record<string, string> = {
  scheduled: "Programada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
export const paymentMethods = [
  "cash",
  "pago_movil",
  "transfer",
  "zelle",
  "paypal",
  "bizum",
  "cashea",
  "external_card",
] as const;
export const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  pago_movil: "Pago Móvil",
  transfer: "Transferencia",
  zelle: "Zelle",
  paypal: "PayPal",
  bizum: "Bizum",
  cashea: "Cashea",
  external_card: "Tarjeta fuera de Nido",
};
export const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("es", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Elige una zona horaria válida.");
export const settingsSchema = z
  .object({
    timeZone: timeZoneSchema,
    workStart: z.coerce.number().int().min(0).max(23),
    workEnd: z.coerce.number().int().min(1).max(24),
  })
  .refine(
    (v) => v.workStart < v.workEnd,
    "La hora de fin debe ser posterior a la de inicio.",
  );
export const patientSchema = z.object({
  name: z.string().trim().min(1, "Indica cómo llamar a esta persona.").max(80),
  email: z
    .union([z.literal(""), z.email("Revisa el correo.")])
    .transform((v) => v || null),
  country: z.string().trim().min(2).max(80),
  timeZone: timeZoneSchema,
  program: z.enum(["general", "earthquake"]),
  consent: z.literal(
    "on",
    "Confirma que tienes autorización para guardar estos datos de contacto.",
  ),
});
export const serviceSchema = z.object({
  title: z.string().trim().min(3).max(80),
  durationMinutes: z.coerce.number().int().min(15).max(180),
  sessionsCount: z.coerce.number().int().min(1).max(50),
  price: z
    .string()
    .regex(
      /^\d{1,6}([.,]\d{1,2})?$/,
      "Indica un importe con hasta dos decimales.",
    ),
  currency: z.enum(["usd", "eur", "ves"]),
  interval: z.enum(["one_time", "month"]),
  validityDays: z.coerce.number().int().min(1).max(365),
  cancellationHours: z.coerce.number().int().min(0).max(168),
});
export function moneyCents(value: string): number {
  return Math.round(Number(value.replace(",", ".")) * 100);
}
export function moneyLabel(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
export function dateLabel(iso: string, timeZone = "America/Caracas"): string {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
/** Convierte hora de pared IANA a UTC; rechaza horas inexistentes/ambiguas por DST. */
export function localToUtc(value: string, timeZone: string): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
    !timeZoneSchema.safeParse(timeZone).success
  )
    return null;
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) return null;
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const wall = (ms: number) => fmt.format(new Date(ms)).replace(" ", "T");
  // Obtiene los offsets reales a ambos lados del instante. Evita 105
  // formateos por conversión y conserva las dos posibilidades de un cambio DST.
  const offsets = new Set<number>();
  const partsFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (const delta of [-36, 0, 36]) {
    const sample = target + delta * 3600000;
    const parts = Object.fromEntries(
      partsFormat.formatToParts(sample).map((p) => [p.type, p.value]),
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offsets.add(local - sample);
  }
  const matches = [...offsets]
    .map((offset) => target - offset)
    .filter((candidate) => wall(candidate) === value);
  return matches.length === 1 ? new Date(matches[0]).toISOString() : null;
}
export function insideWorkHours(
  now: number,
  timeZone: string,
  start: number,
  end: number,
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  return hour >= start && hour < end;
}
