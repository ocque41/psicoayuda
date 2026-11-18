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
import {
  INTERVAL_LABELS,
  isMembershipCurrency,
  isMembershipInterval,
  MEMBERSHIP_POLICY_VERSION,
  MEMBERSHIP_PRICES,
  type MembershipCurrency,
  type MembershipInterval,
  stripeTrialEnd,
} from "@/lib/practice/membership-plan";
import { SITE_URL } from "@/lib/site";

export class MembershipCheckoutError extends Error {}

/**
 * Los cobros del software se activan con la bandera y las dos claves de Stripe.
 * Mientras está apagado nadie pierde acceso: los planes se muestran, pero no
 * se crea ningún pago (ver `subscription-access.ts`).
 */
export function membershipBillingReady() {
  return (
    process.env.NIDO_MEMBERSHIP_BILLING_ENABLED === "true" &&
    Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  );
}

const POLICY_PREFIX = `creating:${MEMBERSHIP_POLICY_VERSION}:`;

/** Crea la fila local sin prueba ni estado de acceso (status "none"). */
async function ensureMembershipRow(professionalId: string) {
  const now = nowIso();
  await db
    .insert(professionalMemberships)
    .values({
      professionalId,
      trialStartedAt: now,
      trialEndsAt: now,
      status: "none",
      updatedAt: now,
    })
    .onConflictDoNothing();
  return db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, professionalId),
  });
}

