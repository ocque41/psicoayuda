import { eq, like } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  auditLogs,
  payments,
  professionals,
  stripeEvents,
  user,
} from "@/db/schema";
import { handleStripeEvent } from "@/lib/payments/webhook";

// Webhook de pagos con la DB local real: idempotencia, pago confirmado,
// eventos ajenos ignorados (la cuenta de Stripe es compartida) y estado de
// cuentas Connect. Sin RESEND_API_KEY el envío de correo se omite en silencio.

const P = "test-wh";
const id = {
  user: `${P}-user`,
  pro: `${P}-pro`,
  payment: `${P}-payment`,
  session: `${P}-session`,
  event: `${P}-evt-paid`,
  foreignEvent: `${P}-evt-foreign`,
  accountEvent: `${P}-evt-account`,
  account: `${P}-acct`,
};

async function cleanup() {
  await db.delete(stripeEvents).where(like(stripeEvents.id, `${P}-%`));
  await db.delete(auditLogs).where(like(auditLogs.entityId, `${P}-%`));
  await db.delete(payments).where(like(payments.id, `${P}-%`));
  await db.delete(professionals).where(eq(professionals.id, id.pro));
  await db.delete(user).where(eq(user.id, id.user));
}

function fakeEvent(
  eventId: string,
  type: string,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id: eventId,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values({
      id: id.user,
      name: "Pro Webhook",
      email: `${id.user}@test.local`,
    });
    await db.insert(professionals).values({
      id: id.pro,
      userId: id.user,
      email: `${id.pro}@test.local`,
      fullName: "Pro Webhook",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["ansiedad"]),
      stripeAccountId: id.account,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    await db.insert(payments).values({
      id: id.payment,
      professionalId: id.pro,
      professionalName: "Pro Webhook",
      packageTitle: "4 sesiones",
      amountCents: 2500,
      applicationFeeCents: 500,
      currency: "eur",
      status: "pending",
      stripeCheckoutSessionId: id.session,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it("marca el pago como pagado y es idempotente con el mismo evento", async () => {
    const event = fakeEvent(id.event, "checkout.session.completed", {
      id: id.session,
      client_reference_id: id.payment,
      metadata: { nido_payment_id: id.payment },
      payment_intent: "pi_test_1",
      customer_details: { email: "pagador@test.local", name: "Pagador" },
    });

    await handleStripeEvent(event);
    await handleStripeEvent(event);

    const payment = await db.query.payments.findFirst({
      where: eq(payments.id, id.payment),
    });
    expect(payment?.status).toBe("paid");
    expect(payment?.paidAt).toBeTruthy();
    expect(payment?.stripePaymentIntentId).toBe("pi_test_1");
    expect(payment?.payerEmail).toBe("pagador@test.local");

    const claimed = await db
      .select({ id: stripeEvents.id })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, id.event));
    expect(claimed).toHaveLength(1);

    const audits = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id.payment));
    expect(audits).toHaveLength(1);
  });

  it("ignora eventos de otros proyectos (sin metadatos nido_*)", async () => {
    const event = fakeEvent(id.foreignEvent, "checkout.session.completed", {
      id: "cs_ajeno",
      metadata: { proyecto: "otro" },
      customer_details: { email: "otro@test.local" },
    });
    await handleStripeEvent(event);

    const payment = await db.query.payments.findFirst({
      where: eq(payments.id, id.payment),
    });
    expect(payment?.status).toBe("paid"); // no cambió nada con el evento ajeno
  });

  it("actualiza el estado de la cuenta Connect", async () => {
    const event = fakeEvent(id.accountEvent, "account.updated", {
      id: id.account,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });
    await handleStripeEvent(event);

    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.pro),
    });
    expect(pro?.stripeChargesEnabled).toBe(true);
    expect(pro?.stripePayoutsEnabled).toBe(true);
    expect(pro?.stripeDetailsSubmitted).toBe(true);
  });
});
