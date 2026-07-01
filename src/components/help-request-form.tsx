"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createHelpRequest } from "@/app/actions";
import {
  languageLabels,
  needCategories,
  needSeekerLabels,
  urgencyLabels,
  urgencyLevels,
} from "@/lib/constants";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft-storage";

// Borrador local: si la persona cierra la página sin enviar, al volver en el
// mismo dispositivo no pierde sus selecciones. SOLO guardamos campos NO
// identificables: este formulario es público (sin sesión), así que en un
// dispositivo compartido el siguiente usuario recuperaría lo guardado. Por eso
// NO persistimos correo, alias ni ubicación (ni el consentimiento). Con TTL.
const DRAFT_KEY = "nido:ayuda-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DRAFT_FIELDS = ["needCategory", "urgency", "language"] as const;

export function HelpRequestForm({
  preferredProfessionalId,
  preferredProfessionalName,
  preferredProfessionalNonClinical,
}: {
  preferredProfessionalId?: string;
  preferredProfessionalName?: string;
  preferredProfessionalNonClinical?: boolean;
} = {}) {
  const [state, action, pending] = useActionState(createHelpRequest, null);
  const formId = useId();
  const [locationMessage, setLocationMessage] = useState("");
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const persistDraft = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const draft: Record<string, string> = {};
    for (const name of DRAFT_FIELDS) {
      const value = data.get(name);
      if (typeof value === "string" && value !== "") draft[name] = value;
    }
    saveDraft(DRAFT_KEY, draft);
  }, []);

  // Restaurar el borrador al abrir, en el mismo dispositivo (si no caducó).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const saved = loadDraft<Record<string, unknown>>(DRAFT_KEY, DRAFT_TTL_MS);
    if (!saved) return;
    for (const name of DRAFT_FIELDS) {
      const value = saved[name];
      if (typeof value !== "string" || value === "") continue;
      const el = form.elements.namedItem(name);
      // DRAFT_FIELDS no incluye grupos de radio, así que namedItem devuelve un
      // único control; el cast a { value } solapa con input/select sin pelear con
      // el tipo RadioNodeList que TS contempla.
      if (el && "value" in el) {
        (el as { value: string }).value = value;
      }
    }
  }, []);

  // Si el envío falla, el borrador sigue a salvo aunque cierren la pestaña.
  useEffect(() => {
    if (state && !state.ok) persistDraft();
  }, [state, persistDraft]);
  const ids = {
    seekerName: `${formId}-seeker-name`,
    seekerNameHint: `${formId}-seeker-name-hint`,
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
    <form
      action={action}
      className="card"
      aria-busy={pending}
      ref={formRef}
      onChange={persistDraft}
      onSubmit={() => clearDraft(DRAFT_KEY)}
    >
      <input type="hidden" name="lat" value={coords.lat ?? ""} />
      <input type="hidden" name="lng" value={coords.lng ?? ""} />
      <input
        type="hidden"
        name="locationConsent"
        value={coords.lat ? "true" : "false"}
      />
      {preferredProfessionalId ? (
        <input
          type="hidden"
          name="preferredProfessionalId"
          value={preferredProfessionalId}
        />
      ) : null}
      {preferredProfessionalName ? (
        <div className="notice" role="status">
          <p style={{ margin: 0 }}>
            Le pides apoyo a <strong>{preferredProfessionalName}</strong>. Si
            prefieres, también puedes{" "}
            <a href="/ayuda">enviar tu mensaje a todo el equipo</a>.
          </p>
          {preferredProfessionalNonClinical ? (
            <p style={{ margin: "8px 0 0" }}>
              <strong>{preferredProfessionalName}</strong> es un auxiliar no
              clínico: acompaña con empatía, pero no es un profesional con
              licencia.
            </p>
          ) : null}
        </div>
      ) : null}

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
        <label htmlFor={ids.seekerName}>
          ¿Cómo quieres que te llamemos? (opcional)
        </label>
        <p className="hint" id={ids.seekerNameHint}>
          Un nombre o apodo. La persona que te acompañe lo verá al avisarle. No
          tiene que ser tu nombre real.
        </p>
        <input
          id={ids.seekerName}
          name="seekerName"
          type="text"
          maxLength={40}
          autoComplete="off"
          aria-describedby={ids.seekerNameHint}
        />
      </div>

      <div className="field">
        <label htmlFor={ids.email}>Tu correo (opcional)</label>
        <p className="hint" id={ids.emailHint}>
          Si lo dejas, una persona voluntaria puede escribirte. Si prefieres no
          darlo, también puedes{" "}
          <a href="/profesionales">hablar por chat con un profesional</a>.
        </p>
        <input
          id={ids.email}
          name="email"
          type="email"
          autoComplete="email"
          aria-describedby={ids.emailHint}
        />
      </div>

      <div className="checks">
        <label>
          <input name="consentContact" type="checkbox" required />
          Sí, quiero que el equipo de Nido me acompañe con esta solicitud.
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
          <output className="hint" aria-live="polite">
            {locationMessage}
          </output>
        </div>
      </details>

      {state && !state.ok ? (
        <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          {state.message}
        </p>
      ) : null}

      <div className="form-actions">
        <button
          className="button human block"
          name="enviarATodos"
          value="1"
          disabled={pending}
          aria-busy={pending}
          type="submit"
        >
          {pending ? "Enviando…" : "Enviar a todos los profesionales"}
        </button>
        <button
          className="button secondary block"
          disabled={pending}
          aria-busy={pending}
          type="submit"
        >
          Enviar y elegir a quién después
        </button>
      </div>
      <p className="hint">
        “Enviar a todos” difunde tu solicitud a todas las personas disponibles y
        te escribe la primera que pueda. Con datos mínimos; tu correo solo lo ve
        quien la acepte.
      </p>
    </form>
  );
}
