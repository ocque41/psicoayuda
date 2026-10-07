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
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { TIME_ZONES } from "@/lib/geography";
export function PracticeForm({
  action,
  children,
  submit = "Guardar",
  resetOnSuccess = false,
  successFocusId,
}: {
  action: (
    state: PracticeFormState,
    data: FormData,
  ) => Promise<PracticeFormState>;
  children?: ReactNode;
  submit?: string;
  /** Las formas de creación pueden volver a sus defaults tras éxito confirmado. */
  resetOnSuccess?: boolean;
  /** Destino persistente cuando el éxito retira el formulario de la página. */
  successFocusId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const noticeId = useId();
  const submissionLocked = useRef(false);
  const handledSubmission = useRef(0);
  const [locked, setLocked] = useState(false);
  const safeAction = useCallback(
    async (
      previous: { feedback: PracticeFormState; submission: number },
      data: FormData,
    ): Promise<{ feedback: PracticeFormState; submission: number }> => {
      const submittedForm = formRef.current;
      try {
        const feedback = await action(previous.feedback, data);
        if (feedback?.ok && successFocusId) {
          // La acción puede desmontar este formulario al actualizar la sesión.
          requestAnimationFrame(() => {
            const target = document.getElementById(successFocusId);
            const active = document.activeElement;
            if (
              target?.isConnected &&
              !target.closest("[inert], [hidden]") &&
              target.getClientRects().length &&
              (active === document.body ||
                (active && submittedForm?.contains(active)))
            )
              target.focus();
          });
        }
        return {
          feedback,
          submission: previous.submission + 1,
        };
      } catch (error) {
        const digest =
          error && typeof error === "object" && "digest" in error
            ? String(error.digest)
            : "";
        if (
          digest.startsWith("NEXT_REDIRECT") ||
          digest.startsWith("NEXT_NOT_FOUND") ||
          digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
        )
          throw error;
        return {
          feedback: {
            ok: false,
            message:
              "No pudimos confirmar el resultado. Conservamos los datos. Comprueba el historial antes de repetir la operación. Si sigue fallando, contacta a soporte.",
          },
          submission: previous.submission + 1,
        };
      } finally {
        submissionLocked.current = false;
        setLocked(false);
      }
    },
    [action, successFocusId],
  );
  const [result, formAction, pending] = useActionState(safeAction, {
    feedback: null,
    submission: 0,
  });
  const busy = locked || pending;
  const state = result.feedback;
  const showNotice = state && !busy;

  useEffect(() => {
    if (busy || result.submission <= handledSubmission.current) return;
    handledSubmission.current = result.submission;
    if (result.feedback?.ok && resetOnSuccess && formRef.current)
      HTMLFormElement.prototype.reset.call(formRef.current);
    if (result.feedback && !result.feedback.ok)
      noticeRef.current?.focus({ preventScroll: false });
  }, [busy, result, resetOnSuccess]);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLocked.current || busy) return;
    // Capturar antes de bloquear: controles disabled no entran en FormData.
    const data = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    submissionLocked.current = true;
    setLocked(true);
    startTransition(() => formAction(data));
  }
  return (
    <form
      ref={formRef}
      onSubmit={submitForm}
      method="post"
      className="practice-form"
      aria-busy={busy}
      aria-describedby={showNotice ? noticeId : undefined}
    >
      <fieldset
        disabled={busy}
        aria-label="Datos del formulario"
        style={{
          margin: 0,
          padding: 0,
          border: 0,
          minWidth: 0,
          display: "grid",
          gap: "inherit",
        }}
      >
        {children}
        <button className="button human" type="submit" disabled={busy}>
          {busy ? "Guardando…" : submit}
        </button>
      </fieldset>
      {showNotice ? (
        <p
          key={result.submission}
          ref={noticeRef}
          id={noticeId}
          tabIndex={-1}
          role={state.ok ? "status" : "alert"}
          aria-atomic="true"
          className={state.ok ? "hint" : "form-error"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
export function TimeZoneSelect({
  value = "America/Caracas",
}: {
  value?: string;
}) {
  return (
    <label>
      Zona horaria
      <select name="timeZone" defaultValue={value} required>
        {Array.from(new Set([value, ...TIME_ZONES])).map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </label>
  );
}
export function CurrencySelect() {
  return (
    <label>
      Moneda
      <select name="currency" defaultValue="usd">
        <option value="usd">USD · dólares</option>
        <option value="eur">EUR · euros</option>
        <option value="ves">VES · bolívares</option>
      </select>
    </label>
  );
}