export async function membershipCheckout(
  pro: { id: string; email: string },
  interval: string,
  currency: string,
) {
  if (!isMembershipInterval(interval) || !isMembershipCurrency(currency))
    throw new MembershipCheckoutError(
      "Elige un plan mensual o anual y una moneda disponible antes de continuar.",
    );
  const stripe = getStripe();
  if (!stripe || !membershipBillingReady())
    throw new MembershipCheckoutError(
      "La activación de planes todavía no está abierta.",
    );
  const approved = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.id, pro.id),
      eq(professionals.status, "approved"),
    ),
    columns: { id: true, accessPlan: true, accessTrialEndsAt: true },
  });
  if (!approved)
    throw new MembershipCheckoutError(
      "Tu perfil necesita aprobación antes de activar un plan.",
    );
  // Perfiles anteriores en su prueba de 90 días: la suscripción empieza a
  // cobrar al terminar la prueba, nunca antes.
  const trialEnd =
    approved.accessPlan === "subscription"
      ? stripeTrialEnd(approved.accessTrialEndsAt)
      : null;
  const member = await ensureMembershipRow(pro.id);
  if (!member)
    throw new MembershipCheckoutError(
      "No pudimos preparar tu plan. Reintenta en un momento.",
    );
  if (member.stripeSubscriptionId) {
    const existing = await membershipProviderCall(() =>
      stripe.subscriptions.retrieve(member.stripeSubscriptionId as string),
    );
    if (
      existing.status !== "canceled" &&
      existing.status !== "incomplete_expired"
    )
      throw new MembershipCheckoutError(
        "Ya tienes una suscripción. Gestiona el plan desde el portal de facturación.",
      );
  }
  if (member.checkoutId?.startsWith("cs_")) {
    const existing = await membershipProviderCall(() =>
      stripe.checkout.sessions.retrieve(member.checkoutId as string, {
        expand: ["line_items.data.price"],
      }),
    );
    if (!ownedMembershipCheckout(existing, pro.id, member.stripeCustomerId))
      throw new MembershipCheckoutError(
        "No pudimos comprobar este pago. Contacta a soporte antes de continuar.",
      );
    if (existing.status === "complete")
      throw new MembershipCheckoutError(
        "Ya completaste un pago. Estamos confirmando su estado; comprueba tu plan antes de repetirlo.",
      );
    if (existing.status === "open") {
      if (currentMembershipCheckout(existing, interval, currency, trialEnd)) {
        if (!existing.url)
          throw new MembershipCheckoutError(
            "No pudimos recuperar el pago abierto. Reintenta en un momento.",
          );
        const [verified] = await db
          .select({ member: professionalMemberships })
          .from(professionalMemberships)
          .innerJoin(
            professionals,
            eq(professionals.id, professionalMemberships.professionalId),
          )
          .where(
            and(
              eq(professionalMemberships.professionalId, pro.id),
              eq(professionalMemberships.checkoutId, existing.id),
              eq(professionals.status, "approved"),
            ),
          )
          .limit(1);
        const currentMember = verified?.member;
        if (
          !currentMember ||
          currentMember.stripeCustomerId !== member.stripeCustomerId
        )
          throw new MembershipCheckoutError(
            "El estado del plan cambió. Recarga la página antes de continuar.",
          );
        if (currentMember.stripeSubscriptionId !== member.stripeSubscriptionId)
          throw new MembershipCheckoutError(
            "Estamos confirmando una suscripción. Comprueba tu plan antes de repetir el pago.",
          );
        return existing.url;
      }
      // Cambió el plan o la moneda: cerramos el enlace anterior antes de abrir
      // uno nuevo para que nunca convivan dos pagos abiertos.
      await membershipProviderCall(() =>
        stripe.checkout.sessions.expire(existing.id),
      );
    } else if (existing.status !== "expired")
      throw new MembershipCheckoutError(
        "No pudimos confirmar el estado del pago. Reintenta en un momento.",
      );
  }
  const recovering = member.checkoutId?.startsWith("creating:");
  if (
    recovering &&
    (!member.checkoutId?.startsWith(POLICY_PREFIX) ||
      member.plan !== interval ||
      member.currency !== currency)
  )
    throw new MembershipCheckoutError(
      "Hay un pago anterior en preparación con otras condiciones. Contacta a soporte para comprobarlo antes de continuar.",
    );
  if (recovering) {
    const startedAt = Number(
      member.checkoutId?.slice(POLICY_PREFIX.length).split(":")[0],
    );
    const age = Date.now() - startedAt;
    // Stripe puede descartar la clave a partir de 24 h. No recrear un pago incierto.
    if (
      !Number.isFinite(startedAt) ||
      startedAt <= 0 ||
      age < 0 ||
      age >= 23 * 3600000
    )
      throw new MembershipCheckoutError(
        "Hay un pago pendiente de comprobación. Contacta a soporte antes de repetirlo para evitar una segunda suscripción.",
      );
  }
  const attempt = recovering
    ? member.checkoutId || `${POLICY_PREFIX}${Date.now()}:${newId("billing")}`
    : `${POLICY_PREFIX}${Date.now()}:${newId("billing")}`;
  const claimed = await db
    .update(professionalMemberships)
    .set({ checkoutId: attempt, plan: interval, currency })
    .where(
      and(
        eq(professionalMemberships.professionalId, pro.id),
        sql`EXISTS (SELECT 1 FROM ${professionals} WHERE ${professionals.id} = ${pro.id} AND ${professionals.status} = 'approved')`,
        member.checkoutId
          ? eq(professionalMemberships.checkoutId, member.checkoutId)
          : isNull(professionalMemberships.checkoutId),
        member.stripeSubscriptionId
          ? eq(
              professionalMemberships.stripeSubscriptionId,
              member.stripeSubscriptionId,
            )
          : isNull(professionalMemberships.stripeSubscriptionId),
      ),
    )
    .returning({ id: professionalMemberships.professionalId });
  if (!claimed.length)
    throw new MembershipCheckoutError("Ya hay una operación de pago en curso.");
  const metadata: Record<string, string> = {
    nido_membership_pro: pro.id,
    nido_plan: interval,
    nido_currency: currency,
    nido_membership_policy: MEMBERSHIP_POLICY_VERSION,
    ...(trialEnd ? { nido_trial_end: String(trialEnd) } : {}),
  };
  // Una clave estable permite recuperar el mismo cliente si falla el guardado local.
  const customer =
    member.stripeCustomerId ||
    (
      await membershipProviderCall(() =>
        stripe.customers.create(
          { email: pro.email, metadata: { nido_membership_pro: pro.id } },
          { idempotencyKey: `nido-membership-customer-${pro.id}` },
        ),
      )
    ).id;
  await db
    .update(professionalMemberships)
    .set({ stripeCustomerId: customer })
    .where(eq(professionalMemberships.professionalId, pro.id));
  const checkout = await membershipProviderCall(() =>
    stripe.checkout.sessions.create(
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
              currency,
              unit_amount: MEMBERSHIP_PRICES[interval][currency],
              recurring: { interval },
              product_data: {
                name: `Nido · software profesional (${INTERVAL_LABELS[interval].toLowerCase()})`,
              },
            },
          },
        ],
        subscription_data: trialEnd
          ? { metadata, trial_end: trialEnd }
          : { metadata },
        success_url: `${SITE_URL}/pro/plan?resultado=confirmando`,
        cancel_url: `${SITE_URL}/pro/plan`,
      },
      { idempotencyKey: attempt },
    ),
  );
  if (!checkout.url)
    throw new MembershipCheckoutError(
      "No pudimos abrir el pago. Contacta a soporte.",
    );
  const saved = await db
    .update(professionalMemberships)
    .set({ checkoutId: checkout.id, updatedAt: nowIso() })
    .where(
      and(
        eq(professionalMemberships.professionalId, pro.id),
        eq(professionalMemberships.checkoutId, attempt),
      ),
    )
    .returning({ id: professionalMemberships.professionalId });
  if (!saved.length)
    throw new MembershipCheckoutError(
      "El estado del pago cambió. Comprueba tu plan antes de volver a contratar.",
    );
  return checkout.url;
}

