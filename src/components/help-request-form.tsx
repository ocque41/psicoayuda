"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createHelpRequest } from "@/app/actions";
import {
  languageLabels,
  needCategories,
  needSeekerLabels,
  urgencyLabels,
  urgencyLevels,
} from "@/lib/constants";

export function HelpRequestForm() {
  const [state, action, pending] = useActionState(createHelpRequest, null);
  const formId = useId();
  const [locationMessage, setLocationMessage] = useState("");
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const ids = {
    email: `${formId}-email`,
    emailHint: `${formId}-email-hint`,
    language: `${formId}-language`,
    urgency: `${formId}-urgency`,
    urgencyHint: `${formId}-urgency-hint`,
    needCategory: `${formId}-need-category`,
    needHint: `${formId}-need-hint`,
    country: `${formId}-country`,
    state: `${formId}-state`,
    city: `${formId}-city`,
  };

  // Si el envío falla, llevar el foco al mensaje para que nadie se quede sin
  // saber que su solicitud no salió (incluye lectores de pantalla).
  useEffect(() => {
    if (state && !state.ok) {
      errorRef.current?.focus();
    }
  }, [state]);

  function requestLocation() {
    setLocationMessage("");
    if (!navigator.geolocation) {
      setLocationMessage("Tu navegador no permite usar ubicación.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationMessage(
          "Ubicación agregada. También puedes dejar la ciudad vacía.",
        );
      },
      () => {
        setLocationMessage(
          "No se pudo usar la ubicación. Puedes seguir con ciudad manual o sin ubicación.",
        );
      },
      { enableHighAccuracy: false, timeout: 6000 },
    );
  }

  return (
    <form action={action} className="card" aria-busy={pending}>
      <input type="hidden" name="lat" value={coords.lat ?? ""} />
      <input type="hidden" name="lng" value={coords.lng ?? ""} />
      <input
        type="hidden"
        name="locationConsent"
        value={coords.lat ? "true" : "false"}
      />

      <div className="field">
        <label htmlFor={ids.needCategory}>
          ¿Con qué te gustaría que te acompañen?
        </label>
        <p className="hint" id={ids.needHint}>
          No tienes que explicarlo todo ahora. Con elegir una opción basta.
        </p>
        <select
          id={ids.needCategory}
          name="needCategory"
          defaultValue="orientacion_general"
          aria-describedby={ids.needHint}
        >
          {needCategories.map((value) => (
            <option key={value} value={value}>
              {needSeekerLabels[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={ids.urgency}>
          ¿Cómo lo sientes respecto al tiempo?
        </label>
        <p className="hint" id={ids.urgencyHint}>
          Cualquiera que sea tu respuesta, tu solicitud importa.
        </p>
        <select
          id={ids.urgency}
          name="urgency"
          defaultValue="media"
          aria-describedby={ids.urgencyHint}
        >
          {urgencyLevels.map((value) => (
            <option key={value} value={value}>
              {urgencyLabels[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={ids.email}>¿A qué correo te escribimos? *</label>
        <p className="hint" id={ids.emailHint}>
          Solo lo usamos para que una persona voluntaria te responda.
        </p>
        <input
          id={ids.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={ids.emailHint}
        />
      </div>

      <div className="checks">
        <label>
          <input name="consentContact" type="checkbox" required />
          Sí, quiero que una persona voluntaria me contacte por este correo.
        </label>
      </div>
      <p className="hint" style={{ marginTop: "-6px" }}>
        Tus datos no se publican ni se comparten fuera del equipo.
      </p>

      <details className="disclosure">
        <summary>Compartir mi zona o idioma (opcional)</summary>
        <div className="disclosure-body">
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor={ids.language}>Idioma preferido</label>
              <select id={ids.language} name="language" defaultValue="es">
                {Object.entries(languageLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={ids.country}>País</label>
              <input id={ids.country} name="country" defaultValue="Venezuela" />
            </div>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label htmlFor={ids.state}>Estado</label>
              <input id={ids.state} name="state" />
            </div>
            <div className="field">
              <label htmlFor={ids.city}>Ciudad o zona</label>
              <input id={ids.city} name="city" />
            </div>
          </div>

          <button
            className="button secondary"
            type="button"
            onClick={requestLocation}
          >
            Usar mi ubicación
          </button>
          <p className="hint" role="status" aria-live="polite">
            {locationMessage}
          </p>
        </div>
      </details>

      {state && !state.ok ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {state.message}
        </p>
      ) : null}

      <button
        className="button human block"
        disabled={pending}
        aria-busy={pending}
        type="submit"
      >
        {pending ? "Enviando tu mensaje…" : "Enviar y que me contacten"}
      </button>
    </form>
  );
}
