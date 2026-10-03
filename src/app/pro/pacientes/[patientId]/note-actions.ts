"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { practiceNotes } from "@/db/notes-schema";
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
};
export async function savePatientNote(data: {
  patientId: string;
  id?: string;
  revision?: number;
  content: string;
}): Promise<NoteState> {
  const pro = await requirePracticeProfessional();
  const parsed = z
    .object({
      patientId: z.string().min(1).max(100),
      id: z.string().max(100).optional(),
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
  if (!(await ownedPatient(input.patientId, pro.id)))
    return { ok: false, message: "No tienes acceso a esta ficha." };
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
            eq(practiceNotes.revision, input.revision || 1),
          ),
        )
        .returning({ id: practiceNotes.id });
      if (!changed.length)
        return {
          ok: false,
          message:
            "Esta nota cambió en otra ventana. Conserva tu texto y actualiza la página antes de reemplazarlo.",
        };
    } else {
      const inserted = await db
        .insert(practiceNotes)
        .values({
          id,
          professionalId: pro.id,
          patientId: input.patientId,
          ciphertext,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({ id: practiceNotes.id });
      if (!inserted.length) {
        const existing = await db.query.practiceNotes.findFirst({
          where: and(
            eq(practiceNotes.id, id),
            eq(practiceNotes.patientId, input.patientId),
            eq(practiceNotes.professionalId, pro.id),
          ),
        });
        if (
          !existing ||
          (await decryptNote(
            existing.ciphertext,
            pro.id,
            input.patientId,
            id,
          )) !== input.content
        )
          return {
            ok: false,
            message:
              "La nota ya existe con otro contenido. Conserva tu texto y actualiza antes de reemplazarla.",
          };
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
  if (!(await ownedPatient(patientId, pro.id)))
    return { ok: false, message: "No tienes acceso a esta ficha." };
  const removed = await db
    .delete(practiceNotes)
    .where(
      and(
        eq(practiceNotes.id, noteId),
        eq(practiceNotes.patientId, patientId),
        eq(practiceNotes.professionalId, pro.id),
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
