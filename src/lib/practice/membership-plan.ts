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
