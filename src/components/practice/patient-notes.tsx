import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lt,
} from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { practiceNotes } from "@/db/notes-schema";
import { practiceAppointments } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import {
  appointmentStateLabels,
  dateLabel,
  localToUtc,
} from "@/lib/practice/domain";
import { decryptNote, notesConfigured } from "@/lib/practice/note-crypto";
import { pageNumber } from "@/lib/practice/queries";
import { sessionNotesReminders } from "@/lib/practice/session-notes-reminder";
import { NoteEditor } from "./note-editor";
import { PracticePagination } from "./pagination";
import { SessionNoteEntry } from "./session-note-entry";
import { SessionNotesReminder } from "./session-notes-reminder";

type NotesQuery = {
  notas?: string;
  notaSesion?: string;
  encuentro?: string;
  anteriores?: string;
  encuentrosPagina?: string;
};
export async function PatientNotes({
  patientId,
  professionalId,
  timeZone,
  query = {},
}: {
  patientId: string;
  professionalId: string;
  timeZone: string;
  query?: NotesQuery;
}) {
  const enabled = notesConfigured();
  const owner = and(
    eq(practiceNotes.patientId, patientId),
    eq(practiceNotes.professionalId, professionalId),
  );
  const sessionOwner = and(
    eq(practiceAppointments.patientId, patientId),
    eq(practiceAppointments.professionalId, professionalId),
  );
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.encuentro || "")
    ? query.encuentro || ""
    : "";
  const start = date ? localToUtc(`${date}T00:00`, timeZone) : null;
  const nextDay = start
    ? new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
        .toISOString()
        .slice(0, 10)
    : "";
  const end = nextDay ? localToUtc(`${nextDay}T00:00`, timeZone) : null;
  const invalidDate = !!query.encuentro && !(start && end);
  const dateFilter =
    start && end
      ? and(
          gte(practiceAppointments.startsAt, start),
          lt(practiceAppointments.startsAt, end),
        )
      : undefined;
  const sessionsWhere = and(sessionOwner, dateFilter);
  const notesWhere = and(
    owner,
    sessionOwner,
    dateFilter,
    query.notaSesion
      ? eq(practiceNotes.appointmentId, query.notaSesion)
      : undefined,
  );
  const legacyWhere = and(owner, isNull(practiceNotes.appointmentId));
  const [
    [noteCount],
    [sessionCount],
    [legacyCount],
    appointment,
    currentSession,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(practiceNotes)
      .innerJoin(
        practiceAppointments,
        eq(practiceNotes.appointmentId, practiceAppointments.id),
      )
      .where(notesWhere),
    db
      .select({ value: count() })
      .from(practiceAppointments)
      .where(sessionsWhere),
    db.select({ value: count() }).from(practiceNotes).where(legacyWhere),
    query.notaSesion
      ? db.query.practiceAppointments.findFirst({
          where: and(
            sessionOwner,
            eq(practiceAppointments.id, query.notaSesion),
          ),
        })
      : Promise.resolve(undefined),
    enabled ? getServerSession() : Promise.resolve(null),
  ]);
  const pages = (total: number) => Math.max(1, Math.ceil(total / 10));
  const selected = Math.min(pageNumber(query.notas), pages(noteCount.value));
  const legacyPage = Math.min(
    pageNumber(query.anteriores),
    pages(legacyCount.value),
  );
  const sessionPage = Math.min(
    pageNumber(query.encuentrosPagina),
    pages(sessionCount.value),
  );
  const [notes, legacy, sessions] = await Promise.all([
    enabled
      ? db
          .select({
            ...getTableColumns(practiceNotes),
            startsAt: practiceAppointments.startsAt,
            status: practiceAppointments.status,
          })
          .from(practiceNotes)
          .innerJoin(
            practiceAppointments,
            eq(practiceNotes.appointmentId, practiceAppointments.id),
          )
          .where(notesWhere)
          .orderBy(
            desc(practiceAppointments.startsAt),
            desc(practiceNotes.createdAt),
            desc(practiceNotes.id),
          )
          .limit(10)
          .offset((selected - 1) * 10)
      : Promise.resolve([]),
    enabled
      ? db
          .select()
          .from(practiceNotes)
          .where(legacyWhere)
          .orderBy(desc(practiceNotes.updatedAt), desc(practiceNotes.id))
          .limit(10)
          .offset((legacyPage - 1) * 10)
      : Promise.resolve([]),
    db
      .select()
      .from(practiceAppointments)
      .where(sessionsWhere)
      .orderBy(
        desc(practiceAppointments.startsAt),
        desc(practiceAppointments.id),
      )
      .limit(10)
      .offset((sessionPage - 1) * 10),
  ]);
  function href(changes: Partial<NotesQuery>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes }))
      if (value) params.set(key, value);
    return `/pro/pacientes/${patientId}?${params}#notas`;
  }
  async function editor(note: typeof practiceNotes.$inferSelect) {
    try {
      const content = await decryptNote(
        note.ciphertext,
        professionalId,
        patientId,
        note.id,
      );
      return (
        <NoteEditor
          accountId={currentSession?.user.id || ""}
          professionalId={professionalId}
          patientId={patientId}
          appointmentId={note.appointmentId}
          note={{
            id: note.id,
            content,
            revision: note.revision,
            updatedAt: note.updatedAt,
          }}
        />
      );
    } catch {
      return (
        <p role="alert">
          No pudimos abrir esta nota. Contacta a soporte sin compartir su
          contenido; no sobrescribas el registro.
        </p>
      );
    }
  }
  const [decoded, decodedLegacy] = await Promise.all([
    Promise.all(notes.map(editor)),
    Promise.all(legacy.map(editor)),
  ]);
  const reminderIds = appointment
    ? [appointment.id]
    : sessions.map((session) => session.id);
  const reminders = currentSession?.user.id
    ? await sessionNotesReminders({
        professionalId,
        professionalUserId: currentSession.user.id,
        patientId,
        appointmentIds: reminderIds,
      })
    : [];
  return (
    <section className="card patient-notes" id="notas">
      <div className="workspace-section-heading">
        <div>
          <p className="eyebrow">Solo para ti</p>
          <h2>Notas por sesión</h2>
        </div>
        <span className="badge">Espacio privado</span>
      </div>
      <p className="hint">
        Solo tú puedes leer estas notas desde tu cuenta profesional. Se guardan
        cifradas; el paciente y soporte no tienen acceso. Guarda antes de salir.
      </p>
      {reminders.map((reminder) => (
        <SessionNotesReminder
          key={reminder.appointmentId}
          reminder={reminder}
          endedLabel={dateLabel(reminder.endsAt, timeZone)}
        />
      ))}
      <form
        className="practice-form"
        method="get"
        action={`/pro/pacientes/${patientId}#notas`}
        data-note-navigation
      >
        <label>
          Fecha del encuentro en {timeZone}
          <input type="date" name="encuentro" defaultValue={date} />
        </label>
        <button className="button secondary" type="submit">
          Filtrar por fecha
        </button>
        <Link
          href={href({
            encuentro: undefined,
            notaSesion: undefined,
            notas: undefined,
            encuentrosPagina: undefined,
          })}
        >
          Ver todos los encuentros
        </Link>
      </form>
      {invalidDate ? (
        <p role="alert">
          No pudimos interpretar esa fecha en la zona de tu consulta. Se
          muestran todos los encuentros.
        </p>
      ) : null}
      <h3>Elegir sesión</h3>
      <p className="hint">
        Abre un encuentro para escribir sus notas. Puedes guardar varias notas y
        consultar sesiones realizadas o canceladas.
      </p>
      {sessions.map((session) => (
        <p key={session.id}>
          <Link
            href={href({
              notaSesion: session.id,
              notas: undefined,
              encuentro: undefined,
            })}
            prefetch={false}
          >
            Abrir notas · {dateLabel(session.startsAt, timeZone)} ·{" "}
            {appointmentStateLabels[session.status]}
          </Link>
        </p>
      ))}
      {!sessions.length ? (
        <p className="hint">
          No hay sesiones para esta fecha. Programa una sesión en la ficha para
          escribir su primera nota.
        </p>
      ) : null}
      <PracticePagination
        total={sessionCount.value}
        page={sessionPage}
        pages={pages(sessionCount.value)}
        href={(n) => href({ encuentrosPagina: String(n) })}
        prefetch={false}
      />
      {query.notaSesion && !appointment ? (
        <p role="alert">
          Esta sesión no está disponible en tu ficha. Elige uno de tus
          encuentros.
        </p>
      ) : null}
      {appointment ? (
        <h3>
          Encuentro · {dateLabel(appointment.startsAt, timeZone)} ·{" "}
          {appointmentStateLabels[appointment.status]}
        </h3>
      ) : (
        <h3>Notas de todos los encuentros</h3>
      )}
      {!enabled ? (
        <p role="status">
          El almacenamiento privado de notas se está preparando. Podrás escribir
          aquí cuando esté disponible.
        </p>
      ) : appointment ? (
        <SessionNoteEntry key={`new-${appointment.id}`}>
          <NoteEditor
            accountId={currentSession?.user.id || ""}
            professionalId={professionalId}
            patientId={patientId}
            appointmentId={appointment.id}
            focusOnEntry
          />
        </SessionNoteEntry>
      ) : (
        <p className="hint">Elige una sesión para escribir una nota nueva.</p>
      )}
      {notes.map((note, index) => (
        <details key={note.id}>
          <summary>
            Sesión · {dateLabel(note.startsAt, timeZone)} ·{" "}
            {appointmentStateLabels[note.status]}
          </summary>
          <p className="hint">
            Último guardado: {dateLabel(note.updatedAt, timeZone)}
          </p>
          {decoded[index]}
        </details>
      ))}
      {enabled && !noteCount.value ? (
        <p className="hint">
          Todavía no hay notas{" "}
          {appointment ? "para esta sesión" : "en estos encuentros"}. Tus notas
          guardadas aparecerán aquí.
        </p>
      ) : null}
      <PracticePagination
        total={noteCount.value}
        page={selected}
        pages={pages(noteCount.value)}
        href={(n) => href({ notas: String(n) })}
        prefetch={false}
      />
      <h3>Notas anteriores sin sesión</h3>
      <p className="hint">
        Estas notas se guardaron antes de organizar los apuntes por sesión.
        Conservan su contenido y no se han asignado a ningún encuentro.
      </p>
      {legacy.map((note, index) => (
        <details key={note.id}>
          <summary>
            Nota anterior · {dateLabel(note.updatedAt, timeZone)}
          </summary>
          {decodedLegacy[index]}
        </details>
      ))}
      {enabled && !legacyCount.value ? (
        <p className="hint">No tienes notas anteriores sin sesión.</p>
      ) : null}
      <PracticePagination
        total={legacyCount.value}
        page={legacyPage}
        pages={pages(legacyCount.value)}
        href={(n) => href({ anteriores: String(n) })}
        prefetch={false}
      />
    </section>
  );
}
