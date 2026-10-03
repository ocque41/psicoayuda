"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  deletePatientNote,
  type NoteState,
  savePatientNote,
} from "@/app/pro/pacientes/[patientId]/note-actions";

export function NoteEditor({
  patientId,
  note,
  enabled = true,
}: {
  patientId: string;
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
  const [pending, startTransition] = useTransition();
  const dirty = content !== saved;
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const destination = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    const guardLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        leaving.current
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const next = new URL(anchor.href, window.location.href);
      if (
        next.origin !== location.origin ||
        (next.pathname === location.pathname && next.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      destination.current = next.href;
      leaveDialog.current?.showModal();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);
  if (deleted) return <p role="status">Nota eliminada.</p>;
  async function save() {
    try {
      const result = await savePatientNote({ patientId, ...identity, content });
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
    }
  }
  return (
    <form
      className="practice-form note-editor"
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
        id={labelId}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={6}
        maxLength={12000}
        required
        disabled={!enabled || pending}
        placeholder="Un espacio privado para tus apuntes de la consulta…"
      />
      <div className="note-toolbar">
        <span className="hint" role="status">
          {pending
            ? "Guardando…"
            : dirty
              ? "Cambios sin guardar"
              : identity.revision
                ? "Guardada"
                : "Solo para ti"}{" "}
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
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "hint" : "form-error"}
        >
          {state.message}
        </p>
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
            disabled={pending || !confirmDelete}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await deletePatientNote(
                    patientId,
                    identity.id || "",
                    identity.revision || 0,
                  );
                  setState(result);
                  if (result.ok) setDeleted(true);
                } catch {
                  setState({
                    ok: false,
                    message:
                      "No se confirmó la eliminación. Actualiza antes de repetirla.",
                  });
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
      >
        <h3 id={`${labelId}-leave`}>Tienes una nota sin guardar</h3>
        <p>
          Tu texto sigue en esta ventana. Vuelve a la nota y guárdala para
          conservarlo.
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
              leaving.current = true;
              window.location.assign(destination.current);
            }}
          >
            Salir sin guardar
          </button>
        </div>
      </dialog>
    </form>
  );
}
