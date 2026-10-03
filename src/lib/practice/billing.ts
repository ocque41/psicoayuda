import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import {
  professionalMemberships,
  professionals,
  stripeEvents,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { getStripe } from "@/lib/payments/stripe";
import { SITE_URL } from "@/lib/site";
export const TRIAL_DAYS = 90;
export const MEMBERSHIP_PRICES = { month: 1900, year: 9900 } as const;
export function membershipBillingReady() {
  return (
    process.env.NIDO_MEMBERSHIP_BILLING_ENABLED === "true" &&
    Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  );
}
export async function startMembershipTrial(professionalId: string) {
  const start = new Date();
  const end = new Date(start.getTime() + TRIAL_DAYS * 86400000);
  await db
    .insert(professionalMemberships)
    .values({
      professionalId,
      trialStartedAt: start.toISOString(),
      trialEndsAt: end.toISOString(),
      status: "trialing",
      updatedAt: nowIso(),
    })
    .onConflictDoNothing();
}
export async function membershipCheckout(
  pro: { id: string; email: string },
  plan: "month" | "year",
) {
  const stripe = getStripe();
  if (!stripe || !membershipBillingReady())
    throw new Error("Los cobros del software todavía no están habilitados.");
  const member = await db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, pro.id),
  });
  if (!member) throw new Error("Activa primero tu prueba gratuita.");
  const remaining = Date.parse(member.trialEndsAt) - Date.now();
  if (remaining > 0 && remaining <= 48 * 3600000)
    throw new Error(
      "Tu prueba sigue activa. Puedes contratar el plan al finalizar para conservar todos tus días gratuitos.",
    );
  if (member.stripeSubscriptionId) {
    const existing = await stripe.subscriptions.retrieve(
      member.stripeSubscriptionId,
    );
    if (
      existing.status !== "canceled" &&
      existing.status !== "incomplete_expired"
    )
      throw new Error(
        "Ya tienes una suscripción. Gestiona el plan desde el portal de facturación.",
      );
  }
  if (member.checkoutId?.startsWith("cs_")) {
    const existing = await stripe.checkout.sessions.retrieve(member.checkoutId);
    if (existing.status === "open" && existing.url) return existing.url;
  }
  const recovering = member.checkoutId?.startsWith("creating:");
  if (recovering && member.plan !== plan)
    throw new Error(
      "Hay un pago en preparación para otra frecuencia. Contacta a soporte si quieres cambiarla.",
    );
  const attempt = recovering
    ? member.checkoutId || `creating:${newId("billing")}`
    : `creating:${newId("billing")}`;
  const claimed = await db
    .update(professionalMemberships)
    .set({ checkoutId: attempt, plan })
    .where(
      and(
        eq(professionalMemberships.professionalId, pro.id),
        sql`EXISTS (SELECT 1 FROM ${professionals} WHERE ${professionals.id} = ${pro.id} AND ${professionals.status} = 'approved')`,
        member.checkoutId
          ? eq(professionalMemberships.checkoutId, member.checkoutId)
          : isNull(professionalMemberships.checkoutId),
      ),
    )
    .returning({ id: professionalMemberships.professionalId });
  if (!claimed.length)
    throw new Error("Ya hay una operación de pago en curso.");
  const metadata = { nido_membership_pro: pro.id, nido_plan: plan };
  // Una clave estable permite recuperar el mismo cliente si falla el guardado local.
  const customer =
    member.stripeCustomerId ||
    (
      await stripe.customers.create(
        { email: pro.email, metadata: { nido_membership_pro: pro.id } },
        { idempotencyKey: `nido-membership-customer-${pro.id}` },
      )
    ).id;
  await db
    .update(professionalMemberships)
    .set({ stripeCustomerId: customer })
    .where(eq(professionalMemberships.professionalId, pro.id));
  const trialEnd = Math.floor(Date.parse(member.trialEndsAt) / 1000);
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      locale: "es",
      customer,
      client_reference_id: `nido-membership:${pro.id}`,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: MEMBERSHIP_PRICES[plan],
            recurring: { interval: plan },
            product_data: {
              name:
                plan === "month"
                  ? "Nido · software profesional mensual"
                  : "Nido · software profesional anual",
            },
          },
        },
      ],
      subscription_data: {
        metadata,
        ...(trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600
          ? { trial_end: trialEnd }
          : {}),
      },
      success_url: `${SITE_URL}/pro/plan?resultado=confirmando`,
      cancel_url: `${SITE_URL}/pro/plan`,
    },
    { idempotencyKey: attempt },
  );
  if (!checkout.url)
    throw new Error("No pudimos abrir el pago. Contacta a soporte.");
  await db
    .update(professionalMemberships)
    .set({ checkoutId: checkout.id, plan, updatedAt: nowIso() })
    .where(
      and(
        eq(professionalMemberships.professionalId, pro.id),
        eq(professionalMemberships.checkoutId, attempt),
      ),
    );
  return checkout.url;
}
/** Webhook aislado del pago por terapia. Recupera estado actual para tolerar eventos desordenados. */
export async function handleMembershipEvent(
  event: Stripe.Event,
): Promise<boolean> {
  let subscriptionId: string | null = null;
  let proId: string | undefined;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    proId = session.metadata?.nido_membership_pro;
    if (!proId) return false;
    subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;
  } else if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    proId = subscription.metadata?.nido_membership_pro;
    if (!proId) return false;
    subscriptionId = subscription.id;
  } else return false;
  if (!subscriptionId || !proId) return true;
  const member = await db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, proId),
  });
  if (!member) return true;
  if (
    member.stripeSubscriptionId &&
    member.stripeSubscriptionId !== subscriptionId
  ) {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe no configurado");
    const prior = await stripe.subscriptions.retrieve(
      member.stripeSubscriptionId,
    );
    if (prior.status !== "canceled" && prior.status !== "incomplete_expired")
      return true;
  }
  if (
    await db.query.stripeEvents.findFirst({
      where: eq(stripeEvents.id, event.id),
    })
  )
    return true;
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe no configurado");
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof current.customer === "string"
      ? current.customer
      : current.customer.id;
  if (
    customerId !== member.stripeCustomerId ||
    current.metadata.nido_membership_pro !== proId
  )
    return true;
  await db.batch([
    db
      .update(professionalMemberships)
      .set({
        stripeSubscriptionId: current.id,
        status: current.status,
        plan: current.metadata.nido_plan || null,
        updatedAt: nowIso(),
      })
      .where(eq(professionalMemberships.professionalId, proId)),
    db
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type, processedAt: nowIso() })
      .onConflictDoNothing(),
  ]);
  return true;
}
