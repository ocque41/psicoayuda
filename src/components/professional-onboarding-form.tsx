"use client";

import { useActionState, useEffect, useId, useRef } from "react";
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
  const errorRef = useRef<HTMLParagraphElement>(null);
  const ids = {
    fullName: `${formId}-full-name`,
    displayName: `${formId}-display-name`,
    displayNameHint: `${formId}-display-name-hint`,
    country: `${formId}-country`,
    city: `${formId}-city`,
    licenseNumber: `${formId}-license-number`,
    licenseHint: `${formId}-license-hint`,
    licenseCountry: `${formId}-license-country`,
    contactEmail: `${formId}-contact-email`,
    contactEmailHint: `${formId}-contact-email-hint`,
    maxActiveRequests: `${formId}-max-active-requests`,
    maxHint: `${formId}-max-hint`,
    contactNotes: `${formId}-contact-notes`,
    shortBio: `${formId}-short-bio`,
    shortBioHint: `${formId}-short-bio-hint`,
  };

  useEffect(() => {
    if (state && !state.ok) {
      errorRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={action} className="card" aria-busy={pending}>
      <p className="muted">Tu cuenta: {email}</p>

      <fieldset className="card">
        <legend>Quién eres</legend>
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
            <p className="hint" id={ids.displayNameHint}>
              El nombre con el que te verán las personas. Puede ser solo tu
              nombre de pila.
            </p>
            <input
              id={ids.displayName}
              name="displayName"
              aria-describedby={ids.displayNameHint}
            />
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
      </fieldset>

      <fieldset className="card">
        <legend>Tu credencial profesional</legend>
        <p className="field-help">
          La revisa una persona del equipo para confirmar que eres profesional.
          Nunca se muestra públicamente.
        </p>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor={ids.licenseNumber}>Credencial o licencia *</label>
            <p className="hint" id={ids.licenseHint}>
              Solo para verificar tu identidad profesional.
            </p>
            <input
              id={ids.licenseNumber}
              name="licenseNumber"
              required
              aria-describedby={ids.licenseHint}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.licenseCountry}>País de la credencial *</label>
            <input id={ids.licenseCountry} name="licenseCountry" required />
          </div>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Cómo y a quién quieres acompañar</legend>
        <p className="field-help">
          Tú defines tus límites. Todo esto lo puedes cambiar más adelante.
        </p>

        <p style={{ fontWeight: 600, margin: "0 0 6px" }}>Idiomas *</p>
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

        <p style={{ fontWeight: 600, margin: "10px 0 6px" }}>
          Áreas de apoyo *
        </p>
        <div className="checks">
          {needCategories.map((value) => (
            <label key={value}>
              <input name="supportAreas" type="checkbox" value={value} />
              {needLabels[value]}
            </label>
          ))}
        </div>

        <div className="field">
          <label htmlFor={ids.maxActiveRequests}>
            ¿A cuántas personas quieres acompañar a la vez?
          </label>
          <p className="hint" id={ids.maxHint}>
            Tú decides tu límite. Empieza con lo que te resulte sostenible.
          </p>
          <input
            id={ids.maxActiveRequests}
            name="maxActiveRequests"
            type="number"
            min="1"
            max="10"
            defaultValue="3"
            aria-describedby={ids.maxHint}
          />
        </div>

        <div className="checks">
          <label>
            <input name="remoteAvailable" type="checkbox" defaultChecked />
            Estoy disponible para acompañar en remoto.
          </label>
          <label>
            <input name="acceptingRequests" type="checkbox" />
            Quiero recibir solicitudes en cuanto me aprueben.
          </label>
          <label>
            <input name="crisisExperience" type="checkbox" />
            Tengo experiencia acompañando situaciones de crisis.
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Tu presentación y cómo te coordinamos</legend>
        <div className="field">
          <label htmlFor={ids.shortBio}>Bio breve</label>
          <p className="hint" id={ids.shortBioHint}>
            Unas líneas cálidas sobre cómo acompañas. Ayuda a que la persona se
            sienta en confianza.
          </p>
          <textarea
            id={ids.shortBio}
            name="shortBio"
            rows={4}
            aria-describedby={ids.shortBioHint}
          />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor={ids.contactEmail}>Correo para coordinación</label>
            <p className="hint" id={ids.contactEmailHint}>
              Lo usa el equipo para coordinar contigo. No se comparte con las
              personas.
            </p>
            <input
              id={ids.contactEmail}
              name="contactEmail"
              type="email"
              defaultValue={email}
              aria-describedby={ids.contactEmailHint}
            />
          </div>
          <div className="field">
            <label htmlFor={ids.contactNotes}>Notas para coordinación</label>
            <textarea id={ids.contactNotes} name="contactNotes" rows={3} />
          </div>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Nuestro acuerdo compartido *</legend>
        <p className="field-help">
          Esto cuida tanto a quien pide ayuda como a ti.
        </p>
        <div className="checks">
          <label>
            <input name="conductFreeService" type="checkbox" required />
            Acepto que el servicio es gratuito para las personas contactadas
            mediante Nido.
          </label>
          <label>
            <input name="conductNoClientCapture" type="checkbox" required />
            Acepto no usar Nido para captar clientes pagos ni hacer publicidad
            engañosa.
          </label>
          <label>
            <input name="conductConfidentiality" type="checkbox" required />
            Acepto mantener confidencialidad sobre la información recibida.
          </label>
          <label>
            <input
              name="conductNoEmergencyGuarantee"
              type="checkbox"
              required
            />
            Entiendo que Nido no garantiza respuesta de emergencia.
          </label>
          <label>
            <input name="conductCompetence" type="checkbox" required />
            Acepto trabajar solo dentro de mi competencia profesional.
          </label>
        </div>
      </fieldset>

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
        {pending ? "Enviando tu perfil…" : "Quiero empezar a ayudar"}
      </button>
    </form>
  );
}
