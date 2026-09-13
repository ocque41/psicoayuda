import "server-only";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { auditLogs, payments, professionals, stripeEvents } from "@/db/schema";
import { getAdminEmails } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import {
  buildPaymentDisputeAlertEmail,
  buildPaymentReceiptEmail,
  buildPaymentReceivedProEmail,
} from "@/lib/email-templates";
import { newId, nowIso } from "@/lib/ids";
import { formatEuros } from "@/lib/payments/packages";
import { SITE_URL } from "@/lib/site";

function nidoPaymentId(metadata: Stripe.Metadata | null | undefined) {
  return metadata?.nido_payment_id ?? null;
}

async function logPaymentAudit(input: {
  action: string;
  paymentId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: null,
    action: input.action,
    entityType: "payment",
    entityId: input.paymentId,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: nowIso(),
  });
}

async function notifyPaymentPaid(paymentId: string) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
  if (!payment) return;

  const amountLabel = formatEuros(payment.amountCents);
  const netLabel = formatEuros(
    Math.max(0, payment.amountCents - payment.applicationFeeCents),
  );

  // Recibo para quien pagó.
  if (payment.payerEmail) {
    const receipt = buildPaymentReceiptEmail({
      packageTitle: payment.packageTitle ?? "Paquete de sesiones",
      professionalName: payment.professionalName ?? "tu profesional",
      amountLabel,
      payerName: payment.payerName,
    });
    await sendEmail({
      to: payment.payerEmail,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
    });
  }

  // Aviso al profesional.
  if (payment.professionalId) {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, payment.professionalId),
      columns: { email: true, displayName: true, fullName: true },
    });
    if (professional?.email) {
      const alert = buildPaymentReceivedProEmail({
        packageTitle: payment.packageTitle ?? "Paquete de sesiones",
        professionalName:
          professional.displayName ?? professional.fullName ?? null,
        grossLabel: amountLabel,
        netLabel,
        payerEmail: payment.payerEmail,
        dashboardUrl: `${SITE_URL}/pro/dashboard#cobros`,
      });
      await sendEmail({
        to: professional.email,
        subject: alert.subject,
        html: alert.html,
        text: alert.text,
      });
    }
  }
}

/**
 * ¿El evento pertenece a Nido? La cuenta de Stripe es COMPARTIDA con otros
 * proyectos del equipo: todo lo ajeno se ignora sin reclamarlo (antes se
 * registraba en `stripe_events` y la tabla crecía con ruido de otros). Para
 * reembolsos/disputas no siempre hay metadatos `nido_*` en el objeto, así que
 * además se cruza el PaymentIntent contra nuestros pagos.
 */
async function isNidoEvent(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      return Boolean(
        session.metadata?.nido_payment_id || session.client_reference_id,
      );
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      return Boolean(intent.metadata?.nido_payment_id);
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute;
      if (object.metadata?.nido_payment_id) return true;
      const intent = object.payment_intent;
      const paymentIntentId =
        typeof intent === "string" ? intent : (intent?.id ?? null);
      if (!paymentIntentId) return false;
      const payment = await db.query.payments.findFirst({
        where: eq(payments.stripePaymentIntentId, paymentIntentId),
        columns: { id: true },
      });
      return Boolean(payment);
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const professional = await db.query.professionals.findFirst({
        where: eq(professionals.stripeAccountId, account.id),
        columns: { id: true },
      });
      return Boolean(professional);
    }
    default:
      return false;
  }
}

/**
 * Procesa un evento de Stripe con idempotencia fuerte: reclamamos el id en
 * `stripe_events` ANTES de procesar; si el proceso falla, soltamos la marca para
 * que el reintento de Stripe lo vuelva a entregar (nunca se pierde un pago).
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!(await isNidoEvent(event))) return;

  const claimed = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type, processedAt: nowIso() })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (claimed.length === 0) return;

  try {
    await routeStripeEvent(event);
  } catch (error) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    throw error;
  }
}

async function routeStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId =
        nidoPaymentId(session.metadata) ?? session.client_reference_id;
      if (!paymentId) return; // otro proyecto de la cuenta compartida
      const updated = await db
        .update(payments)
        .set({
          status: "paid",
          paidAt: nowIso(),
          updatedAt: nowIso(),
          payerEmail: session.customer_details?.email ?? null,
          payerName: session.customer_details?.name ?? null,
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .where(eq(payments.id, paymentId))
        .returning({ id: payments.id });
      if (updated.length === 0) return;
      await logPaymentAudit({
        action: "payment_paid",
        paymentId,
        metadata: { sessionId: session.id, eventId: event.id },
      });
      await notifyPaymentPaid(paymentId);
      return;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = nidoPaymentId(session.metadata);
      if (!paymentId) return;
      await db
        .update(payments)
        .set({ status: "expired", updatedAt: nowIso() })
        .where(eq(payments.id, paymentId));
      return;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const paymentId = nidoPaymentId(intent.metadata);
      if (!paymentId) return;
      await db
        .update(payments)
        .set({ status: "failed", updatedAt: nowIso() })
        .where(eq(payments.id, paymentId));
      return;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
      if (!paymentIntentId) return;
      const updated = await db
        .update(payments)
        .set({ status: "refunded", refundedAt: nowIso(), updatedAt: nowIso() })
        .where(eq(payments.stripePaymentIntentId, paymentIntentId))
        .returning({ id: payments.id });
      for (const row of updated) {
        await logPaymentAudit({
          action: "payment_refunded",
          paymentId: row.id,
          metadata: { eventId: event.id },
        });
      }
      return;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : (dispute.payment_intent?.id ?? null);
      if (!paymentIntentId) return;
      const updated = await db
        .update(payments)
        .set({ status: "disputed", updatedAt: nowIso() })
        .where(eq(payments.stripePaymentIntentId, paymentIntentId))
        .returning({
          id: payments.id,
          packageTitle: payments.packageTitle,
          professionalName: payments.professionalName,
          amountCents: payments.amountCents,
        });
      for (const row of updated) {
        await logPaymentAudit({
          action: "payment_disputed",
          paymentId: row.id,
          metadata: { eventId: event.id, disputeId: dispute.id },
        });
        const alert = buildPaymentDisputeAlertEmail({
          paymentId: row.id,
          packageTitle: row.packageTitle ?? "Paquete de sesiones",
          professionalName: row.professionalName ?? "Profesional",
          amountLabel: formatEuros(row.amountCents),
          adminUrl: `${SITE_URL}/admin`,
        });
        for (const email of getAdminEmails()) {
          await sendEmail({
            to: email,
            subject: alert.subject,
            html: alert.html,
            text: alert.text,
          });
        }
      }
      return;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await db
        .update(professionals)
        .set({
          stripeChargesEnabled: Boolean(account.charges_enabled),
          stripePayoutsEnabled: Boolean(account.payouts_enabled),
          stripeDetailsSubmitted: Boolean(account.details_submitted),
          updatedAt: nowIso(),
        })
        .where(eq(professionals.stripeAccountId, account.id));
      return;
    }

    default:
      // Otros eventos de la cuenta compartida (suscripciones de otros
      // proyectos) se ignoran a propósito.
      return;
  }
}
