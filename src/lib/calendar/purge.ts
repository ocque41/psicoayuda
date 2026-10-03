import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  googleCalendarConnections as connections,
  googleCalendarEventLinks,
  googleCalendarOAuthStates,
} from "@/db/calendar-schema";
import { practiceAppointments } from "@/db/schema";
import { revokeCalendarTokens } from "./google";
import { parseConnectionTokens } from "./sync";

/** Google revoca todo el grant del proyecto Calendar: se detienen ambos espacios de la misma cuenta. */
export async function prepareCalendarAccountPurge(userId: string) {
  // Invalida también callbacks en vuelo antes de cualquier espera remota.
  await db
    .delete(googleCalendarOAuthStates)
    .where(eq(googleCalendarOAuthStates.userId, userId));
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId));
  for (const row of rows) {
    const now = new Date().toISOString();
    const claimed = await db
      .update(connections)
      .set({ status: "disconnecting", updatedAt: now })
      .where(
        and(
          eq(connections.id, row.id),
          eq(connections.userId, userId),
          or(isNull(connections.leaseUntil), lt(connections.leaseUntil, now)),
        ),
      )
      .returning({ id: connections.id });
    if (!claimed.length)
      throw new Error(
        "Espera a que termine la sincronización de calendario antes de desconectar o borrar la cuenta.",
      );
  }
  for (const row of rows)
    await revokeCalendarTokens(await parseConnectionTokens(row));
}
export function calendarAccountDeleteStatements(userId: string) {
  const ids = db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.userId, userId));
  return [
    db
      .delete(googleCalendarEventLinks)
      .where(inArray(googleCalendarEventLinks.connectionId, ids)),
    db
      .delete(googleCalendarOAuthStates)
      .where(eq(googleCalendarOAuthStates.userId, userId)),
    db.delete(connections).where(eq(connections.userId, userId)),
  ] as const;
}
export async function disconnectGoogleCalendar(userId: string) {
  await prepareCalendarAccountPurge(userId);
  await db.batch(calendarAccountDeleteStatements(userId));
}
/** Conserva el puntero opaco de otras cuentas para retirar su evento al siguiente sync. */
export function calendarUnlinkProfessionalAppointments(professionalId: string) {
  const appointments = db
    .select({ id: practiceAppointments.id })
    .from(practiceAppointments)
    .where(eq(practiceAppointments.professionalId, professionalId));
  return db
    .update(googleCalendarEventLinks)
    .set({ appointmentId: null })
    .where(inArray(googleCalendarEventLinks.appointmentId, appointments));
}
