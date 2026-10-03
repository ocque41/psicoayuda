import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import {
  careCycles,
  carePlans,
  practiceCredentials,
  practicePatients,
  professionals,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { isStripeSupportedCountry } from "@/lib/payments/config";
import { getStripe } from "@/lib/payments/stripe";
import { SITE_URL } from "@/lib/site";
export function careBillingConfigured() {
  return (
    process.env.NIDO_CARE_BILLING_ENABLED === "true" &&
    Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  );
}
export async function careCheckout(carePlanId: string) {
  const stripe = getStripe();
  if (!stripe || !careBillingConfigured())
    throw new Error("Los pagos de acompañamiento aún no están habilitados.");
  const plan = await db.query.carePlans.findFirst({
    where: eq(carePlans.id, carePlanId),
  });
  if (plan?.status !== "proposed")
    throw new Error("Este acuerdo ya no está disponible para un nuevo pago.");
  const [patient, pro] = await Promise.all([
    db.query.practicePatients.findFirst({
      where: eq(practicePatients.id, plan.patientId),
    }),
    db.query.professionals.findFirst({
      where: eq(professionals.id, plan.professionalId),
      columns: {
        id: true,
        status: true,
        nonClinicalHelper: true,
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        country: true,
      },
    }),
  ]);
  if (
    !patient ||
    patient.program === "earthquake" ||
    !pro ||
    pro.status !== "approved" ||
    pro.nonClinicalHelper ||
    !pro.stripeAccountId ||
    !pro.stripeChargesEnabled ||
    !pro.stripePayoutsEnabled ||
    !isStripeSupportedCountry(pro.country) ||
    plan.currency === "ves" ||
    plan.priceCents <= 0
  )
    throw new Error(
      "La cuenta del profesional no permite este cobro con tarjeta. Acuerda otra forma de pago con él.",
    );
  const scope = await db.query.practiceCredentials.findFirst({
    where: and(
      eq(practiceCredentials.professionalId, pro.id),
      eq(practiceCredentials.patientCountry, patient.country),
      gt(practiceCredentials.expiresAt, nowIso()),
    ),
    columns: { id: true },
  });
  if (!scope)
    throw new Error(
      "El equipo debe revisar la atención en este país antes de habilitar el cobro.",
    );
  // Una sola sesión de checkout por acuerdo; Stripe recupera el resultado tras una interrupción.
  if (plan.checkoutId && !plan.checkoutId.startsWith("creating:")) {
    const existing = await stripe.checkout.sessions.retrieve(plan.checkoutId);
    if (existing.status === "open" && existing.url) return existing.url;
    throw new Error(
      "Este enlace ya se usó o caducó. Pide al profesional un nuevo acuerdo.",
    );
  }
  const creating = plan.checkoutId || `creating:${plan.id}`;
  const claimed = await db
    .update(carePlans)
    .set({ checkoutId: creating })
    .where(
      and(
        eq(carePlans.id, plan.id),
        eq(carePlans.status, "proposed"),
        sql`NOT EXISTS(SELECT 1 FROM patient_conversation_links l JOIN patient_accounts a ON a.user_id=l.user_id JOIN practice_patients p ON p.conversation_id=l.conversation_id WHERE p.id=${plan.patientId} AND a.deletion_state='deleting')`,
        plan.checkoutId
          ? eq(carePlans.checkoutId, plan.checkoutId)
          : isNull(carePlans.checkoutId),
        sql`EXISTS (SELECT 1 FROM ${professionals} WHERE ${professionals.id} = ${pro.id} AND ${professionals.status} = 'approved')`,
      ),
    )
    .returning({ id: carePlans.id });
  if (!claimed.length)
    throw new Error("Este acuerdo cambió. Vuelve a revisarlo antes de pagar.");
  const metadata = { nido_care_plan: plan.id };
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: plan.interval === "month" ? "subscription" : "payment",
      locale: "es",
      metadata,
      customer_email: patient.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency,
            unit_amount: plan.priceCents,
            ...(plan.interval === "month"
              ? { recurring: { interval: "month" as const } }
              : {}),
            product_data: { name: "Acompañamiento profesional · Nido" },
          },
        },
      ],
      ...(plan.interval === "month"
        ? {
            subscription_data: {
              metadata,
              transfer_data: { destination: pro.stripeAccountId },
              application_fee_percent: 0,
            },
          }
        : {
            payment_intent_data: {
              metadata,
              transfer_data: { destination: pro.stripeAccountId },
            },
          }),
      success_url: `${SITE_URL}/acompanamiento/${plan.id}?resultado=confirmando`,
      cancel_url: `${SITE_URL}/acompanamiento/${plan.id}`,
    },
    { idempotencyKey: `nido-care-${plan.id}` },
  );
  if (!checkout.url) throw new Error("No pudimos abrir el pago.");
  await db
    .update(carePlans)
    .set({ checkoutId: checkout.id })
    .where(eq(carePlans.id, plan.id));
  return checkout.url;
}
export async function handleCareEvent(event: Stripe.Event): Promise<boolean> {
  const stripe = getStripe();
  if (["charge.refunded", "charge.dispute.created"].includes(event.type)) {
    if (!stripe) throw new Error("Stripe no configurado");
    const object = event.data.object as Stripe.Charge | Stripe.Dispute;
    const raw = object.payment_intent;
    const intentId = typeof raw === "string" ? raw : raw?.id;
    if (!intentId) return false;
    const [checkouts, invoices] = await Promise.all([
      stripe.checkout.sessions.list({ payment_intent: intentId, limit: 100 }),
      stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: intentId },
        limit: 100,
      }),
    ]);
    if (checkouts.has_more || invoices.has_more)
      throw new Error("Paginar los cobros antes de conciliar el reembolso.");
    const refs = [
      ...checkouts.data.map((s) => `stripe:${s.id}`),
      ...invoices.data.map(
        (p) =>
          `stripe:${typeof p.invoice === "string" ? p.invoice : p.invoice.id}`,
      ),
    ];
    if (!refs.length) return false;
    const cycles = await db
      .select()
      .from(careCycles)
      .where(inArray(careCycles.externalReference, refs));
    if (!cycles.length) return false;
    await db.batch([
      db
        .update(careCycles)
        .set({ status: "needs_review" })
        .where(
          inArray(
            careCycles.id,
            cycles.map((c) => c.id),
          ),
        ),
      db
        .update(carePlans)
        .set({ status: "needs_review" })
        .where(
          inArray(
            carePlans.id,
            cycles.map((c) => c.carePlanId),
          ),
        ),
    ]);
    // La continuidad clínica se conserva. Soporte debe conciliar el importe,
    // la reversión de transferencia y los créditos antes de volver a habilitarlos.
    return true;
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const id = session.metadata?.nido_care_plan;
    if (!id) return false;
    const plan = await db.query.carePlans.findFirst({
      where: eq(carePlans.id, id),
    });
    if (!plan) return true;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || null;
    if (subscriptionId)
      await db
        .update(carePlans)
        .set({
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
        })
        .where(eq(carePlans.id, id));
    else if (
      session.payment_status === "paid" &&
      !(await db.query.careCycles.findFirst({
        where: eq(careCycles.externalReference, `stripe:${session.id}`),
      }))
    )
      await db.batch([
        db
          .insert(careCycles)
          .values({
            id: newId("cycle"),
            carePlanId: id,
            externalReference: `stripe:${session.id}`,
            startsAt: nowIso(),
            endsAt: new Date(
              Date.now() + plan.validityDays * 86400000,
            ).toISOString(),
            sessionsCount: plan.sessionsCount,
            amountCents: session.amount_total || plan.priceCents,
            currency: plan.currency,
            createdAt: nowIso(),
          })
          .onConflictDoNothing(),
        db
          .update(carePlans)
          .set({ status: "active" })
          .where(eq(carePlans.id, id)),
      ]);
    return true;
  }
  if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    const invoice = event.data.object as Stripe.Invoice;
    const details = invoice.parent?.subscription_details;
    const raw = details?.subscription;
    const subId = typeof raw === "string" ? raw : raw?.id;
    if (!subId || !stripe) return false;
    // Los metadatos de la suscripción identifican Nido incluso si invoice llega antes que checkout.
    const subscription = await stripe.subscriptions.retrieve(subId);
    const id = subscription.metadata.nido_care_plan;
    if (!id) return false;
    const plan = await db.query.carePlans.findFirst({
      where: eq(carePlans.id, id),
    });
    if (!plan) return true;
    if (plan.stripeSubscriptionId && plan.stripeSubscriptionId !== subId)
      return true;
    if (event.type === "invoice.payment_failed") {
      await db
        .update(carePlans)
        .set({ status: subscription.status, stripeSubscriptionId: subId })
        .where(eq(carePlans.id, id));
      return true;
    }
    // Periodo del renglón recurrente, no el periodo global de la factura con posibles ajustes.
    const recurringLine = invoice.lines.data.find(
      (line) => line.parent?.type === "subscription_item_details",
    );
    const start = recurringLine?.period.start ?? invoice.period_start,
      end = recurringLine?.period.end ?? invoice.period_end;
    if (end <= start || invoice.status !== "paid") return true;
    await db.batch([
      db
        .insert(careCycles)
        .values({
          id: newId("cycle"),
          carePlanId: id,
          externalReference: `stripe:${invoice.id}`,
          startsAt: new Date(start * 1000).toISOString(),
          endsAt: new Date(end * 1000).toISOString(),
          sessionsCount: plan.sessionsCount,
          amountCents: invoice.amount_paid,
          currency: invoice.currency,
          createdAt: nowIso(),
        })
        .onConflictDoNothing(),
      db
        .update(carePlans)
        .set({
          status: subscription.status,
          stripeSubscriptionId: subId,
          stripeCustomerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id,
        })
        .where(eq(carePlans.id, id)),
    ]);
    return true;
  }
  if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const id = sub.metadata.nido_care_plan;
    if (!id) return false;
    if (!stripe) throw new Error("Stripe no configurado");
    const plan = await db.query.carePlans.findFirst({
      where: eq(carePlans.id, id),
    });
    if (
      !plan ||
      (plan.stripeSubscriptionId && plan.stripeSubscriptionId !== sub.id)
    )
      return true;
    const current = await stripe.subscriptions.retrieve(sub.id);
    if (current.metadata.nido_care_plan !== id) return true;
    await db
      .update(carePlans)
      .set({
        status: current.status,
        stripeSubscriptionId: current.id,
        stripeCustomerId:
          typeof current.customer === "string"
            ? current.customer
            : current.customer.id,
      })
      .where(eq(carePlans.id, id));
    return true;
  }
  return false;
}
