"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { createFoundationContact } from "@/app/actions";

// Formulario para fundaciones/organizaciones que quieren aliarse con Nido.
// Público (sin sesión): pide lo mínimo para contactar y envía por correo al
// equipo de coordinación. Un honeypot oculto ("company") frena bots básicos.
export function FoundationContactForm() {
  const [state, action, pending] = useActionState(
    createFoundationContact,
    null,
  );
  const formId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const ids = {
    organizationName: `${formId}-org`,
    contactName: `${formId}-contact`,
    email: `${formId}-email`,
    website: `${formId}-website`,
    phone: `${formId}-phone`,
    message: `${formId}-message`,
    company: `${formId}-company`,
  };

  // Si el envío falla, llevar el foco al mensaje de error (incluye lectores de
  // pantalla), para que nadie se quede sin saber que no salió.
  useEffect(() => {
    if (state && !state.ok) errorRef.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="card" role="status">
        <h2>¡Gracias! Recibimos tus datos.</h2>
        <p>
          Una persona del equipo de coordinación de Nido revisará tu mensaje y
          te escribirá al correo que nos dejaste. Somos un equipo voluntario,
          así que puede tomar unos días.
        </p>
        <p>
          <Link href="/">Volver al inicio</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card" aria-busy={pending}>
      {/* Honeypot: invisible para personas, tentador para bots. Si llega con
          contenido, la acción descarta el envío en silencio. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label htmlFor={ids.company}>No rellenes este campo</label>
        <input
          id={ids.company}
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor={ids.organizationName}>
          Nombre de la fundación u organización
        </label>
        <input
          id={ids.organizationName}
          name="organizationName"
          type="text"
          required
          maxLength={160}
          autoComplete="organization"
        />
      </div>

      <div className="field">
        <label htmlFor={ids.contactName}>
          Nombre de la persona de contacto
        </label>
        <input
          id={ids.contactName}
          name="contactName"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
        />
      </div>

      <div className="field">
        <label htmlFor={ids.email}>Correo de contacto</label>
        <input
          id={ids.email}
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="field">
        <label htmlFor={ids.website}>Página web (opcional)</label>
        <input
          id={ids.website}
          name="website"
          type="text"
          inputMode="url"
          maxLength={200}
          placeholder="fundacion.org"
          autoComplete="url"
          // Si escriben algo, que parezca una web (dominio con punto y TLD). El
          // servidor revalida lo mismo; esto es solo un aviso temprano en el navegador.
          pattern="(https?://)?([A-Za-z0-9-]+\.)+[A-Za-z]{2,}([/?#].*)?"
          title="Escribe una dirección web válida (ej. fundacion.org)."
        />
      </div>

      <div className="field">
        <label htmlFor={ids.phone}>Teléfono de contacto (opcional)</label>
        <input
          id={ids.phone}
          name="phone"
          type="tel"
          inputMode="tel"
          maxLength={40}
          placeholder="+58 412 1234567"
          autoComplete="tel"
          // Solo dígitos y los signos habituales de teléfono. El servidor lo
          // normaliza y valida de verdad; esto evita que escriban letras.
          pattern="[0-9+()\s-]{7,40}"
          title="Escribe un teléfono válido (solo números; incluye el código de país si estás fuera de Venezuela)."
        />
      </div>

      <div className="field">
        <label htmlFor={ids.message}>
          ¿Cómo les gustaría colaborar? (opcional)
        </label>
        <textarea id={ids.message} name="message" rows={4} maxLength={1000} />
      </div>

      {state && !state.ok ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {state.message}
        </p>
      ) : null}

      <div className="form-actions">
        <button
          className="button human block"
          type="submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      <p className="hint">
        Solo usamos estos datos para ponernos en contacto sobre una posible
        colaboración. No los publicamos ni los compartimos fuera del equipo.
      </p>
    </form>
  );
}
