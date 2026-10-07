"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { PatientProfileContent } from "@/lib/practice/patient-profile-fields-model";
import { patientSexLabels } from "@/lib/practice/patient-profile-fields-model";
import styles from "./patient-profile.module.css";

export function PatientProfileConflict({
  draft,
  saved,
  busy,
  onConsult,
  onKeep,
}: {
  draft: PatientProfileContent;
  saved: PatientProfileContent | null;
  busy: boolean;
  onConsult: (choice?: "draft" | "saved") => void;
  onKeep: () => void;
}) {
  const id = useId();
  const [confirm, setConfirm] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const checkbox = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (saved) heading.current?.focus();
  }, [saved]);
  useEffect(() => {
    if (confirm) checkbox.current?.focus();
  }, [confirm]);
  return (
    <section
      className={styles.conflict}
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <h3 ref={heading} id={`${id}-title`} tabIndex={-1}>
        Comparar la ficha completa
      </h3>
      <p>
        Sexo, nacimiento, motivo y nota general se guardan juntos. Consultar no
        cambia tu borrador ni guarda datos. Las notas por sesión siguen
        separadas.
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => onConsult()}
      >
        Consultar ficha guardada
      </button>
      {saved ? (
        <>
          <div className={styles.versions}>
            {(
              [
                ["Mi borrador de ficha", draft],
                ["Ficha guardada", saved],
              ] as const
            ).map(([label, content], index) => (
              <section key={label} aria-labelledby={`${id}-${index}`}>
                <h4 id={`${id}-${index}`}>{label}</h4>
                <dl>
                  <dt>Sexo</dt>
                  <dd>{patientSexLabels[content.sex]}</dd>
                  <dt>Fecha de nacimiento</dt>
                  <dd>{content.birthDate || "Sin registrar"}</dd>
                </dl>
                <label htmlFor={`${id}-reason-${index}`}>
                  Motivo · {label}
                  <textarea
                    id={`${id}-reason-${index}`}
                    readOnly
                    value={content.consultationReason}
                    rows={3}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label htmlFor={`${id}-note-${index}`}>
                  Nota general · {label}
                  <textarea
                    id={`${id}-note-${index}`}
                    readOnly
                    value={content.generalNote}
                    rows={5}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </section>
            ))}
          </div>
          <p>
            Revisa los cuatro campos antes de elegir. Puedes preparar tu
            borrador sobre esta versión y combinar los cambios en el formulario.
            Sólo se escribirá al guardar con autorización manual.
          </p>
          <div className={styles.conflictActions}>
            <button
              type="button"
              className="button human"
              disabled={busy}
              onClick={() => onConsult("draft")}
            >
              Revisé los campos; continuar con mi borrador
            </button>
            <button
              ref={replace}
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setConfirm(true);
                setReviewed(false);
              }}
            >
              Usar ficha guardada
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onKeep}
            >
              Cerrar comparación y seguir editando
            </button>
          </div>
          {confirm ? (
            <div className={styles.confirm}>
              <p>
                Esto reemplazará los cuatro campos del borrador en esta ventana.
                No escribe ni elimina datos guardados.
              </p>
              <label className="practice-check">
                <input
                  ref={checkbox}
                  type="checkbox"
                  disabled={busy}
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                He conservado los cambios de los cuatro campos que necesito.
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !reviewed}
                onClick={() => onConsult("saved")}
              >
                Confirmar uso de la ficha guardada
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setConfirm(false);
                  setReviewed(false);
                  replace.current?.focus();
                }}
              >
                Cancelar reemplazo
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
