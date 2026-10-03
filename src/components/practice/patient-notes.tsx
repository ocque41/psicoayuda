import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { practiceNotes } from "@/db/notes-schema";
import { decryptNote, notesConfigured } from "@/lib/practice/note-crypto";
import { pageNumber } from "@/lib/practice/queries";
import { NoteEditor } from "./note-editor";
import { PracticePagination } from "./pagination";

export async function PatientNotes({
  patientId,
  professionalId,
  page,
}: {
  patientId: string;
  professionalId: string;
  page?: string;
}) {
  const enabled = notesConfigured();
  const where = and(
    eq(practiceNotes.patientId, patientId),
    eq(practiceNotes.professionalId, professionalId),
  );
  const [total] = await db
    .select({ value: count() })
    .from(practiceNotes)
    .where(where);
  const selected = Math.min(
    pageNumber(page),
    Math.max(1, Math.ceil(total.value / 10)),
  );
  const notes = enabled
    ? await db
        .select()
        .from(practiceNotes)
        .where(where)
        .orderBy(desc(practiceNotes.updatedAt), desc(practiceNotes.id))
        .limit(10)
        .offset((selected - 1) * 10)
    : [];
  const decoded = await Promise.all(
    notes.map(async (note) => {
      try {
        return {
          ...note,
          content: await decryptNote(
            note.ciphertext,
            professionalId,
            patientId,
            note.id,
          ),
        };
      } catch {
        return { ...note, content: null };
      }
    }),
  );
  return (
    <section className="card patient-notes" id="notas">
      <div className="workspace-section-heading">
        <div>
          <p className="eyebrow">Solo para ti</p>
          <h2>Notas de la consulta</h2>
        </div>
        <span className="badge">Espacio privado</span>
      </div>
      <p className="hint">
        Solo tú puedes leer estas notas desde tu cuenta profesional. Se guardan
        cifradas; el paciente y soporte no tienen acceso. Guarda antes de salir.
      </p>
      {!enabled ? (
        <p role="status">
          El almacenamiento privado de notas se está preparando. Podrás escribir
          aquí cuando esté disponible.
        </p>
      ) : (
        <details>
          <summary>Escribir una nota</summary>
          <NoteEditor patientId={patientId} />
        </details>
      )}
      {decoded.map((note) => (
        <details key={note.id}>
          <summary>
            Nota ·{" "}
            {new Intl.DateTimeFormat("es", {
              timeZone: "UTC",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(note.updatedAt))}{" "}
            UTC
          </summary>
          {note.content === null ? (
            <p role="alert">
              No pudimos abrir esta nota. Contacta a soporte sin compartir su
              contenido; no sobrescribas el registro.
            </p>
          ) : (
            <NoteEditor
              patientId={patientId}
              note={{
                id: note.id,
                content: note.content,
                revision: note.revision,
                updatedAt: note.updatedAt,
              }}
            />
          )}
        </details>
      ))}
      {enabled && !total.value ? (
        <p className="hint">
          Tus próximas notas aparecerán aquí, con su fecha y confirmación de
          guardado.
        </p>
      ) : null}
      <PracticePagination
        total={total.value}
        page={selected}
        pages={Math.max(1, Math.ceil(total.value / 10))}
        href={(number) => `/pro/pacientes/${patientId}?notas=${number}#notas`}
      />
    </section>
  );
}
