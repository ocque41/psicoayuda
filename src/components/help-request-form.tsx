"use client";

import { useActionState, useId, useState } from "react";
import { createHelpRequest } from "@/app/actions";
import {
  languageLabels,
  needCategories,
  needLabels,
  urgencyLabels,
  urgencyLevels,
} from "@/lib/constants";

export function HelpRequestForm() {
  const [state, action, pending] = useActionState(createHelpRequest, null);
  const formId = useId();
  const [locationMessage, setLocationMessage] = useState("");
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const ids = {
    email: `${formId}-email`,
    language: `${formId}-language`,
    urgency: `${formId}-urgency`,
    needCategory: `${formId}-need-category`,
    country: `${formId}-country`,
    state: `${formId}-state`,
    city: `${formId}-city`,
  };

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
          "Ubicación agregada. También puedes dejar ciudad vacía.",
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
    <form action={action} className="card">
      <input type="hidden" name="lat" value={coords.lat ?? ""} />
      <input type="hidden" name="lng" value={coords.lng ?? ""} />
      <input
        type="hidden"
        name="locationConsent"
        value={coords.lat ? "true" : "false"}
      />

      <div className="field">
        <label htmlFor={ids.email}>Correo de contacto *</label>
        <input id={ids.email} name="email" type="email" required />
      </div>

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
          <label htmlFor={ids.urgency}>Urgencia</label>
          <select id={ids.urgency} name="urgency" defaultValue="media">
            {urgencyLevels.map((value) => (
              <option key={value} value={value}>
                {urgencyLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor={ids.needCategory}>Tipo de apoyo</label>
        <select
          id={ids.needCategory}
          name="needCategory"
          defaultValue="orientacion_general"
        >
          {needCategories.map((value) => (
            <option key={value} value={value}>
              {needLabels[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor={ids.country}>País</label>
          <input id={ids.country} name="country" defaultValue="Venezuela" />
        </div>
        <div className="field">
          <label htmlFor={ids.state}>Estado</label>
          <input id={ids.state} name="state" />
        </div>
      </div>

      <div className="field">
        <label htmlFor={ids.city}>Ciudad o zona, si quieres compartirla</label>
        <input id={ids.city} name="city" />
      </div>

      <button
        className="button secondary"
        type="button"
        onClick={requestLocation}
      >
        Usar ubicación opcional
      </button>
      {locationMessage ? <p className="muted">{locationMessage}</p> : null}

      <div className="checks">
        <label>
          <input name="consentContact" type="checkbox" required />
          Acepto que PsicoAyuda use estos datos para intentar conectarme con un
          profesional voluntario.
        </label>
      </div>

      {state && !state.ok ? <p role="alert">{state.message}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Enviando..." : "Enviar solicitud"}
      </button>
    </form>
  );
}
