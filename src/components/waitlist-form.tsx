"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import type { WaitlistFormState } from "@/app/actions-waitlist";
import {
  WAITLIST_DESCRIPTION_MIN_LENGTH,
  WAITLIST_TITLE_MAX_LENGTH,
  type WaitlistSource,
} from "@/lib/waitlist";

type WaitlistAction = (
  previous: WaitlistFormState,
  formData: FormData,
) => Promise<WaitlistFormState>;

/**
 * Formulario de la lista de espera (correo, título y descripción) para personas
 * que necesitan apoyo psicológico por motivos ajenos al terremoto. El estado de
 * éxito reemplaza al formulario y ofrece los caminos alternativos.
 */
export function WaitlistForm({
  action,
  source,
}: {
  action: WaitlistAction;
  source: WaitlistSource;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state && !state.ok) errorRef.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="contact-form-success waitlist-form-success" role="status">
        <h3>Te anotamos en la lista de espera</h3>
        <p>
          Te escribiremos al correo que nos dejaste cuando haya un profesional
          voluntario disponible para acompañarte.
        </p>
        <p>
          ¿Necesitas ayuda antes?{" "}
          <Link href="/alianzas">Busca una de las asociaciones aliadas</Link>.
        </p>
        <p className="hint">
          Si estás en peligro inmediato, no esperes: llama al{" "}
          <strong>911</strong> o consulta las{" "}
          <Link href="/emergencia">líneas de ayuda</Link>.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="waitlist-form" aria-busy={pending}>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor={`${formId}-company`}>No rellenes este campo</label>
        <input
          id={`${formId}-company`}
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <input name="source" type="hidden" value={source} />

      <h3>Anótate en la lista de espera</h3>
      <p className="field-help">
        Cuéntanos lo mínimo para poder escribirte. Podrás ampliar cuando te
        acompañe una persona.
      </p>

      <label htmlFor={`${formId}-email`}>
        Tu correo electrónico
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          maxLength={200}
          required
          placeholder="nombre@correo.com"
        />
      </label>

      <label htmlFor={`${formId}-title`}>
        ¿Con qué necesitas ayuda?
        <input
          id={`${formId}-title`}
          name="title"
          type="text"
          maxLength={WAITLIST_TITLE_MAX_LENGTH}
          required
          placeholder="Ej.: Ansiedad por problemas de trabajo"
        />
      </label>

      <label htmlFor={`${formId}-description`}>
        Cuéntanos un poco más
        <textarea
          id={`${formId}-description`}
          name="description"
          rows={5}
          minLength={WAITLIST_DESCRIPTION_MIN_LENGTH}
          maxLength={1500}
          required
          placeholder="Qué te pasa, desde cuándo y qué te gustaría trabajar."
        />
      </label>

      <p className="hint">
        Usaremos tu correo solo para avisarte sobre tu acompañamiento. Por tu
        seguridad, no incluyas tu dirección exacta ni documentos.
      </p>

      {state && !state.ok ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {state.message}
        </p>
      ) : null}

      <button className="button human" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Anotarme en la lista de espera"}
      </button>
    </form>
  );
}
