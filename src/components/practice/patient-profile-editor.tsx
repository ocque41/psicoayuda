"use client";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadPatientProfileVersion,
  type PatientProfileState,
  savePatientProfile,
} from "@/app/pro/pacientes/[patientId]/profile-actions";
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
} from "@/lib/chat-session-end";
import type {
  PatientProfileVersion,
  PatientProfileView,
} from "@/lib/practice/patient-profile";
import {
  emptyPatientProfile,
  type PatientProfileContent,
} from "@/lib/practice/patient-profile-fields-model";
import styles from "./patient-profile.module.css";
import { PatientProfileConflict } from "./patient-profile-conflict";
import { PatientProfileFields } from "./patient-profile-fields";

type Props = {
  patientId: string;
  profile: PatientProfileView;
  timeZone: string;
};
type Draft = {
  content: PatientProfileContent;
  saved: PatientProfileContent;
  revision: number;
};
export function PatientProfileEditor(props: Props) {
  return (
    <ScopedProfileEditor
      key={JSON.stringify([
        props.patientId,
        props.profile.scope?.accountId,
        props.profile.scope?.professionalId,
      ])}
      {...props}
    />
  );
}
function ScopedProfileEditor({ patientId, profile, timeZone }: Props) {
  const router = useRouter();
  const id = useId();
  const accountId = profile.scope?.accountId || "";
  const professionalId = profile.scope?.professionalId || "";
  const scope = useMemo(
    () => ({ accountId, professionalId }),
    [accountId, professionalId],
  );
  const [content, setContent] = useState<PatientProfileContent>({
    ...emptyPatientProfile,
  });
  const [saved, setSaved] = useState<PatientProfileContent>({
    ...emptyPatientProfile,
  });
  const [revision, setRevision] = useState(profile.revision);
  const [zone, setZone] = useState(timeZone);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState<PatientProfileState | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [version, setVersion] = useState<PatientProfileVersion | null>(null);
  const [comparisonAttempt, setComparisonAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const destination = useRef<string | null>(null);
  const leaving = useRef(false);
  const generation = useRef(0);
  const authorized = useRef(-1);
  const operation = useRef(false);
  const draft = useRef<Draft | null>(null);
  const focus = useRef<"note" | "feedback" | null>(null);
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);
  const retainedDirty =
    draft.current &&
    JSON.stringify(draft.current.content) !==
      JSON.stringify(draft.current.saved);
  const hasChanges = dirty || (!ready && !!retainedDirty);
  const current = () => authorized.current === generation.current;
  const focusNote = () =>
    form.current
      ?.querySelector<HTMLTextAreaElement>('textarea[name="generalNote"]')
      ?.focus();
  // biome-ignore lint/correctness/useExhaustiveDependencies: el feedback nuevo debe recibir foco aunque ready/busy no cambien tras invalidar acceso.
  useEffect(() => {
    if (busy) return;
    if (focus.current === "note" && ready)
      form.current
        ?.querySelector<HTMLTextAreaElement>('textarea[name="generalNote"]')
        ?.focus();
    else if (focus.current === "feedback") notice.current?.focus();
    focus.current = null;
  }, [busy, ready, feedback]);
  useEffect(() => {
    function invalidate(event: Event) {
      generation.current++;
      authorized.current = -1;
      operation.current = false;
      if (event.type === SESSION_CHANGED_EVENT) draft.current = null;
      setContent({ ...emptyPatientProfile });
      setSaved({ ...emptyPatientProfile });
      setRevision(0);
      setReady(false);
      setBusy(false);
      setConsent(false);
      setVersion(null);
      setRecovery(false);
      dialog.current?.close();
      setFeedback({
        ok: false,
        message:
          "El acceso de tu cuenta cambió. Retiramos los datos de esta ventana. Vuelve a comprobar el acceso.",
      });
      focus.current = "feedback";
    }
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, invalidate);
    return () => {
      generation.current++;
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
      window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, invalidate);
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt fuerza la reautorización manual, sin abrir el borrador antes.
  useEffect(() => {
    const ticket = generation.current;
    let disposed = false;
    if (
      profile.status !== "ready" ||
      !scope.accountId ||
      !scope.professionalId
    ) {
      generation.current++;
      authorized.current = -1;
      operation.current = false;
      setReady(false);
      setBusy(false);
      setContent({ ...emptyPatientProfile });
      setSaved({ ...emptyPatientProfile });
      setConsent(false);
      setVersion(null);
      setRecovery(false);
      return;
    }
    setBusy(true);
    setReady(false);
    operation.current = true;
    void (async () => {
      try {
        const result = await loadPatientProfileVersion({ ...scope, patientId });
        if (disposed || ticket !== generation.current) return;
        if (!result.ok) {
          if (result.accountChanged) draft.current = null;
          setFeedback(result);
          focus.current = "feedback";
          return;
        }
        const latest = result.version;
        const retained =
          draft.current &&
          JSON.stringify(draft.current.content) !==
            JSON.stringify(draft.current.saved)
            ? draft.current
            : null;
        const initial = retained || {
          content: latest.content,
          saved: latest.content,
          revision: latest.revision,
        };
        draft.current = {
          ...initial,
          content: { ...initial.content },
          saved: { ...initial.saved },
        };
        setContent(initial.content);
        setSaved(initial.saved);
        setRevision(initial.revision);
        setZone(latest.timeZone);
        authorized.current = ticket;
        setReady(true);
        setConsent(false);
        setFeedback(
          retained
            ? {
                ok: true,
                message:
                  "Recuperamos el borrador de esta cuenta con su revisión original. Confirma la autorización antes de guardar.",
              }
            : null,
        );
      } catch {
        if (!disposed && ticket === generation.current) {
          setFeedback({
            ok: false,
            message:
              "No pudimos comprobar el acceso. El borrador permanece oculto; vuelve a intentar con conexión.",
          });
          focus.current = "feedback";
        }
      } finally {
        if (!disposed && ticket === generation.current) {
          operation.current = false;
          setBusy(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [scope, patientId, profile.status, attempt]);
  function deny(result: { message: string; accountChanged?: boolean }) {
    authorized.current = -1;
    if (result.accountChanged) draft.current = null;
    setReady(false);
    setContent({ ...emptyPatientProfile });
    setSaved({ ...emptyPatientProfile });
    setRevision(0);
    setConsent(false);
    setRecovery(false);
    setVersion(null);
    setFeedback({ ok: false, message: result.message });
    focus.current = "feedback";
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation.current || !ready || !current() || !dirty || !consent) return;
    operation.current = true;
    setBusy(true);
    setFeedback(null);
    const ticket = generation.current;
    const submitted = { ...content };
    const sentRevision = revision;
    try {
      const result = await savePatientProfile({
        ...submitted,
        patientId,
        revision: sentRevision,
        consent,
        scope,
      });
      if (ticket !== generation.current || !current()) return;
      if (result.accessDenied) {
        deny(result);
        return;
      }
      setFeedback(result);
      focus.current = "feedback";
      if (result.conflict) {
        setRecovery(true);
        setVersion(null);
      }
      if (result.ok) {
        const nextRevision = result.revision ?? sentRevision;
        draft.current = {
          content: submitted,
          saved: submitted,
          revision: nextRevision,
        };
        setRevision(nextRevision);
        setSaved(submitted);
        setConsent(false);
        setRecovery(false);
        setVersion(null);
        router.refresh();
      }
    } catch {
      if (ticket === generation.current && current()) {
        setFeedback({
          ok: false,
          message:
            "No pudimos confirmar el guardado. Tu borrador sigue aquí; comprueba la conexión y reintenta.",
        });
        focus.current = "feedback";
      }
    } finally {
      if (ticket === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  async function consult(choice?: "draft" | "saved") {
    if (operation.current || !ready || !current()) return;
    operation.current = true;
    setBusy(true);
    setFeedback(null);
    const ticket = generation.current;
    try {
      const result = await loadPatientProfileVersion({ ...scope, patientId });
      if (ticket !== generation.current || !current()) return;
      if (!result.ok) {
        if (result.accessDenied) deny(result);
        else {
          setVersion(null);
          setFeedback(result);
          focus.current = "feedback";
        }
        return;
      }
      const latest = result.version;
      if (choice && version) {
        if (
          latest.revision !== version.revision ||
          latest.updatedAt !== version.updatedAt ||
          latest.timeZone !== version.timeZone ||
          JSON.stringify(latest.content) !== JSON.stringify(version.content)
        ) {
          setVersion(latest);
          setComparisonAttempt((value) => value + 1);
          setFeedback({
            ok: false,
            message:
              "La ficha guardada volvió a cambiar. Revisa los cuatro campos antes de elegir; tu borrador se conserva.",
          });
          focus.current = "feedback";
          return;
        }
        const nextContent = choice === "draft" ? content : latest.content;
        draft.current = {
          content: { ...nextContent },
          saved: { ...latest.content },
          revision: latest.revision,
        };
        setContent(nextContent);
        setSaved(latest.content);
        setRevision(latest.revision);
        setZone(latest.timeZone);
        setConsent(false);
        setRecovery(choice === "draft");
        if (choice === "saved") setVersion(null);
        setFeedback({
          ok: true,
          message:
            choice === "draft"
              ? "Tu borrador sigue sin guardar. Combina los cuatro campos y confirma la autorización antes de guardar."
              : "Se cargó la ficha guardada en el editor. No se escribió ni eliminó ningún dato.",
        });
        focus.current = "note";
        return;
      }
      setVersion(latest);
      setComparisonAttempt((value) => value + 1);
    } catch {
      if (ticket === generation.current && current()) {
        setVersion(null);
        setFeedback({
          ok: false,
          message:
            "No pudimos consultar la ficha guardada. Tu borrador sigue aquí; reintenta.",
        });
        focus.current = "feedback";
      }
    } finally {
      if (ticket === generation.current) {
        operation.current = false;
        setBusy(false);
      }
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: al recuperar disponibilidad se crea de nuevo el details enlazado.
  useEffect(() => {
    function showLinkedPanel() {
      if (window.location.hash === "#ficha-privada" && panel.current) {
        panel.current.open = true;
      }
    }
    showLinkedPanel();
    window.addEventListener("hashchange", showLinkedPanel);
    return () => window.removeEventListener("hashchange", showLinkedPanel);
  }, [profile.status]);

  useEffect(() => {
    if (!hasChanges) return;
    function warn(event: BeforeUnloadEvent) {
      if (!leaving.current) event.preventDefault();
    }
    function guardLink(event: MouseEvent) {
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
      dialog.current?.showModal();
    }
    function guardFilter(event: SubmitEvent) {
      if (event.defaultPrevented || leaving.current) return;
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        !form.hasAttribute("data-note-navigation")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const next = new URL(form.action, window.location.href);
      const params = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") params.append(name, value);
      }
      next.search = params.toString();
      destination.current = next.href;
      dialog.current?.showModal();
    }
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    document.addEventListener("submit", guardFilter, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
      document.removeEventListener("submit", guardFilter, true);
    };
  }, [hasChanges]);

  if (profile.status !== "ready" || !accountId || !professionalId) {
    return (
      <section
        id="ficha-privada"
        className={styles.unavailable}
        aria-labelledby={`${id}-title`}
      >
        <h2 id={`${id}-title`}>Datos privados de la ficha</h2>
        <p role="alert">
          No pudimos abrir estos datos. El registro se conserva y no se puede
          reemplazar desde esta ventana. Vuelve a intentarlo o contacta a
          soporte sin compartir su contenido.
        </p>
      </section>
    );
  }
  return (
    <>
      <details ref={panel} id="ficha-privada" className={styles.panel}>
        <summary>
          <span className={styles.summary}>
            <strong>Datos privados del paciente</strong>
            <small>
              Sexo, nacimiento, motivo de consulta y notas generales
            </small>
          </span>
        </summary>
        <div className={styles.body}>
          <p className="hint">
            Opcionales, privados y guardados con cifrado. El paciente y el
            equipo de soporte no pueden ver estos datos desde sus cuentas.
          </p>
          <form
            ref={form}
            className="practice-form"
            onSubmit={save}
            aria-busy={busy}
            aria-describedby={feedback ? `${id}-feedback` : undefined}
          >
            <fieldset
              className={styles.editorFields}
              disabled={!ready || busy}
              aria-label="Datos privados de la ficha"
            >
              <input type="hidden" name="revision" value={revision} />
              <PatientProfileFields
                content={content}
                onChange={(next) => {
                  if (!ready || busy || !current()) return;
                  draft.current = {
                    content: { ...next },
                    saved: { ...saved },
                    revision,
                  };
                  setContent(next);
                }}
                timeZone={zone}
              />
              <label className={`practice-check ${styles.consent}`}>
                <input
                  type="checkbox"
                  name="profileConsent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                La persona conoce y autoriza guardar estos datos en su ficha.
              </label>
              <p className={styles.state} role="status">
                {busy
                  ? "Comprobando o guardando…"
                  : !ready
                    ? "Acceso pendiente"
                    : dirty
                      ? "Cambios sin guardar"
                      : revision
                        ? "Datos guardados"
                        : "Todavía no hay datos adicionales guardados"}
                . Guarda antes de salir.
              </p>
              <button
                type="submit"
                className="button human"
                disabled={!ready || busy || !dirty || !consent}
              >
                Guardar datos de la ficha
              </button>
            </fieldset>
            {feedback ? (
              <p
                ref={notice}
                id={`${id}-feedback`}
                tabIndex={-1}
                role={feedback.ok ? "status" : "alert"}
                className={feedback.ok ? "hint" : "form-error"}
              >
                {feedback.message}
              </p>
            ) : null}
            {!ready ? (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setAttempt((v) => v + 1)}
              >
                Volver a comprobar acceso
              </button>
            ) : null}
            {recovery && ready ? (
              <PatientProfileConflict
                key={comparisonAttempt}
                draft={content}
                saved={version?.content || null}
                busy={busy}
                onConsult={(choice) => void consult(choice)}
                onKeep={() => {
                  setVersion(null);
                  setRecovery(false);
                  focusNote();
                }}
              />
            ) : null}
          </form>
        </div>
      </details>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-leave`}
      >
        <h2 id={`${id}-leave`}>Tienes cambios sin guardar</h2>
        <p>
          Los datos siguen en esta ventana. Guarda los datos de la ficha y las
          notas que estés editando antes de salir.
        </p>
        <div className="panel-nav">
          <button
            type="button"
            className="button human"
            onClick={() => dialog.current?.close()}
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
    </>
  );
}
