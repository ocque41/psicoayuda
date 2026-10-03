import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  patientConversationLinks,
  patientSessionRequests,
} from "@/db/patient-schema";
import {
  conversations,
  practiceAppointments,
  practicePatients,
  professionals,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { localToUtc, timeZoneSchema } from "@/lib/practice/domain";

export const sessionRequestSchema = z.object({
  conversationId: z.string().min(1).max(100),
  appointmentId: z.string().max(100).optional(),
  kind: z.enum(["new", "reschedule", "cancel"]),
  preferredLocal: z.string().max(30).optional(),
  timezone: timeZoneSchema,
  reason: z
    .enum(["schedule", "unavailable", "no_longer_needed", "other"])
    .optional(),
});
export const requestKindLabels: Record<string, string> = {
  new: "Nueva sesión",
  reschedule: "Cambio de horario",
  cancel: "Cancelación",
};
export const requestStatusLabels: Record<string, string> = {
  pending: "Pendiente de respuesta",
  confirmed: "Confirmada · cambio guardado",
  reviewed: "Revisada · consulta el chat",
  declined: "No disponible · consulta el chat",
  withdrawn: "Retirada",
};
export async function createPatientSessionRequest(
  userId: string,
  input: z.input<typeof sessionRequestSchema>,
) {
  const data = sessionRequestSchema.parse(input);
  let startsAt: string | null = null;
  if (data.kind !== "cancel") {
    startsAt = localToUtc(data.preferredLocal || "", data.timezone);
    if (
      !startsAt ||
      Date.parse(startsAt) <= Date.now() ||
      Date.parse(startsAt) > Date.now() + 365 * 86400000
    )
      throw new Error(
        "Elige una hora futura válida, dentro del próximo año. Las horas ambiguas del cambio de horario no se pueden usar.",
      );
  }
  const [owned] = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      professionalStatus: professionals.status,
    })
    .from(patientConversationLinks)
    .innerJoin(
      conversations,
      eq(conversations.id, patientConversationLinks.conversationId),
    )
    .innerJoin(
      professionals,
      eq(professionals.id, conversations.professionalId),
    )
    .where(
      and(
        eq(patientConversationLinks.userId, userId),
        eq(conversations.id, data.conversationId),
        isNull(conversations.deletedAt),
        isNull(conversations.anonymizedAt),
      ),
    )
    .limit(1);
  if (!owned) throw new Error("No tienes acceso a esta conversación.");
  if (
    data.kind === "new" &&
    (owned.status !== "open" || owned.professionalStatus !== "approved")
  )
    throw new Error(
      "La conversación no admite nuevas solicitudes. Habla con el profesional o elige otro perfil.",
    );
  if (data.kind !== "new") {
    if (!data.appointmentId)
      throw new Error("Elige la sesión que quieres cambiar.");
    const [appointment] = await db
      .select({
        id: practiceAppointments.id,
        status: practiceAppointments.status,
      })
      .from(practiceAppointments)
      .innerJoin(
        practicePatients,
        eq(practicePatients.id, practiceAppointments.patientId),
      )
      .where(
        and(
          eq(practiceAppointments.id, data.appointmentId),
          eq(practicePatients.conversationId, data.conversationId),
        ),
      )
      .limit(1);
    if (appointment?.status !== "scheduled")
      throw new Error("Esta sesión ya cambió. Actualiza el calendario.");
  }
  const timestamp = nowIso(),
    id = newId("preq");
  // La propiedad, el estado y el límite se vuelven a comprobar en la escritura.
  // Ninguna solicitud cambia una cita o aplica una penalización automáticamente.
  const created = await db.values<
    [string]
  >(sql`INSERT INTO patient_session_requests
    (id,user_id,conversation_id,appointment_id,kind,status,preferred_starts_at,timezone,reason,created_at,updated_at)
    SELECT ${id},${userId},c.id,${data.kind === "new" ? null : data.appointmentId || null},${data.kind},'pending',${startsAt},${data.timezone},${data.reason || null},${timestamp},${timestamp}
    FROM patient_conversation_links l JOIN conversations c ON c.id=l.conversation_id JOIN professionals p ON p.id=c.professional_id JOIN patient_accounts pa ON pa.user_id=l.user_id
    WHERE pa.deletion_state='active' AND l.user_id=${userId} AND c.id=${data.conversationId} AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
      AND (${data.kind} <> 'new' OR (c.status='open' AND p.status='approved'))
      AND (${data.kind} = 'new' OR EXISTS(SELECT 1 FROM practice_appointments a JOIN practice_patients pp ON pp.id=a.patient_id WHERE a.id=${data.appointmentId || null} AND a.status='scheduled' AND pp.conversation_id=c.id))
      AND (SELECT count(*) FROM patient_session_requests r WHERE r.user_id=${userId} AND r.status='pending') < 5
      AND NOT EXISTS(SELECT 1 FROM patient_session_requests r WHERE r.user_id=${userId} AND r.conversation_id=c.id AND r.kind=${data.kind} AND r.status='pending' AND (r.appointment_id IS ${data.kind === "new" ? null : data.appointmentId || null}))
    RETURNING id`);
  if (!created.length)
    throw new Error(
      "Ya tienes una solicitud pendiente para esta sesión o alcanzaste el máximo de cinco. Revisa tus solicitudes antes de enviar otra.",
    );
  return created[0][0];
}
export async function withdrawPatientRequest(
  userId: string,
  requestId: string,
) {
  const [result] = await db
    .update(patientSessionRequests)
    .set({ status: "withdrawn", updatedAt: nowIso() })
    .where(
      and(
        eq(patientSessionRequests.id, requestId),
        eq(patientSessionRequests.userId, userId),
        eq(patientSessionRequests.status, "pending"),
      ),
    )
    .returning({ id: patientSessionRequests.id });
  return Boolean(result);
}
