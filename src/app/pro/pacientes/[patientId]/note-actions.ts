"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { practiceNotes } from "@/db/notes-schema";
import { practiceAppointments, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import {
  ownedPatient,
  requirePracticeProfessional,
} from "@/lib/practice/access";
import { decryptNote, encryptNote } from "@/lib/practice/note-crypto";

export type NoteState = {
  ok: boolean;
  message: string;
  id?: string;
  revision?: number;
  conflict?: boolean;
};
function currentActor(
  professionalId: string,
  userId: string,
  patientId: string,
  sessionId: string,
) {
  return sql`EXISTS (
    SELECT 1 FROM professionals p
    JOIN practice_patients patient ON patient.professional_id = p.id
    WHERE p.id = ${professionalId} AND p.user_id = ${userId}
      AND p.status = 'approved' AND coalesce(p.non_clinical_helper, 0) = 0
      AND patient.id = ${patientId}
      AND EXISTS (SELECT 1 FROM session auth_session
        WHERE auth_session.id = ${sessionId} AND auth_session.user_id = ${userId}
          AND auth_session.expires_at > cast(unixepoch('subsecond') * 1000 as integer))
  )`;
}
function currentNoteSession() {
  return sql`(${practiceNotes.appointmentId} IS NULL OR EXISTS (
    SELECT 1 FROM practice_appointments appointment
    WHERE appointment.id = ${practiceNotes.appointmentId}
      AND appointment.patient_id = ${practiceNotes.patientId}
      AND appointment.professional_id = ${practiceNotes.professionalId}
  ))`;
}
export async function savePatientNote(data: {
  patientId: string;
  appointmentId?: string | null;
  id?: string;
  revision?: number;
  content: string;
}): Promise<NoteState> {
  const pro = await requirePracticeProfessional();
  const current = await getServerSession();
  if (!current?.session?.id || current.user.id !== pro.userId)
    return {
      ok: false,
      message:
        "Tu sesión ya no está disponible. Vuelve a entrar antes de guardar cambios.",
    };
  const sessionId = current.session.id;
  const parsed = z
    .object({
      patientId: z.string().min(1).max(100),
      appointmentId: z.string().min(1).max(100).nullable().optional(),
      id: z.string().min(1).max(100).optional(),
      revision: z.number().int().min(0).optional(),
      content: z
        .string()
        .trim()
        .min(1, "Escribe algo antes de guardar.")
        .max(12000, "La nota admite hasta 12.000 caracteres."),
    })
    .safeParse(data);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  const input = parsed.data;
  if (input.revision && !input.id)
    return {
      ok: false,
      message: "Para editar una nota, conserva su identificador y revisión.",
    };
  if (!(await ownedPatient(input.patientId, pro.id)))
    return { ok: false, message: "No tienes acceso a esta ficha." };
  const appointmentId = input.appointmentId ?? null;
  if (appointmentId) {
    const appointment = await db.query.practiceAppointments.findFirst({
      where: and(
        eq(practiceAppointments.id, appointmentId),
        eq(practiceAppointments.professionalId, pro.id),
        eq(practiceAppointments.patientId, input.patientId),
      ),
      columns: { id: true },
    });
    if (!appointment)
      return { ok: false, message: "Elige una sesión propia de esta ficha." };
  } else if (!(input.id && input.revision)) {
    return {
      ok: false,
      message: "Elige una sesión antes de escribir una nota nueva.",
    };
  }
  const id = input.id || crypto.randomUUID();
  const timestamp = new Date().toISOString();
  try {
    const ciphertext = await encryptNote(
      input.content,
      pro.id,
      input.patientId,
      id,
    );
    if (input.id && input.revision) {
      const changed = await db
        .update(practiceNotes)
        .set({
          ciphertext,
          revision: (input.revision || 1) + 1,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(practiceNotes.id, id),
            eq(practiceNotes.patientId, input.patientId),
            eq(practiceNotes.professionalId, pro.id),
            currentActor(pro.id, pro.userId, input.patientId, sessionId),
            currentNoteSession(),
            appointmentId
              ? eq(practiceNotes.appointmentId, appointmentId)
              : isNull(practiceNotes.appointmentId),
            eq(practiceNotes.revision, input.revision || 1),
          ),
        )
        .returning({ id: practiceNotes.id });
      if (!changed.length) {
        // Una respuesta perdida puede dejar el cliente en la revisión anterior.
        // Solo confirma el mismo contenido en la revisión inmediata: no escribe
        // ni convierte una edición antigua en permiso para pisar otra ventana.
        const existing = await db.query.practiceNotes.findFirst({
          where: and(
            eq(practiceNotes.id, id),
            eq(practiceNotes.patientId, input.patientId),
            eq(practiceNotes.professionalId, pro.id),
            eq(practiceNotes.revision, input.revision + 1),
            currentActor(pro.id, pro.userId, input.patientId, sessionId),
            currentNoteSession(),
            appointmentId
              ? eq(practiceNotes.appointmentId, appointmentId)
              : isNull(practiceNotes.appointmentId),
          ),
        });
        if (
          existing &&
          (await decryptNote(
            existing.ciphertext,
            pro.id,
            input.patientId,
            id,
          )) === input.content
        ) {
          revalidatePath(`/pro/pacientes/${input.patientId}`);
          return {
            ok: true,
            id,
            revision: existing.revision,
            message: "Nota guardada en tu espacio privado.",
          };
        }
        return {
          ok: false,
          conflict: true,
          message:
            "Esta nota cambió en otra ventana. Tu borrador se conserva; consulta la versión guardada antes de continuar.",
        };
      }
    } else {
      const inserted = await db
        .insert(practiceNotes)
        .select(
          db
            .select({
              id: sql<string>`${id}`.as("id"),
              professionalId: sql<string>`${pro.id}`.as("professional_id"),
              patientId: sql<string>`${input.patientId}`.as("patient_id"),
              appointmentId: sql<string | null>`${appointmentId}`.as(
                "appointment_id",
              ),
              ciphertext: sql<string>`${ciphertext}`.as("ciphertext"),
              revision: sql<number>`1`.as("revision"),
              createdAt: sql<string>`${timestamp}`.as("created_at"),
              updatedAt: sql<string>`${timestamp}`.as("updated_at"),
            })
            .from(professionals)
            .where(
              and(
                eq(professionals.id, pro.id),
                currentActor(pro.id, pro.userId, input.patientId, sessionId),
                sql`EXISTS (SELECT 1 FROM practice_appointments appointment
              WHERE appointment.id = ${appointmentId}
                AND appointment.patient_id = ${input.patientId}
                AND appointment.professional_id = ${pro.id})`,
              ),
            ),
        )
        .onConflictDoNothing()
        .returning({ id: practiceNotes.id });
      if (!inserted.length) {
        const existing = await db.query.practiceNotes.findFirst({
          where: and(
            eq(practiceNotes.id, id),
            eq(practiceNotes.patientId, input.patientId),
            eq(practiceNotes.professionalId, pro.id),
            currentActor(pro.id, pro.userId, input.patientId, sessionId),
            currentNoteSession(),
          ),
        });
        if (
          !existing ||
          existing.appointmentId !== appointmentId ||
          (await decryptNote(
            existing.ciphertext,
            pro.id,
            input.patientId,
            id,
          )) !== input.content
        )
          return {
            ok: false,
            conflict: true,
            message:
              "La nota ya existe con otro contenido. Tu borrador se conserva; consulta la versión guardada antes de continuar.",
          };
        revalidatePath(`/pro/pacientes/${input.patientId}`);
        return {
          ok: true,
          id,
          revision: existing.revision,
          message: "Nota guardada en tu espacio privado.",
        };
      }
    }
    revalidatePath(`/pro/pacientes/${input.patientId}`);
    return {
      ok: true,
      id,
      revision: (input.revision || 0) + 1,
      message: "Nota guardada en tu espacio privado.",
    };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos confirmar el guardado. Tu texto sigue aquí; comprueba la conexión y vuelve a intentar.",
    };
  }
}
export async function deletePatientNote(
  patientId: string,
  noteId: string,
  revision: number,
): Promise<NoteState> {
  const pro = await requirePracticeProfessional();
  const current = await getServerSession();
  if (!current?.session?.id || current.user.id !== pro.userId)
    return {
      ok: false,
      message:
        "Tu sesión ya no está disponible. Vuelve a entrar antes de guardar cambios.",
    };
  const sessionId = current.session.id;
  if (!(await ownedPatient(patientId, pro.id)))
    return { ok: false, message: "No tienes acceso a esta ficha." };
  const removed = await db
    .delete(practiceNotes)
    .where(
      and(
        eq(practiceNotes.id, noteId),
        eq(practiceNotes.patientId, patientId),
        eq(practiceNotes.professionalId, pro.id),
        currentActor(pro.id, pro.userId, patientId, sessionId),
        currentNoteSession(),
        eq(practiceNotes.revision, revision),
      ),
    )
    .returning({ id: practiceNotes.id });
  if (!removed.length)
    return {
      ok: false,
      message: "La nota cambió. Actualiza la página antes de eliminarla.",
    };
  revalidatePath(`/pro/pacientes/${patientId}`);
  return { ok: true, message: "Nota eliminada." };
}
