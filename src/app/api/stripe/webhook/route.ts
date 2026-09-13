import Stripe from "stripe";
import {
  getStripeWebhookSecret,
  webhookConfigured,
} from "@/lib/payments/config";
import { getStripe } from "@/lib/payments/stripe";
import { handleStripeEvent } from "@/lib/payments/webhook";

// Webhook de Stripe para los pagos de Nido. Lee el cuerpo CRUDO (request.text())
// porque la firma `Stripe-Signature` se calcula sobre los bytes exactos; usa
// `constructEventAsync` con SubtleCrypto (runtime de Cloudflare Workers, sin
// Node crypto). Cualquier evento de la cuenta compartida sin metadatos `nido_*`
// se ignora dentro de handleStripeEvent.
export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret || !webhookConfigured()) {
    return new Response("Stripe no configurado", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Falta la firma de Stripe", { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    console.error("Stripe webhook: firma inválida", error);
    return new Response("Firma inválida", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (error) {
    // Devolvemos 500 para que Stripe reintente: la marca de idempotencia se
    // revierte dentro del handler si el proceso falla.
    console.error("Stripe webhook: fallo al procesar", {
      eventId: event.id,
      type: event.type,
      error,
    });
    return new Response("Error al procesar el evento", { status: 500 });
  }

  return Response.json({ received: true });
}
