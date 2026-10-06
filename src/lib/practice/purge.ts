import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  appointmentReminderDeliveries,
  appointmentReminderPreferences,
} from "@/db/reminder-schema";
import {
  callConsents,
  careCycles,
  carePlans,
  practiceAppointments,
  practiceCallRooms,
  practiceCredentials,
  practiceNotes,
  practicePatientProfiles,
  practicePatients,
  practiceReceiptCorrections,
  practiceReceipts,
  practiceServices,
  practiceSettings,
  professionalMemberships,
  professionals,
} from "@/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { purgeRoomAssets } from "@/lib/practice/media";
/** Primero detiene cobros y purga el proveedor. Un fallo conserva los punteros para reintentar. */
export async function preparePracticePurge(professionalId: string) {
  const [membership, plans, rooms] = await Promise.all([
    db.query.professionalMemberships.findFirst({
      where: eq(professionalMemberships.professionalId, professionalId),
    }),
    db
      .select()
      .from(carePlans)
      .where(eq(carePlans.professionalId, professionalId)),
    db
      .select()
      .from(practiceCallRooms)
      .where(
        and(
          eq(practiceCallRooms.professionalId, professionalId),
          isNull(practiceCallRooms.purgedAt),
        ),
      ),
  ]);
  if (
    [membership?.checkoutId, ...plans.map((p) => p.checkoutId)].some((id) =>
      id?.startsWith("creating:"),
    )
  )
    throw new Error(
      "Hay un cobro en preparación. Reintenta su recuperación o contacta a soporte antes de borrar la cuenta.",
    );
  const stripe = getStripe();
  const subscriptionIds = new Set(
    [
      membership?.stripeSubscriptionId,
      ...plans.map((p) => p.stripeSubscriptionId),
    ].filter((id): id is string => Boolean(id)),
  );
  const checkouts = [
    membership?.checkoutId,
    ...plans.map((p) => p.checkoutId),
  ].filter((id): id is string => Boolean(id && !id.startsWith("creating:")));
  if ((subscriptionIds.size || checkouts.length) && !stripe)
    throw new Error(
      "No se pudo comprobar la cancelación de cobros. Configura el proveedor y reintenta la baja.",
    );
  if (stripe) {
    for (const id of subscriptionIds) {
      const current = await stripe.subscriptions.retrieve(id);
      if (!["canceled", "incomplete_expired"].includes(current.status))
        await stripe.subscriptions.cancel(id);
    }
    for (const id of checkouts) {
      const current = await stripe.checkout.sessions.retrieve(id);
      if (current.status === "open") await stripe.checkout.sessions.expire(id);
    }
  }
  for (const room of rooms) await purgeRoomAssets(room.name);
}
export function practiceDeleteStatements(professionalId: string) {
  const appointments = db
    .select({ id: practiceAppointments.id })
    .from(practiceAppointments)
    .where(eq(practiceAppointments.professionalId, professionalId));
  const plans = db
    .select({ id: carePlans.id })
    .from(carePlans)
    .where(eq(carePlans.professionalId, professionalId));
  return [
    db
      .delete(practicePatientProfiles)
      .where(eq(practicePatientProfiles.professionalId, professionalId)),
    db
      .delete(appointmentReminderDeliveries)
      .where(
        inArray(appointmentReminderDeliveries.appointmentId, appointments),
      ),
    db
      .delete(appointmentReminderPreferences)
      .where(
        and(
          eq(appointmentReminderPreferences.role, "professional"),
          inArray(
            appointmentReminderPreferences.userId,
            db
              .select({ userId: professionals.userId })
              .from(professionals)
              .where(eq(professionals.id, professionalId)),
          ),
        ),
      ),
    db
      .delete(practiceNotes)
      .where(eq(practiceNotes.professionalId, professionalId)),
    db
      .delete(callConsents)
      .where(inArray(callConsents.appointmentId, appointments)),
    db
      .delete(practiceCallRooms)
      .where(eq(practiceCallRooms.professionalId, professionalId)),
    db
      .delete(practiceAppointments)
      .where(eq(practiceAppointments.professionalId, professionalId)),
    db.delete(careCycles).where(inArray(careCycles.carePlanId, plans)),
    db.delete(carePlans).where(eq(carePlans.professionalId, professionalId)),
    db
      .delete(practiceReceiptCorrections)
      .where(eq(practiceReceiptCorrections.professionalId, professionalId)),
    db
      .delete(practiceReceipts)
      .where(eq(practiceReceipts.professionalId, professionalId)),
    db
      .delete(practicePatients)
      .where(eq(practicePatients.professionalId, professionalId)),
    db
      .delete(practiceServices)
      .where(eq(practiceServices.professionalId, professionalId)),
    db
      .delete(practiceSettings)
      .where(eq(practiceSettings.professionalId, professionalId)),
    db
      .delete(practiceCredentials)
      .where(eq(practiceCredentials.professionalId, professionalId)),
    db
      .delete(professionalMemberships)
      .where(eq(professionalMemberships.professionalId, professionalId)),
  ];
}
