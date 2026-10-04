"use server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { session as authSession } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { notesConfigured } from "@/lib/practice/note-crypto";

export type NoteDraftAuthorizationInput = {
  accountId: string;
  professionalId: string;
  patientId: string;
  appointmentId: string | null;
  noteId: string;
  isNew: boolean;
};
export async function authorizeNoteDraft(
  input: NoteDraftAuthorizationInput,
): Promise<{ accountCurrent: boolean; scopeAllowed: boolean }> {
  const denied = { accountCurrent: false, scopeAllowed: false };
  const id = z.string().min(1).max(100);
  const parsed = z
    .object({
      accountId: id,
      professionalId: id,
      patientId: id,
      appointmentId: id.nullable(),
      noteId: id,
      isNew: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return denied;
  const current = await getServerSession();
  if (!current?.session.id || current.user.id !== parsed.data.accountId)
    return denied;
  const scope = parsed.data;
  const appointment = scope.appointmentId
    ? sql`EXISTS (SELECT 1 FROM practice_appointments appointment WHERE appointment.id=${scope.appointmentId} AND appointment.professional_id=p.id AND appointment.patient_id=patient.id)`
    : sql`${!scope.isNew}`;
  const association = scope.appointmentId
    ? sql`note.appointment_id=${scope.appointmentId}`
    : sql`note.appointment_id IS NULL`;
  const ownNote = sql`EXISTS (SELECT 1 FROM practice_notes note WHERE note.id=${scope.noteId} AND note.professional_id=p.id AND note.patient_id=patient.id AND ${association})`;
  const note = scope.isNew
    ? sql`(NOT EXISTS (SELECT 1 FROM practice_notes note WHERE note.id=${scope.noteId}) OR ${ownNote})`
    : ownNote;
  // Una consulta sin texto/ciphertext; sesión aún existente/no expirada y
  // propietario/rol/ficha/sesión/nota actuales. No promueve revisión del draft.
  const [row] = await db
    .select({
      allowed: sql<number>`EXISTS (SELECT 1 FROM professionals p JOIN practice_patients patient ON patient.professional_id=p.id WHERE p.id=${scope.professionalId} AND p.user_id=${scope.accountId} AND p.status='approved' AND coalesce(p.non_clinical_helper,0)=0 AND patient.id=${scope.patientId} AND patient.status!='closed' AND ${appointment} AND ${note})`,
    })
    .from(authSession)
    .where(
      and(
        eq(authSession.id, current.session.id),
        eq(authSession.userId, scope.accountId),
        gt(authSession.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return {
    accountCurrent: !!row,
    scopeAllowed: !!row && !!row.allowed && notesConfigured(),
  };
}
