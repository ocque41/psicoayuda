/**
 * Oferta del software profesional. Los acuerdos de atención con pacientes
 * tienen sus propios importes y no dependen de esta suscripción.
 *
 * El mismo importe nominal en las tres monedas: el profesional elige la suya y
 * Stripe cobra exactamente ese importe (sin conversión). `policyVersion` viaja
 * en el formulario y en los metadatos de Stripe para no reutilizar nunca un
 * pago preparado con condiciones anteriores.
 */
export const MEMBERSHIP_CURRENCIES = ["usd", "eur", "gbp"] as const;
export type MembershipCurrency = (typeof MEMBERSHIP_CURRENCIES)[number];
export const MEMBERSHIP_INTERVALS = ["month", "year"] as const;
export type MembershipInterval = (typeof MEMBERSHIP_INTERVALS)[number];

export const MEMBERSHIP_POLICY_VERSION = "subscription-2026-11-v1";

export const MEMBERSHIP_PRICES: Record<
  MembershipInterval,
  Record<MembershipCurrency, number>
> = {
  month: { usd: 1499, eur: 1499, gbp: 1499 },
  year: { usd: 9999, eur: 9999, gbp: 9999 },
};

export const CURRENCY_SYMBOLS: Record<MembershipCurrency, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
};

export const INTERVAL_LABELS: Record<MembershipInterval, string> = {
  month: "Mensual",
  year: "Anual",
};

export function isMembershipCurrency(
  value: unknown,
): value is MembershipCurrency {
  return MEMBERSHIP_CURRENCIES.includes(value as MembershipCurrency);
}
export function isMembershipInterval(
  value: unknown,
): value is MembershipInterval {
  return MEMBERSHIP_INTERVALS.includes(value as MembershipInterval);
}

/** "14,99 €" / "14,99 $" / "14,99 £", en formato español. */
export function formatMembershipPrice(
  interval: MembershipInterval,
  currency: MembershipCurrency,
) {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).format(MEMBERSHIP_PRICES[interval][currency] / 100);
}

/** Ahorro del plan anual frente a doce meses, en porcentaje entero. */
export function yearlySavingsPercent(currency: MembershipCurrency) {
  const twelve = MEMBERSHIP_PRICES.month[currency] * 12;
  return Math.round((1 - MEMBERSHIP_PRICES.year[currency] / twelve) * 100);
}

const EURO_COUNTRIES = new Set([
  "España",
  "Alemania",
  "Francia",
  "Italia",
  "Portugal",
  "Países Bajos",
  "Bélgica",
  "Irlanda",
  "Austria",
  "Finlandia",
  "Grecia",
  "Luxemburgo",
  "Malta",
  "Chipre",
  "Eslovaquia",
  "Eslovenia",
  "Estonia",
  "Letonia",
  "Lituania",
  "Croacia",
]);
/** Moneda sugerida por país; el profesional siempre puede cambiarla. */
export function suggestedMembershipCurrency(
  country: string | null | undefined,
): MembershipCurrency {
  if (!country) return "usd";
  if (country === "Reino Unido") return "gbp";
  return EURO_COUNTRIES.has(country) ? "eur" : "usd";
}

/** Estados de Stripe que conservan el acceso (past_due = periodo de gracia). */
export const MEMBERSHIP_ACCESS_STATUSES = [
  "active",
  "trialing",
  "past_due",
] as const;

/**
 * Prueba gratuita para los profesionales que ya estaban en Nido: empieza cuando
 * el equipo los pasa al plan de suscripción y dura 90 días. Las altas nuevas
 * (aceptadas en admisión) no tienen prueba.
 */
export const EXISTING_PROFESSIONAL_TRIAL_DAYS = 90;
const DAY_MS = 86_400_000;

export function existingProfessionalTrialEnd(from = Date.now()) {
  return new Date(
    from + EXISTING_PROFESSIONAL_TRIAL_DAYS * DAY_MS,
  ).toISOString();
}

/** true si la fecha de fin de prueba sigue en el futuro. */
export function trialActive(
  trialEndsAt: string | null | undefined,
  now = Date.now(),
) {
  if (!trialEndsAt) return false;
  const end = Date.parse(trialEndsAt);
  return Number.isFinite(end) && end > now;
}

/** Días completos restantes de prueba (mínimo 1 mientras siga activa). */
export function trialDaysLeft(
  trialEndsAt: string | null | undefined,
  now = Date.now(),
) {
  if (!trialActive(trialEndsAt, now)) return 0;
  return Math.max(
    1,
    Math.ceil((Date.parse(trialEndsAt as string) - now) / DAY_MS),
  );
}

/**
 * Stripe exige que `trial_end` en Checkout quede al menos 48 h en el futuro.
 * Con margen: si quedan menos de 50 h, se cobra al confirmar.
 */
export function stripeTrialEnd(
  trialEndsAt: string | null | undefined,
  now = Date.now(),
) {
  if (!trialEndsAt) return null;
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end) || end - now < 50 * 3_600_000) return null;
  return Math.floor(end / 1000);
}

export function formatTrialDate(trialEndsAt: string) {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(trialEndsAt));
}

/**
 * Valores históricos que solo usa la web pública de marketing (que no se
 * modifica en esta versión). La app ya no ofrece prueba ni plan de 10 USD.
 */
export const MEMBERSHIP_PLAN = {
  priceCents: 1000,
  currency: "usd",
  interval: "month",
  priceLabel: "10 USD",
  policyVersion: "monthly-usd-10-v1",
} as const;
export const TRIAL_DAYS = 90;
