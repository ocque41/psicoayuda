import "server-only";
import {
  and,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { practiceNotes } from "@/db/notes-schema";
import {
  practiceAppointments,
  practicePatients,
  professionals,
} from "@/db/schema";
import { notesConfigured } from "./note-crypto";

export type SessionNotesReminderView = {
  appointmentId: string;
  patientId: string;
  endsAt: string;
  href: string;
  title: string;
  body: string;
};

// No reactivar encuentros históricos al volver a entrar a la consulta.
export const SESSION_NOTES_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Proyección mínima compartible con el transporte de avisos. Nunca lee texto,
 * ciphertext, nombre, correo ni contacto. El transporte aún debe verificar su
 * opt-in vigente y volver a consultar esta elegibilidad antes de entregar. */
export async function sessionNotesReminders({
  professionalId,
  professionalUserId,
  patientId,
  appointmentIds,
  now = Date.now(),
}: {
  professionalId: string;
  professionalUserId: string;
  patientId: string;
  appointmentIds: string[];
  now?: number;
}): Promise<SessionNotesReminderView[]> {
  if (
    !notesConfigured() ||
    !professionalUserId ||
    !Number.isFinite(now) ||
    appointmentIds.length === 0 ||
    appointmentIds.length > 25
  )
    return [];
  if (
    !Number.isFinite(new Date(now).getTime()) ||
    !Number.isFinite(new Date(now - SESSION_NOTES_REMINDER_WINDOW_MS).getTime())
  )
    return [];
  const cutoff = new Date(now - SESSION_NOTES_REMINDER_WINDOW_MS).toISOString();
  const at = new Date(now).toISOString();
  const rows = await db
    .select({
      appointmentId: practiceAppointments.id,
      patientId: practiceAppointments.patientId,
      startsAt: practiceAppointments.startsAt,
      endsAt: practiceAppointments.endsAt,
      status: practiceAppointments.status,
    })
    .from(practiceAppointments)
    .innerJoin(
      professionals,
      eq(professionals.id, practiceAppointments.professionalId),
    )
    .innerJoin(
      practicePatients,
      and(
        eq(practicePatients.id, practiceAppointments.patientId),
        eq(
          practicePatients.professionalId,
          practiceAppointments.professionalId,
        ),
      ),
    )
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.userId, professionalUserId),
        eq(professionals.status, "approved"),
        sql`coalesce(${professionals.nonClinicalHelper}, 0) = 0`,
        eq(practicePatients.id, patientId),
        ne(practicePatients.status, "closed"),
        inArray(practiceAppointments.id, [...new Set(appointmentIds)]),
        inArray(practiceAppointments.status, ["scheduled", "completed"]),
        lt(practiceAppointments.startsAt, practiceAppointments.endsAt),
        gte(practiceAppointments.endsAt, cutoff),
        lte(practiceAppointments.endsAt, at),
        notExists(
          db
            .select({ id: practiceNotes.id })
            .from(practiceNotes)
            .where(
              and(
                eq(practiceNotes.appointmentId, practiceAppointments.id),
                eq(practiceNotes.professionalId, professionalId),
                eq(practiceNotes.patientId, patientId),
              ),
            ),
        ),
      ),
    )
    .limit(25);
  return rows.flatMap((row) => {
    const start = Date.parse(row.startsAt);
    const end = Date.parse(row.endsAt);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      end > now ||
      end < now - SESSION_NOTES_REMINDER_WINDOW_MS
    )
      return [];
    return [
      {
        appointmentId: row.appointmentId,
        patientId: row.patientId,
        endsAt: row.endsAt,
        href: `/pro/pacientes/${encodeURIComponent(row.patientId)}?notaSesion=${encodeURIComponent(row.appointmentId)}#notas`,
        title:
          row.status === "completed"
            ? "Tu sesión terminó"
            : "El horario de tu sesión terminó",
        body:
          row.status === "completed"
            ? "¿Quieres dejar tus apuntes? Las notas de este encuentro tienen su propio espacio privado."
            : "Si el encuentro se realizó, puedes dejar sus apuntes en el espacio privado de esta sesión.",
      },
    ];
  });
}
