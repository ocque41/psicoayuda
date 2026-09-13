import "server-only";

// Configuración del módulo de pagos de Nido (Stripe Connect). Todo lo específico
// de cobros vive bajo src/lib/payments/* para mantenerlo aislado del resto de la
// app. Sin claves configuradas el módulo entero se oculta: la web funciona igual
// (patrón de Turnstile).

export const PACKAGE_CURRENCY = "eur" as const;

// La comisión de Nido es un importe FIJO por transacción (no un porcentaje), por
// decisión de producto: 5 € por paquete. Configurable por var de entorno para no
// requerir despliegue si cambia.
const DEFAULT_PLATFORM_FEE_CENTS = 500;

export function getPlatformFeeCents(): number {
  const raw = process.env.NIDO_PLATFORM_FEE_CENTS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_PLATFORM_FEE_CENTS;
}

// Límites de precio de un paquete (en céntimos): evita precios absurdos y que la
// comisión fija se coma el precio.
export const MIN_PACKAGE_PRICE_CENTS = 1000; // 10 €
export const MAX_PACKAGE_PRICE_CENTS = 100000; // 1000 €

export function getStripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

export function getStripeWebhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

/** ¿Está Stripe configurado en este entorno? (clave de API presente) */
export function paymentsConfigured(): boolean {
  return getStripeSecretKey() !== null;
}

/** ¿Se puede verificar la firma del webhook? (clave + secreto presentes) */
export function webhookConfigured(): boolean {
  return paymentsConfigured() && getStripeWebhookSecret() !== null;
}

// La cuenta de la plataforma es de EE. UU.; los destinatarios de Stripe Connect
// deben estar en un país soportado (Venezuela NO lo está, ni como comercio ni
// como destinatario). Mapa nombre en español (src/lib/constants.ts `countries`)
// → código ISO-3166 alfa-2 que espera Stripe.
export const STRIPE_COUNTRY_CODES: Readonly<Record<string, string>> = {
  Albania: "AL",
  Alemania: "DE",
  "Antigua y Barbuda": "AG",
  "Arabia Saudita": "SA",
  Argentina: "AR",
  Armenia: "AM",
  Australia: "AU",
  Austria: "AT",
  Bahamas: "BS",
  Baréin: "BH",
  Bélgica: "BE",
  Benín: "BJ",
  Bolivia: "BO",
  "Bosnia y Herzegovina": "BA",
  Botsuana: "BW",
  Brunéi: "BN",
  Bulgaria: "BG",
  Camboya: "KH",
  Canadá: "CA",
  Catar: "QA",
  Chile: "CL",
  Chipre: "CY",
  Colombia: "CO",
  "Corea del Sur": "KR",
  "Costa de Marfil": "CI",
  "Costa Rica": "CR",
  Dinamarca: "DK",
  Ecuador: "EC",
  Egipto: "EG",
  "El Salvador": "SV",
  "Emiratos Árabes Unidos": "AE",
  Eslovaquia: "SK",
  Eslovenia: "SI",
  España: "ES",
  "Estados Unidos": "US",
  Estonia: "EE",
  Etiopía: "ET",
  Filipinas: "PH",
  Finlandia: "FI",
  Francia: "FR",
  Gambia: "GM",
  Ghana: "GH",
  Grecia: "GR",
  Guatemala: "GT",
  Guyana: "GY",
  Hungría: "HU",
  Irlanda: "IE",
  Islandia: "IS",
  Israel: "IL",
  Italia: "IT",
  Jamaica: "JM",
  Japón: "JP",
  Jordania: "JO",
  Kenia: "KE",
  Kuwait: "KW",
  Letonia: "LV",
  Lituania: "LT",
  Luxemburgo: "LU",
  "Macedonia del Norte": "MK",
  Madagascar: "MG",
  Malta: "MT",
  Marruecos: "MA",
  Mauricio: "MU",
  México: "MX",
  Moldavia: "MD",
  Mónaco: "MC",
  Mongolia: "MN",
  Namibia: "NA",
  Nigeria: "NG",
  Noruega: "NO",
  "Nueva Zelanda": "NZ",
  Omán: "OM",
  "Países Bajos": "NL",
  Pakistán: "PK",
  Panamá: "PA",
  Paraguay: "PY",
  Perú: "PE",
  Polonia: "PL",
  Portugal: "PT",
  "Reino Unido": "GB",
  "República Checa": "CZ",
  "República Dominicana": "DO",
  Ruanda: "RW",
  Rumanía: "RO",
  "Santa Lucía": "LC",
  Senegal: "SN",
  Serbia: "RS",
  Singapur: "SG",
  Sudáfrica: "ZA",
  Suecia: "SE",
  Suiza: "CH",
  Tailandia: "TH",
  Tanzania: "TZ",
  "Trinidad y Tobago": "TT",
  Túnez: "TN",
  Turquía: "TR",
  Uruguay: "UY",
  Uzbekistán: "UZ",
  Vietnam: "VN",
};

export function isStripeSupportedCountry(country: string | null): boolean {
  return country !== null && country in STRIPE_COUNTRY_CODES;
}

export function stripeCountryCode(country: string | null): string | null {
  if (!country) return null;
  return STRIPE_COUNTRY_CODES[country] ?? null;
}
