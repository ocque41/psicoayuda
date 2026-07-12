"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { ContactFormState } from "@/app/actions-contact";
import {
  contactCategories,
  contactCategoryLabels,
} from "@/lib/contact-messages";

type ContactAction = (
  previous: ContactFormState,
  formData: FormData,
) => Promise<ContactFormState>;

export function ContactMessageForm({
  action,
  audience,
}: {
  action: ContactAction;
  audience: "public" | "professional";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state && !state.ok) errorRef.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="contact-form-success" role="status">
        <h3>Recibimos tu mensaje</h3>
        <p>
          Quedó guardado en la bandeja del equipo. Te responderemos al correo
          indicado en cuanto podamos.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="contact-message-form"
      aria-busy={pending}
    >
      {audience === "public" ? (
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
      ) : null}

      {audience === "public" ? (
        <div className="contact-form-grid">
          <label htmlFor={`${formId}-name`}>
            Tu nombre (opcional)
            <input
              id={`${formId}-name`}
              name="name"
              type="text"
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label htmlFor={`${formId}-email`}>
            Tu correo
            <input
              id={`${formId}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              maxLength={200}
              required
            />
          </label>
        </div>
      ) : null}

      <label htmlFor={`${formId}-category`}>
        ¿Sobre qué quieres escribirnos?
        <select id={`${formId}-category`} name="category" required>
          {contactCategories.map((category) => (
            <option key={category} value={category}>
              {contactCategoryLabels[category]}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor={`${formId}-message`}>
        Cuéntanos
        <textarea
          id={`${formId}-message`}
          name="message"
          rows={6}
          minLength={10}
          maxLength={2000}
          required
          placeholder={
            audience === "professional"
              ? "Explícanos qué necesitas o qué podríamos mejorar."
              : "Explícanos tu pregunta o qué necesitas del equipo."
          }
        />
      </label>

      {audience === "professional" ? (
        <p className="hint">
          No incluyas nombres, correos, teléfonos ni información privada de las
          personas que acompañas.
        </p>
      ) : (
        <p className="hint">
          Usaremos estos datos únicamente para leer tu mensaje y responderte.
        </p>
      )}

      {state && !state.ok ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {state.message}
        </p>
      ) : null}

      <button className="button human" type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  );
}