async function membershipProviderCall<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new MembershipCheckoutError(
      "No pudimos confirmar el pago con el proveedor. Comprueba tu plan y reintenta en un momento; conservamos la operación para evitar duplicarla.",
    );
  }
}

function ownedMembershipCheckout(
  checkout: Stripe.Checkout.Session,
  professionalId: string,
  customerId: string | null,
) {
  const owner =
    typeof checkout.customer === "string"
      ? checkout.customer
      : checkout.customer?.id;
  return Boolean(
    customerId &&
      owner === customerId &&
      checkout.mode === "subscription" &&
      checkout.client_reference_id === `nido-membership:${professionalId}` &&
      checkout.metadata?.nido_membership_pro === professionalId,
  );
}

/** No reutiliza enlaces de otra tarifa ni da por válido un listado truncado. */
function currentMembershipCheckout(
  checkout: Stripe.Checkout.Session,
  interval: MembershipInterval,
  currency: MembershipCurrency,
  trialEnd: number | null,
) {
  const lines = checkout.line_items;
  const item = lines?.data[0];
  const price = item?.price;
  return Boolean(
    checkout.metadata?.nido_plan === interval &&
      checkout.metadata?.nido_currency === currency &&
      checkout.metadata?.nido_membership_policy === MEMBERSHIP_POLICY_VERSION &&
      (checkout.metadata?.nido_trial_end ?? null) ===
        (trialEnd ? String(trialEnd) : null) &&
      lines &&
      !lines.has_more &&
      lines.data.length === 1 &&
      item?.quantity === 1 &&
      price &&
      price.currency === currency &&
      (!checkout.currency || checkout.currency === currency) &&
      price.unit_amount === MEMBERSHIP_PRICES[interval][currency] &&
      price.recurring?.interval === interval &&
      price.recurring.interval_count === 1,
  );
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
  const currency = current.metadata.nido_currency || current.currency || null;
  await db.batch([
    db
      .update(professionalMemberships)
      .set({
        stripeSubscriptionId: current.id,
        status: current.status,
        plan: current.metadata.nido_plan || null,
        currency,
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
