"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  deletePatientNote,
  type NoteState,
  savePatientNote,
} from "@/app/pro/pacientes/[patientId]/note-actions";
import { authorizeNoteDraft } from "@/app/pro/pacientes/[patientId]/note-draft-actions";
import {
  clearNoteDrafts,
  forgetNoteDraft,
  noteDraftGeneration,
  noteDraftKey,
  noteDraftMetadata,
  readNoteDraft,
  rememberNoteDraft,
  subscribeNoteDrafts,
} from "@/lib/practice/note-drafts";
import {
  leaveWithUnsavedNotes,
  registerNoteNavigation,
} from "@/lib/practice/note-navigation";

type NoteEditorProps = {
  accountId: string;
  professionalId: string;
  patientId: string;
  appointmentId: string | null;
  note?: { id: string; content: string; revision: number; updatedAt: string };
  enabled?: boolean;
};
export function NoteEditor(props: NoteEditorProps) {
  return (
    <ScopedNoteEditor
      key={JSON.stringify([
        props.accountId,
        props.professionalId,
        props.patientId,
        props.appointmentId,
        props.note?.id ?? null,
      ])}
      {...props}
    />
  );
}
function ScopedNoteEditor({
  accountId,
  professionalId,
  patientId,
  appointmentId,
  note,
  enabled = true,
}: NoteEditorProps) {
  const scope = useMemo(
    () => ({
      accountId,
      professionalId,
      patientId,
      appointmentId,
      slot: note?.id ?? null,
    }),
    [accountId, professionalId, patientId, appointmentId, note?.id],
  );
  const draftKey = noteDraftKey(scope);
  const labelId = useId();
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
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
  const mountGeneration = useRef(0);
  useEffect(
    () => () => {
      mountGeneration.current++;
    },
    [],
  );
  const baseline = useRef({
    content: note?.content || "",
    saved: note?.content || "",
    ...identity,
  });
  const authorizationGeneration = useRef(-1);
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [draftNotice, setDraftNotice] = useState("");
  const canEdit = enabled && ready && authorized;
  useEffect(
    () =>
      subscribeNoteDrafts((notice) => {
        if (notice.type === "session") {
          authorizationGeneration.current = -1;
          setContent("");
          setSaved("");
          setAuthorized(false);
          setReady(true);
          setState(null);
          setDraftNotice(
            "El acceso de tu cuenta cambió. Los borradores temporales se retiraron de esta ventana. Actualiza la ficha para volver a entrar.",
          );
        } else if (notice.key === draftKey)
          setDraftNotice(
            "El borrador permanece en el editor, pero ya no se recuperará al cambiar de ficha. Guárdalo antes de salir.",
          );
      }),
    [draftKey],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt fuerza una nueva comprobación solicitada por el usuario.
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setAuthorized(false);
    const epoch = noteDraftGeneration();
    const metadata = noteDraftMetadata(scope);
    void (async () => {
      let result: Awaited<ReturnType<typeof authorizeNoteDraft>>;
      try {
        result = await authorizeNoteDraft({
          ...scope,
          noteId: metadata?.id || baseline.current.id,
          isNew: scope.slot === null,
        });
      } catch {
        if (!disposed && epoch === noteDraftGeneration()) {
          setReady(true);
          setDraftNotice(
            "No pudimos comprobar el acceso. El borrador temporal no se ha abierto; vuelve a intentar con conexión.",
          );
        }
        return;
      }
      if (disposed || epoch !== noteDraftGeneration()) return;
      if (!result.accountCurrent) {
        clearNoteDrafts();
        return;
      }
      if (!result.scopeAllowed) {
        forgetNoteDraft(scope);
        setContent("");
        setSaved("");
        setReady(true);
        setDraftNotice(
          "Esta nota o ficha ya no está disponible para tu cuenta. No se recuperó ningún texto.",
        );
        return;
      }
      const draft = readNoteDraft(scope, epoch);
      const initial = draft || baseline.current;
      authorizationGeneration.current = epoch;
      setContent(initial.content);
      setSaved(initial.saved);
      setIdentity({ id: initial.id, revision: initial.revision });
      setAuthorized(true);
      setReady(true);
      setDraftNotice(
        draft
          ? "Recuperamos tu borrador temporal. Guarda para confirmar los cambios; si la nota cambió en otra ventana, te avisaremos."
          : metadata
            ? "El borrador temporal caducó. Actualiza la ficha para consultar lo último que se guardó."
            : "",
      );
    })();
    return () => {
      disposed = true;
    };
  }, [scope, attempt]);
  useEffect(() => {
    if (state && !state.ok && !pending && canEdit) textarea.current?.focus();
  }, [state, pending, canEdit]);
  useEffect(() => {
    if (!dirty || !authorized) return;
    return registerNoteNavigation((href, count) => {
      destination.current = href;
      setUnsavedCount(count);
      leaveDialog.current?.showModal();
    }, draftKey);
  }, [dirty, authorized, draftKey]);
  if (deleted) return <p role="status">Nota eliminada.</p>;
  async function save() {
    if (operation.current || !canEdit || !dirty) return;
    operation.current = true;
    const epoch = authorizationGeneration.current;
    const mount = mountGeneration.current;
    try {
      const result = await savePatientNote({
        patientId,
        appointmentId,
        ...identity,
        content,
      });
      if (mount !== mountGeneration.current || epoch !== noteDraftGeneration())
        return;
      setState(result);
      if (result.ok) {
        forgetNoteDraft(scope, { ...identity, content, saved });
        setDraftNotice("");
        setIdentity({
          id: result.id || identity.id,
          revision: result.revision || identity.revision,
        });
        setSaved(content);
      }
    } catch {
      if (mount !== mountGeneration.current || epoch !== noteDraftGeneration())
        return;
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
      aria-busy={pending || !ready}
    >
      <label htmlFor={labelId}>
        {note ? "Tu nota privada" : "Nueva nota privada"}
      </label>
      <textarea
        ref={textarea}
        id={labelId}
        value={content}
        onChange={(event) => {
          const next = event.target.value;
          setContent(next);
          const retained = rememberNoteDraft(
            scope,
            { ...identity, content: next, saved },
            authorizationGeneration.current,
          );
          setDraftNotice(
            next === saved
              ? ""
              : retained
                ? "Los cambios pueden recuperarse durante 15 minutos desde el último cambio en este documento. Guarda antes de cerrarlo."
                : "Este borrador permanece en el editor, pero no cabe entre los borradores temporales. Guárdalo antes de cambiar de ficha.",
          );
        }}
        rows={6}
        maxLength={12000}
        required
        disabled={!canEdit || pending}
        aria-describedby={`${labelId}-save-status${state ? ` ${labelId}-feedback` : ""}`}
        placeholder="Un espacio privado para tus apuntes de la consulta…"
      />
      <div className="note-toolbar">
        <span className="hint" role="status" id={`${labelId}-save-status`}>
          {!ready
            ? "Comprobando acceso…"
            : !authorized
              ? "Acceso pendiente"
              : pending
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
          disabled={!canEdit || pending || !dirty}
          type="submit"
        >
          Guardar nota
        </button>
      </div>
      {draftNotice ? (
        <p className="hint" role="status">
          {draftNotice}
        </p>
      ) : null}
      {ready && !authorized ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Volver a comprobar acceso
        </button>
      ) : null}
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
          disabled={!canEdit || pending || dirty}
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
            disabled={!canEdit || pending || !confirmDelete}
            onClick={() =>
              startTransition(async () => {
                if (operation.current || !canEdit || !confirmDelete) return;
                operation.current = true;
                const epoch = authorizationGeneration.current;
                const mount = mountGeneration.current;
                try {
                  const result = await deletePatientNote(
                    patientId,
                    identity.id || "",
                    identity.revision || 0,
                  );
                  if (
                    mount !== mountGeneration.current ||
                    epoch !== noteDraftGeneration()
                  )
                    return;
                  setState(result);
                  if (result.ok) {
                    forgetNoteDraft(scope, { ...identity, content, saved });
                    setSaved(content);
                    setDeleted(true);
                  }
                } catch {
                  if (
                    mount !== mountGeneration.current ||
                    epoch !== noteDraftGeneration()
                  )
                    return;
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
