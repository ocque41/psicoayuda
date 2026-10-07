"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { practiceNotes, session } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { decryptNote, notesConfigured } from "@/lib/practice/note-crypto";

export type NoteVersion = {
  id: string;
  revision: number;
  content: string;
  updatedAt: string;
};
export type NoteVersionInput = {
  accountId: string;
  professionalId: string;
  patientId: string;
  appointmentId: string | null;
  noteId: string;
};
export type NoteVersionResult =
  | { ok: true; version: NoteVersion }
  | {
      ok: false;
      message: string;
      accessDenied?: boolean;
      accountChanged?: boolean;
    };

/** Lectura explícita para resolver un conflicto. No escribe ni promueve CAS. */
export async function loadPatientNoteVersion(
  input: NoteVersionInput,
): Promise<NoteVersionResult> {
  const unavailable =
    "Esta nota ya no está disponible para tu cuenta. Conservamos el borrador temporal sin abrir la versión guardada.";
  const id = z.string().min(1).max(100);
  const parsed = z
    .object({
      accountId: id,
      professionalId: id,
      patientId: id,
      appointmentId: id.nullable(),
      noteId: id,
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, message: unavailable, accessDenied: true };
  try {
    const current = await getServerSession();
    const scope = parsed.data;
    if (!current?.session?.id || current.user.id !== scope.accountId)
      return {
        ok: false,
        message: unavailable,
        accessDenied: true,
        accountChanged: true,
      };
    if (!notesConfigured()) throw new Error("Notes unavailable");
    const liveSession = sql`EXISTS (SELECT 1 FROM session auth_session WHERE auth_session.id=${current.session.id} AND auth_session.user_id=${scope.accountId} AND auth_session.expires_at > cast(unixepoch('subsecond') * 1000 as integer))`;
    const actor = sql`EXISTS (SELECT 1 FROM professionals actor JOIN practice_patients patient ON patient.professional_id=actor.id WHERE actor.id=${scope.professionalId} AND actor.user_id=${scope.accountId} AND actor.status='approved' AND coalesce(actor.non_clinical_helper,0)=0 AND patient.id=${scope.patientId} AND patient.status!='closed')`;
    const appointment = scope.appointmentId
      ? sql`EXISTS (SELECT 1 FROM practice_appointments appointment WHERE appointment.id=${scope.appointmentId} AND appointment.professional_id=${scope.professionalId} AND appointment.patient_id=${scope.patientId})`
      : sql`1`;
    const allowed = and(
      eq(practiceNotes.id, scope.noteId),
      eq(practiceNotes.professionalId, scope.professionalId),
      eq(practiceNotes.patientId, scope.patientId),
      scope.appointmentId
        ? eq(practiceNotes.appointmentId, scope.appointmentId)
        : isNull(practiceNotes.appointmentId),
      liveSession,
      actor,
      appointment,
    );
    const denied = async (): Promise<NoteVersionResult> => {
      const [live] = await db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.id, current.session.id),
            eq(session.userId, scope.accountId),
            liveSession,
          ),
        )
        .limit(1);
      return {
        ok: false,
        message: unavailable,
        accessDenied: true,
        accountChanged: !live,
      };
    };
    const [row] = await db
      .select({
        id: practiceNotes.id,
        revision: practiceNotes.revision,
        ciphertext: practiceNotes.ciphertext,
        updatedAt: practiceNotes.updatedAt,
      })
      .from(practiceNotes)
      .where(allowed)
      .limit(1);
    if (!row) return await denied();
    const content = await decryptNote(
      row.ciphertext,
      scope.professionalId,
      scope.patientId,
      row.id,
    );
    // El descifrado es asíncrono: comprueba permiso y la misma fila al terminar.
    const [stable] = await db
      .select({ id: practiceNotes.id })
      .from(practiceNotes)
      .where(
        and(
          allowed,
          eq(practiceNotes.revision, row.revision),
          eq(practiceNotes.ciphertext, row.ciphertext),
          eq(practiceNotes.updatedAt, row.updatedAt),
        ),
      )
      .limit(1);
    if (!stable) {
      const [accessible] = await db
        .select({ id: practiceNotes.id })
        .from(practiceNotes)
        .where(allowed)
        .limit(1);
      if (!accessible) return await denied();
      return {
        ok: false,
        message:
          "La nota volvió a cambiar mientras la consultábamos. Reintenta; tu borrador sigue aquí.",
      };
    }
    return {
      ok: true,
      version: {
        id: row.id,
        revision: row.revision,
        updatedAt: row.updatedAt,
        content,
      },
    };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos consultar la versión guardada. Tu borrador sigue aquí; revisa la conexión y reintenta.",
    };
  }
}
