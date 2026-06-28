"use client";

import { useActionState, useId } from "react";
import { saveProfessionalOnboarding } from "@/app/actions";
import { languageLabels, needCategories, needLabels } from "@/lib/constants";

export function ProfessionalOnboardingForm({
  email,
  name,
}: {
  email: string;
  name?: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveProfessionalOnboarding,
    null,
  );
  const formId = useId();
  const ids = {
    fullName: `${formId}-full-name`,
    displayName: `${formId}-display-name`,
    country: `${formId}-country`,
    city: `${formId}-city`,
    licenseNumber: `${formId}-license-number`,
    licenseCountry: `${formId}-license-country`,
    contactEmail: `${formId}-contact-email`,
    maxActiveRequests: `${formId}-max-active-requests`,
    contactNotes: `${formId}-contact-notes`,
    shortBio: `${formId}-short-bio`,
  };

  return (
    <form action={action} className="card">
      <p className="muted">Correo de Google: {email}</p>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor={ids.fullName}>Nombre completo *</label>
          <input
            id={ids.fullName}
            name="fullName"
            defaultValue={name ?? ""}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={ids.displayName}>Nombre público</label>
          <input id={ids.displayName} name="displayName" />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor={ids.country}>País</label>
          <input id={ids.country} name="country" />
        </div>
        <div className="field">
          <label htmlFor={ids.city}>Ciudad</label>
          <input id={ids.city} name="city" />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor={ids.licenseNumber}>Credencial o licencia *</label>
          <input id={ids.licenseNumber} name="licenseNumber" required />
        </div>
        <div className="field">
          <label htmlFor={ids.licenseCountry}>País de la credencial *</label>
          <input id={ids.licenseCountry} name="licenseCountry" required />
        </div>
      </div>

      <fieldset className="card">
        <legend>Idiomas *</legend>
        <div className="checks">
          {Object.entries(languageLabels).map(([value, label]) => (
            <label key={value}>
              <input
                name="languages"
                type="checkbox"
                value={value}
                defaultChecked={value === "es"}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Áreas de apoyo *</legend>
        <div className="checks">
          {needCategories.map((value) => (
            <label key={value}>
              <input name="supportAreas" type="checkbox" value={value} />
              {needLabels[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor={ids.contactEmail}>Correo para coordinación</label>
          <input
            id={ids.contactEmail}
            name="contactEmail"
            type="email"
            defaultValue={email}
          />
        </div>
        <div className="field">
          <label htmlFor={ids.maxActiveRequests}>
            Máximo de solicitudes activas
          </label>
          <input
            id={ids.maxActiveRequests}
            name="maxActiveRequests"
            type="number"
            min="1"
            max="10"
            defaultValue="3"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={ids.contactNotes}>
          Notas de contacto para coordinación
        </label>
        <textarea id={ids.contactNotes} name="contactNotes" rows={3} />
      </div>

      <div className="field">
        <label htmlFor={ids.shortBio}>Bio breve</label>
        <textarea id={ids.shortBio} name="shortBio" rows={4} />
      </div>

      <div className="checks">
        <label>
          <input name="remoteAvailable" type="checkbox" defaultChecked />
          Disponible para apoyo remoto.
        </label>
        <label>
          <input name="acceptingRequests" type="checkbox" />
          Puedo recibir solicitudes cuando sea aprobado/a.
        </label>
        <label>
          <input name="crisisExperience" type="checkbox" />
          Tengo experiencia en crisis.
        </label>
      </div>

      {state && !state.ok ? <p role="alert">{state.message}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Guardando..." : "Enviar para verificación"}
      </button>
    </form>
  );
}
