"use client";

import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  AdmissionAction,
  AdmissionFormState,
} from "@/lib/admission/types";
import styles from "./admission.module.css";

export function AdmissionActionForm({
  action,
  children,
  submit = "Guardar revisión",
  disabled = false,
  submitDisabled = false,
  onSaved,
  onBusyChange,
  onChange,
  onInvalid,
}: {
  action: AdmissionAction;
  children: ReactNode;
  submit?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  onSaved?: (state: AdmissionFormState) => void;
  onBusyChange?: (busy: boolean) => void;
  onChange?: () => void;
  onInvalid?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const noticeId = useId();
  const notice = useRef<HTMLParagraphElement>(null);
  const locked = useRef(false);
  const handled = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const safeAction = useCallback(
    async (
      previous: { state: AdmissionFormState; submission: number },
      form: FormData,
    ) => {
      try {
        const state = await action(previous.state, form);
        // Notificar antes de devolver: la revalidación puede remontar esta forma.
        if (state.ok) onSaved?.(state);
        return {
          state,
          submission: previous.submission + 1,
        };
      } catch (error) {
        const digest =
          error && typeof error === "object" && "digest" in error
            ? String(error.digest)
            : "";
        if (digest.startsWith("NEXT_")) throw error;
        return {
          state: {
            ok: false,
            message:
              "No pudimos confirmar el guardado. Conservamos los campos. Comprueba el historial antes de volver a intentarlo.",
          },
          submission: previous.submission + 1,
        };
      } finally {
        locked.current = false;
        setSubmitting(false);
        onBusyChange?.(false);
      }
    },
    [action, onBusyChange, onSaved],
  );
  const [result, formAction, pending] = useActionState(safeAction, {
    state: { ok: false, message: "" },
    submission: 0,
  });
  const busy = pending || submitting;
  useEffect(() => {
    if (busy || result.submission <= handled.current) return;
    handled.current = result.submission;
    if (!result.state.ok && result.state.message) notice.current?.focus();
  }, [result, busy]);
  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitDisabled || busy || locked.current) return;
    // Capturamos los campos antes de deshabilitarlos durante el envío.
    const form = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    locked.current = true;
    setSubmitting(true);
    onBusyChange?.(true);
    startTransition(() => formAction(form));
  }
  return (
    <form
      method="post"
      onSubmit={submitForm}
      onChange={onChange}
      onInvalidCapture={onInvalid}
      className={styles.actionForm}
      aria-busy={busy}
      aria-describedby={result.state.message && !busy ? noticeId : undefined}
    >
      <fieldset disabled={disabled || busy} className={styles.formFields}>
        {children}
        <button
          type="submit"
          className={styles.primary}
          disabled={disabled || submitDisabled || busy}
        >
          {busy ? "Guardando…" : submit}
        </button>
      </fieldset>
      {result.state.message && !busy ? (
        <p
          key={result.submission}
          id={noticeId}
          ref={notice}
          tabIndex={-1}
          role={result.state.ok ? "status" : "alert"}
          className={result.state.ok ? styles.success : styles.error}
        >
          {result.state.message}
        </p>
      ) : null}
    </form>
  );
}
