"use client";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { SupportFormState } from "@/lib/practice/support-write";
import styles from "./support.module.css";

type Action = (
  previous: SupportFormState,
  data: FormData,
) => Promise<SupportFormState>;
export function SupportReplyForm({
  action,
  contactId,
  revision,
  staff = false,
  resolved = false,
}: {
  action: Action;
  contactId: string;
  revision: string;
  staff?: boolean;
  resolved?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("in_review");
  const submission = useRef<{ fingerprint: string; id: string } | null>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const safeAction = useCallback(
    async (
      previous: SupportFormState,
      data: FormData,
    ): Promise<SupportFormState> => {
      const fingerprint = JSON.stringify([
        data.get("contactId"),
        data.get("body"),
        data.get("status"),
      ]);
      if (submission.current?.fingerprint !== fingerprint)
        submission.current = { fingerprint, id: crypto.randomUUID() };
      data.set("submissionId", submission.current.id);
      try {
        return await action(previous, data);
      } catch (error) {
        const digest =
          error && typeof error === "object" && "digest" in error
            ? String(error.digest)
            : "";
        if (
          digest.startsWith("NEXT_REDIRECT") ||
          digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
        )
          throw error;
        return {
          ok: false,
          code: "unavailable",
          message:
            "No pudimos confirmar el envío. Tu texto sigue aquí. Actualiza la conversación para comprobarlo; si reintentas el mismo mensaje, evitaremos duplicarlo.",
        };
      }
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(safeAction, null);
  useEffect(() => {
    if (state?.ok) {
      setBody("");
      submission.current = null;
    } else if (state) notice.current?.focus();
  }, [state]);
  return (
    <section className={styles.reply} aria-labelledby={`${formId}-heading`}>
      <h2 id={`${formId}-heading`}>
        {staff
          ? "Responder al profesional"
          : resolved
            ? "Continuar esta consulta"
            : "Añadir una respuesta"}
      </h2>
      <p className="hint">
        {!staff && resolved
          ? "Tu mensaje reabrirá la consulta para que el equipo pueda continuar contigo."
          : "Las respuestas quedan guardadas en esta conversación."}
      </p>
      <form action={formAction} className="practice-form" aria-busy={pending}>
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="revision" value={revision} />
        <label htmlFor={`${formId}-body`}>Tu mensaje</label>
        <textarea
          id={`${formId}-body`}
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          readOnly={pending}
          rows={5}
          minLength={3}
          maxLength={2000}
          required
          aria-describedby={`${formId}-hint`}
        />
        <p className="hint" id={`${formId}-hint`}>
          No incluyas nombres ni información clínica de pacientes.
        </p>
        {staff ? (
          <label>
            Estado después de responder
            <select
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={pending}
            >
              <option value="in_review">En revisión</option>
              <option value="resolved">Resuelto</option>
            </select>
          </label>
        ) : null}
        <div className={styles.replyFooter}>
          <small className="hint">{body.length}/2000 caracteres</small>
          <button className="button human" type="submit" disabled={pending}>
            {pending
              ? "Enviando…"
              : !staff && resolved
                ? "Enviar y reabrir consulta"
                : "Enviar respuesta"}
          </button>
        </div>
        {state ? (
          <p
            ref={notice}
            tabIndex={-1}
            role={state.ok ? "status" : "alert"}
            className={state.ok ? "hint" : "form-error"}
          >
            {state.message}
          </p>
        ) : null}
        {state && !state.ok ? (
          <button
            className={`button ghost ${styles.refresh}`}
            type="button"
            disabled={pending}
            onClick={() => router.refresh()}
          >
            Actualizar conversación
          </button>
        ) : null}
      </form>
    </section>
  );
}
