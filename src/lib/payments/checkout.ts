import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, payments } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { getPlatformFeeCents, PACKAGE_CURRENCY } from "@/lib/payments/config";
import { getPayablePackage } from "@/lib/payments/packages";
import { getStripe } from "@/lib/payments/stripe";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * Crea una sesión de Checkout de Stripe (hospedado, sin tocar tarjetas) para un
 * paquete concreto. El dinero entra en la cuenta de la plataforma y Stripe
 * transfiere el resto al profesional vía Connect, reteniendo la comisión fija de
 * Nido (`application_fee_amount`). Registra el pago en D1 antes de ir a Stripe
 * para poder reconciliar por webhook.
 *
 * `conversationId` es opcional: cuando el link se comparte dentro de un chat, el
 * pago queda ligado a esa conversación (trazabilidad), validando que sea del
 * mismo profesional.
 */
export async function createPackageCheckout(input: {
  packageId: string;
  conversationId?: string | null;
  origin: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, message: "Los cobros aún no están configurados." };
  }

  const payable = await getPayablePackage(input.packageId);
  if (!payable) {
    return {
      ok: false,
      message: "Este paquete no está disponible en este momento.",
    };
  }
  const { pkg, professional } = payable;
  if (!professional.stripeAccountId) {
    return {
      ok: false,
      message: "El profesional aún no tiene sus cobros activos.",
    };
  }

  const feeCents = getPlatformFeeCents();
  if (feeCents >= pkg.priceCents) {
    return {
      ok: false,
      message:
        "Este paquete no tiene un precio válido para cobrar. Escríbenos para revisarlo.",
    };
  }

  let conversationId: string | null = null;
  if (input.conversationId) {
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, input.conversationId),
        eq(conversations.professionalId, professional.id),
      ),
      columns: { id: true },
    });
    conversationId = conversation?.id ?? null;
  }

  const paymentId = newId("pay");
  const timestamp = nowIso();
  try {
    await db.insert(payments).values({
      id: paymentId,
      professionalId: professional.id,
      professionalName: professional.name,
      packageId: pkg.id,
      packageTitle: pkg.title,
      conversationId,
      amountCents: pkg.priceCents,
      applicationFeeCents: feeCents,
      currency: PACKAGE_CURRENCY,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  } catch (error) {
    // Un fallo aquí no debe tumbar la página con un 500: devolvemos un mensaje
    // humano y queda en observabilidad.
    console.error("createPackageCheckout: no se pudo registrar el pago", {
      packageId: pkg.id,
      error,
    });
    return {
      ok: false,
      message:
        "No pudimos iniciar el pago. Inténtalo de nuevo en unos minutos; si sigue fallando, escríbenos.",
    };
  }

  // Los metadatos `nido_*` distinguen nuestros eventos del resto de proyectos que
  // comparten la cuenta de Stripe: el webhook ignora todo lo que no los traiga.
  const metadata: Record<string, string> = {
    nido_payment_id: paymentId,
    nido_package_id: pkg.id,
    nido_professional_id: professional.id,
  };
  if (conversationId) metadata.nido_conversation_id = conversationId;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      client_reference_id: paymentId,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PACKAGE_CURRENCY,
            unit_amount: pkg.priceCents,
            product_data: {
              name: `${pkg.title} · ${professional.name}`.slice(0, 120),
              description: pkg.description?.slice(0, 250) ?? undefined,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: professional.stripeAccountId },
        description: `Nido · ${pkg.title} · ${professional.name}`.slice(0, 250),
        metadata,
      },
      success_url: `${input.origin}/pagar/gracias?sesion={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origin}/pagar/${pkg.id}?cancelado=1`,
    });

    if (!session.url) throw new Error("Stripe no devolvió la URL del Checkout");

    await db
      .update(payments)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: nowIso() })
      .where(eq(payments.id, paymentId));

    return { ok: true, url: session.url };
  } catch (error) {
    console.error("createPackageCheckout failed", {
      packageId: pkg.id,
      error,
    });
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: nowIso() })
      .where(eq(payments.id, paymentId));
    return {
      ok: false,
      message:
        "No pudimos abrir el pago. Inténtalo de nuevo en unos minutos; si sigue fallando, escríbenos.",
    };
  }
}
