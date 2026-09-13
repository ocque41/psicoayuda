import "server-only";

import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/payments/config";

// Cliente de Stripe para el runtime de Cloudflare Workers: el SDK usa `fetch`
// (createFetchHttpClient) y SubtleCrypto para verificar firmas (ver webhook.ts).
// El cliente se cachea por proceso; se recrea si cambia la clave (tests).
let cached: { key: string; client: Stripe } | null = null;

export function getStripe(): Stripe | null {
  const key = getStripeSecretKey();
  if (!key) return null;
  if (cached?.key === key) return cached.client;

  const client = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    // Sin apiVersion explícita: usamos la versión fijada por la cuenta para que
    // el SDK y el panel de Stripe no divergan en tipos/estructuras.
    maxNetworkRetries: 2,
    appInfo: { name: "Nido", url: "https://saludmental-venezuela.com" },
  });
  cached = { key, client };
  return client;
}

/** Cliente obligatorio (lanza si no hay clave). Úsalo solo tras comprobar config. */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe no está configurado");
  return stripe;
}
