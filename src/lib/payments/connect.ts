import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { getStripe } from "@/lib/payments/stripe";

export type ConnectStatus = "none" | "incomplete" | "restricted" | "ready";

/**
 * Refresca el estado de la cuenta Connect del profesional contra Stripe y lo
 * persiste en D1. Lo llama el panel al volver del onboarding (?cobros=volviendo)
 * y es idempotente. Sin cuenta o sin Stripe no hace nada.
 */
export async function refreshStripeAccountStatus(professional: {
  id: string;
  stripeAccountId: string | null;
}): Promise<void> {
  if (!professional.stripeAccountId) return;
  const stripe = getStripe();
  if (!stripe) return;

  try {
    const account = await stripe.accounts.retrieve(
      professional.stripeAccountId,
    );
    await db
      .update(professionals)
      .set({
        stripeChargesEnabled: Boolean(account.charges_enabled),
        stripePayoutsEnabled: Boolean(account.payouts_enabled),
        stripeDetailsSubmitted: Boolean(account.details_submitted),
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, professional.id));
  } catch (error) {
    console.error("refreshStripeAccountStatus failed", {
      professionalId: professional.id,
      error,
    });
  }
}

export function connectStatusOf(professional: {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
}): ConnectStatus {
  if (!professional.stripeAccountId) return "none";
  if (professional.stripeChargesEnabled && professional.stripePayoutsEnabled) {
    return "ready";
  }
  if (professional.stripeDetailsSubmitted) return "restricted";
  return "incomplete";
}
