import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  accountOnboardingDrafts,
  accountRolePreferences,
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
} from "@/db/patient-schema";
import {
  carePlans,
  conversations,
  practiceAppointments,
  practiceCallRooms,
  practicePatients,
  seekerSessions,
} from "@/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { purgeRoomAssets } from "@/lib/practice/media";

/** Conserva los acuerdos y referencias si un proveedor no confirma la baja. */
export async function preparePatientAccountPurge(userId: string) {
  const links = db
    .select({ id: patientConversationLinks.conversationId })
    .from(patientConversationLinks)
    .where(eq(patientConversationLinks.userId, userId));
  const patients = db
    .select({ id: practicePatients.id })
    .from(practicePatients)
    .where(inArray(practicePatients.conversationId, links));
  const plans = await db
    .select({
      id: carePlans.id,
      subscriptionId: carePlans.stripeSubscriptionId,
      checkoutId: carePlans.checkoutId,
    })
    .from(carePlans)
    .where(inArray(carePlans.patientId, patients));
  if (plans.some((p) => p.checkoutId?.startsWith("creating:")))
    throw new Error(
      "Hay un cobro en preparación. Contacta a soporte antes de eliminar la cuenta.",
    );
  const stripe = getStripe();
  if (plans.some((p) => p.subscriptionId || p.checkoutId) && !stripe)
    throw new Error(
      "No pudimos verificar la cancelación de cobros. La cuenta sigue activa; contacta a soporte.",
    );
  if (stripe) {
    for (const plan of plans) {
      if (plan.subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(
          plan.subscriptionId,
        );
        if (!["canceled", "incomplete_expired"].includes(subscription.status))
          await stripe.subscriptions.cancel(plan.subscriptionId);
      }
      if (plan.checkoutId) {
        const checkout = await stripe.checkout.sessions.retrieve(
          plan.checkoutId,
        );
        if (checkout.status === "open")
          await stripe.checkout.sessions.expire(plan.checkoutId);
      }
    }
  }
  const rooms = await db
    .select({ name: practiceCallRooms.name })
    .from(practiceCallRooms)
    .innerJoin(
      practiceAppointments,
      eq(practiceAppointments.id, practiceCallRooms.appointmentId),
    )
    .innerJoin(
      practicePatients,
      eq(practicePatients.id, practiceAppointments.patientId),
    )
    .where(
      and(
        inArray(practicePatients.id, patients),
        isNull(practiceCallRooms.purgedAt),
      ),
    );
  for (const room of rooms) await purgeRoomAssets(room.name);
}
export function patientAccountDeleteStatements(userId: string) {
  const links = db
    .select({ id: patientConversationLinks.conversationId })
    .from(patientConversationLinks)
    .where(eq(patientConversationLinks.userId, userId));
  return [
    db
      .update(seekerSessions)
      .set({ revokedAt: new Date() })
      .where(inArray(seekerSessions.conversationId, links)),
    db
      .delete(patientSessionRequests)
      .where(eq(patientSessionRequests.userId, userId)),
    db
      .delete(patientConversationLinks)
      .where(eq(patientConversationLinks.userId, userId)),
    db
      .delete(accountOnboardingDrafts)
      .where(eq(accountOnboardingDrafts.userId, userId)),
    db
      .delete(accountRolePreferences)
      .where(eq(accountRolePreferences.userId, userId)),
    db.delete(patientAccounts).where(eq(patientAccounts.userId, userId)),
  ];
}

/** Limpiar hijos antes de borrar conversaciones del profesional, sin asumir cascades. */
export function patientLinksForProfessionalDeleteStatements(
  professionalId: string,
) {
  const chats = db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.professionalId, professionalId));
  return [
    db
      .delete(patientSessionRequests)
      .where(inArray(patientSessionRequests.conversationId, chats)),
    db
      .delete(patientConversationLinks)
      .where(inArray(patientConversationLinks.conversationId, chats)),
  ];
}
