import "server-only";
import { sql } from "drizzle-orm";

/** La sesión, el permiso clínico y el dueño se vuelven a decidir en la BD. */
export function currentPatientProfileSession(
  professionalId: string,
  userId: string,
  sessionId: string,
) {
  return sql`EXISTS (
    SELECT 1 FROM professionals actor
    JOIN user account ON account.id = actor.user_id
    JOIN session auth_session ON auth_session.user_id = account.id
    WHERE actor.id = ${professionalId} AND actor.user_id = ${userId}
      AND actor.status = 'approved' AND coalesce(actor.non_clinical_helper,0) = 0
      AND auth_session.id = ${sessionId}
      AND auth_session.expires_at > cast(unixepoch('subsecond') * 1000 as integer)
  )`;
}
export function currentPatientProfileActor(
  professionalId: string,
  userId: string,
  patientId: string,
  sessionId: string,
) {
  return sql`(${currentPatientProfileSession(professionalId, userId, sessionId)} AND EXISTS (
    SELECT 1 FROM practice_patients patient
    WHERE patient.id = ${patientId} AND patient.professional_id = ${professionalId}
  ))`;
}
