"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  deletePatientNote,
  type NoteState,
  savePatientNote,
} from "@/app/pro/pacientes/[patientId]/note-actions";
import {
  leaveWithUnsavedNotes,
  registerNoteNavigation,
} from "@/lib/practice/note-navigation";

export function NoteEditor({
  patientId,
  appointmentId,
  note,
  enabled = true,
}: {
  patientId: string;
  appointmentId: string | null;
  note?: { id: string; content: string; revision: number; updatedAt: string };
  enabled?: boolean;
}) {
  const labelId = useId();
  const [content, setContent] = useState(note?.content || "");
  const [saved, setSaved] = useState(note?.content || "");
  const [identity, setIdentity] = useState(() => ({
    id: note?.id || crypto.randomUUID(),
    revision: note?.revision || 0,
  }));
  const [state, setState] = useState<NoteState | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unsavedCount, setUnsavedCount] = useState(1);
  const [pending, startTransition] = useTransition();
  const dirty = content !== saved;
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const destination = useRef<string | null>(null);
  const operation = useRef(false);
  useEffect(() => {
    if (state && !state.ok && !pending && enabled) textarea.current?.focus();
  }, [state, pending, enabled]);
  useEffect(() => {
    if (!dirty) return;
    return registerNoteNavigation((href, count) => {
      destination.current = href;
      setUnsavedCount(count);
      leaveDialog.current?.showModal();
    });
  }, [dirty]);
  if (deleted) return <p role="status">Nota eliminada.</p>;
  async function save() {
    if (operation.current || !enabled || !dirty) return;
    operation.current = true;
    try {
      const result = await savePatientNote({
        patientId,
        appointmentId,
        ...identity,
        content,
      });
      setState(result);
      if (result.ok) {
        setIdentity({
          id: result.id || identity.id,
          revision: result.revision || identity.revision,
        });
        setSaved(content);
      }
    } catch {
      setState({
        ok: false,
        message:
          "No se confirmó el guardado. Tu texto permanece en esta ventana.",
      });
    } finally {
      operation.current = false;
    }
  }
  return (
    <form
      className="practice-form note-editor"
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(save);
      }}
      aria-busy={pending}
    >
      <label htmlFor={labelId}>
        {note ? "Tu nota privada" : "Nueva nota privada"}
      </label>
      <textarea
        ref={textarea}
        id={labelId}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={6}
        maxLength={12000}
        required
        disabled={!enabled || pending}
        aria-describedby={`${labelId}-save-status${state ? ` ${labelId}-feedback` : ""}`}
        placeholder="Un espacio privado para tus apuntes de la consulta…"
      />
      <div className="note-toolbar">
        <span className="hint" role="status" id={`${labelId}-save-status`}>
          {pending
            ? "Guardando…"
            : dirty
              ? "Cambios sin guardar"
              : identity.revision
                ? "Guardada"
                : "Solo para ti"}
        </span>
        <span className="hint">
          · {content.length.toLocaleString("es")} / 12.000
        </span>
        <button
          className="button human"
          disabled={!enabled || pending || !dirty}
          type="submit"
        >
          Guardar nota
        </button>
      </div>
      {state ? (
        <p
          id={`${labelId}-feedback`}
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "hint" : "form-error"}
        >
          {state.message}
        </p>
      ) : null}
      {!note && identity.revision > 0 ? (
        <button
          type="button"
          className="button secondary"
          disabled={pending || dirty}
          onClick={() => {
            setIdentity({ id: crypto.randomUUID(), revision: 0 });
            setContent("");
            setSaved("");
            setState(null);
            setConfirmDelete(false);
            textarea.current?.focus();
          }}
        >
          Escribir otra nota para esta sesión
        </button>
      ) : null}
      {identity.revision ? (
        <details
          onToggle={(event) => setConfirmDelete(event.currentTarget.open)}
        >
          <summary>Eliminar esta nota</summary>
          <p>La eliminación es permanente. Confirma para continuar.</p>
          <button
            type="button"
            className="button secondary"
            disabled={!enabled || pending || !confirmDelete}
            onClick={() =>
              startTransition(async () => {
                if (operation.current || !enabled || !confirmDelete) return;
                operation.current = true;
                try {
                  const result = await deletePatientNote(
                    patientId,
                    identity.id || "",
                    identity.revision || 0,
                  );
                  setState(result);
                  if (result.ok) {
                    setSaved(content);
                    setDeleted(true);
                  }
                } catch {
                  setState({
                    ok: false,
                    message:
                      "No se confirmó la eliminación. Actualiza antes de repetirla.",
                  });
                } finally {
                  operation.current = false;
                }
              })
            }
          >
            Confirmar eliminación
          </button>
        </details>
      ) : null}
      <dialog
        ref={leaveDialog}
        className="leave-note-dialog card"
        aria-labelledby={`${labelId}-leave`}
        onClose={() => textarea.current?.focus()}
      >
        <h3 id={`${labelId}-leave`}>
          {unsavedCount === 1
            ? "Tienes una nota sin guardar"
            : `Tienes ${unsavedCount} notas sin guardar`}
        </h3>
        <p>
          {unsavedCount === 1
            ? "Tu texto sigue en esta ventana. Vuelve a la nota y guárdala para conservarlo."
            : "Tus borradores siguen en esta ventana. Vuelve a las notas y guarda cada una antes de salir."}
        </p>
        <div className="panel-nav">
          <button
            type="button"
            className="button human"
            onClick={() => leaveDialog.current?.close()}
          >
            Seguir editando
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (!destination.current) return;
              leaveWithUnsavedNotes(destination.current);
            }}
          >
            Salir sin guardar
          </button>
        </div>
      </dialog>
    </form>
  );
}
