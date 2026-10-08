"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { patientSessionRequests } from "@/db/patient-schema";
import {
  practiceAppointments,
  practicePatients,
  practiceServices,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { dailyRequest } from "@/lib/practice/calls";

function refresh() {
  for (const path of [
    "/pro/consulta",
    "/pro/pacientes",
    "/mi",
    "/mi/calendario",
  ])
    revalidatePath(path, "layout");
}
export async function reviewPatientSessionRequest(
  _: PracticeFormState,
  data: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const id = String(data.get("requestId") || ""),
    decision = String(data.get("status") || "reviewed");
  if (!["confirmed", "reviewed", "declined"].includes(decision))
    return { ok: false, message: "Elige un resultado válido." };
  const pending = and(
    eq(patientSessionRequests.id, id),
    eq(patientSessionRequests.status, "pending"),
    sql`EXISTS(SELECT 1 FROM conversations c WHERE c.id=${patientSessionRequests.conversationId} AND c.professional_id=${pro.id} AND c.deleted_at IS NULL AND c.anonymized_at IS NULL) AND EXISTS(SELECT 1 FROM patient_accounts a WHERE a.user_id=${patientSessionRequests.userId} AND a.deletion_state='active') AND EXISTS(SELECT 1 FROM professionals pr WHERE pr.id=${pro.id} AND pr.status='approved')`,
  );
  if (decision !== "confirmed") {
    const [updated] = await db
      .update(patientSessionRequests)
      .set({ status: decision, updatedAt: nowIso() })
      .where(pending)
      .returning({ id: patientSessionRequests.id });
    refresh();
    return {
      ok: Boolean(updated),
      message: updated
        ? "Respuesta guardada. Continuad la coordinación en el chat."
        : "La solicitud ya cambió o no corresponde a tu consulta.",
    };
  }
  const request = await db.query.patientSessionRequests.findFirst({
    where: pending,
  });
  if (!request)
    return {
      ok: false,
      message: "La solicitud ya cambió. Actualiza la agenda.",
    };
  const timestamp = nowIso();
  let appointmentId = request.appointmentId;
  try {
    if (request.kind === "new") {
      if (
        !request.preferredStartsAt ||
        Date.parse(request.preferredStartsAt) <= Date.now()
      )
        return {
          ok: false,
          message:
            "La hora solicitada ya pasó. Coordina otra fecha en el chat.",
        };
      const [patient, service] = await Promise.all([
        db.query.practicePatients.findFirst({
          where: and(
            eq(practicePatients.conversationId, request.conversationId),
            eq(practicePatients.professionalId, pro.id),
          ),
        }),
        db.query.practiceServices.findFirst({
          where: and(
            eq(practiceServices.id, String(data.get("serviceId") || "")),
            eq(practiceServices.professionalId, pro.id),
            eq(practiceServices.active, true),
          ),
        }),
      ]);
      if (!patient || patient.status === "closed")
        return {
          ok: false,
          message:
            "Crea o abre la ficha de esta persona antes de confirmar su sesión.",
        };
      if (!service)
        return {
          ok: false,
          message: "Elige el servicio y acuerda sus condiciones en el chat.",
        };
      if (data.get("conditionsConfirmed") !== "on")
        return {
          ok: false,
          message:
            "Confirma que habéis acordado las condiciones de esta sesión.",
        };
      appointmentId = newId("appointment");
      const endsAt = new Date(
        Date.parse(request.preferredStartsAt) + service.durationMinutes * 60000,
      ).toISOString();
      const results = await db.batch([
        db
          .insert(practiceAppointments)
          .select(
            sql`SELECT ${appointmentId},${pro.id},${patient.id},${service.id},r.preferred_starts_at,${endsAt},r.timezone,'scheduled','online',${patient.program === "earthquake" ? 0 : Math.round(service.priceCents / service.sessionsCount)},${service.currency},${service.cancellationHours},NULL,0,NULL,${timestamp},${timestamp} FROM patient_session_requests r JOIN conversations c ON c.id=r.conversation_id JOIN practice_patients p ON p.conversation_id=c.id JOIN practice_services s ON s.id=${service.id} WHERE r.id=${id} AND r.status='pending' AND r.kind='new' AND c.professional_id=${pro.id} AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND p.id=${patient.id} AND p.professional_id=${pro.id} AND p.status!='closed' AND s.professional_id=${pro.id} AND s.active=1 AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=r.user_id AND pa.deletion_state='active') AND EXISTS(SELECT 1 FROM professionals pr WHERE pr.id=${pro.id} AND pr.status='approved')`,
          )
          .returning({ id: practiceAppointments.id }),
        db
          .update(patientSessionRequests)
          .set({ status: "confirmed", appointmentId, updatedAt: timestamp })
          .where(and(pending, sql`changes() = 1`))
          .returning({ id: patientSessionRequests.id }),
      ]);
      if (!results[0].length || !results[1].length)
        return {
          ok: false,
          message:
            "La solicitud cambió antes de confirmarla. Actualiza la agenda.",
        };
    } else {
      if (!appointmentId)
        return {
          ok: false,
          message: "Esta solicitud no tiene una sesión vigente.",
        };
      const appointment = await db.query.practiceAppointments.findFirst({
        where: and(
          eq(practiceAppointments.id, appointmentId),
          eq(practiceAppointments.professionalId, pro.id),
          eq(practiceAppointments.status, "scheduled"),
          sql`EXISTS(SELECT 1 FROM practice_patients p WHERE p.id=${practiceAppointments.patientId} AND p.conversation_id=${request.conversationId})`,
        ),
      });
      if (!appointment)
        return {
          ok: false,
          message: "La sesión ya cambió. Revisa la ficha antes de continuar.",
        };
      if (
        request.kind === "reschedule" &&
        (!request.preferredStartsAt ||
          Date.parse(request.preferredStartsAt) <= Date.now())
      )
        return {
          ok: false,
          message: "Elige una nueva fecha futura con el paciente.",
        };
      if (appointment.dailyRoom)
        await dailyRequest(
          `/rooms/${appointment.dailyRoom}`,
          undefined,
          "DELETE",
        );
      const values =
        request.kind === "cancel"
          ? { status: "cancelled", dailyRoom: null, updatedAt: timestamp }
          : {
              startsAt: request.preferredStartsAt || appointment.startsAt,
              endsAt: new Date(
                Date.parse(request.preferredStartsAt || appointment.startsAt) +
                  Date.parse(appointment.endsAt) -
                  Date.parse(appointment.startsAt),
              ).toISOString(),
              timeZone: request.timezone,
              dailyRoom: null,
              updatedAt: timestamp,
            };
      const results = await db.batch([
        db
          .update(practiceAppointments)
          .set(values)
          .where(
            and(
              eq(practiceAppointments.id, appointmentId),
              eq(practiceAppointments.professionalId, pro.id),
              eq(practiceAppointments.status, "scheduled"),
              eq(practiceAppointments.updatedAt, appointment.updatedAt),
              sql`EXISTS(SELECT 1 FROM patient_session_requests r WHERE r.id=${id} AND r.status='pending' AND r.appointment_id=${appointmentId} AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=r.user_id AND pa.deletion_state='active')) AND EXISTS(SELECT 1 FROM professionals pr WHERE pr.id=${pro.id} AND pr.status='approved')`,
            ),
          )
          .returning({ id: practiceAppointments.id }),
        db
          .update(patientSessionRequests)
          .set({ status: "confirmed", updatedAt: timestamp })
          .where(and(pending, sql`changes() = 1`))
          .returning({ id: patientSessionRequests.id }),
      ]);
      if (!results[0].length || !results[1].length)
        return {
          ok: false,
          message:
            "La sesión o solicitud cambió en otra ventana. Actualiza antes de continuar.",
        };
    }
  } catch {
    return {
      ok: false,
      message:
        "No pudimos confirmar el cambio. Puede coincidir con otra sesión, salir del periodo del paquete o necesitar detener la llamada. Revisa la ficha y vuelve a intentar.",
    };
  }
  refresh();
  return {
    ok: true,
    message:
      request.kind === "cancel"
        ? "Cancelación confirmada. No se ha aplicado ningún cobro automático."
        : "Sesión confirmada y guardada en ambos calendarios. No se ha iniciado ningún cobro.",
  };
}
