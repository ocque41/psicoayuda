"use client";

import { useId, useMemo } from "react";
import {
  emptyPatientProfile,
  type PatientProfileContent,
  patientSexLabels,
  patientSexValues,
} from "@/lib/practice/patient-profile-fields-model";
import styles from "./patient-profile.module.css";

function currentDate(timeZone: string) {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
  } catch {
    zone = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Los campos son opcionales y no conservan borradores fuera de esta ventana. */
export function PatientProfileFields({
  content = emptyPatientProfile,
  onChange,
  collapsible = false,
  timeZone = "America/Caracas",
}: {
  content?: PatientProfileContent;
  onChange?: (content: PatientProfileContent) => void;
  collapsible?: boolean;
  timeZone?: string;
}) {
  const id = useId();
  const birthMaximum = useMemo(() => currentDate(timeZone), [timeZone]);
  function valueFor(key: keyof PatientProfileContent) {
    return onChange ? { value: content[key] } : { defaultValue: content[key] };
  }
  const fields = (
    <div className={styles.fields}>
      <div className={styles.row}>
        <label>
          Sexo (opcional)
          <select
            name="sex"
            autoComplete="off"
            {...valueFor("sex")}
            onChange={(event) =>
              onChange?.({
                ...content,
                sex: event.target.value as PatientProfileContent["sex"],
              })
            }
          >
            {patientSexValues.map((value) => (
              <option key={value} value={value}>
                {patientSexLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha de nacimiento (opcional)
          <input
            name="birthDate"
            type="date"
            min="0001-01-01"
            max={birthMaximum}
            autoComplete="off"
            {...valueFor("birthDate")}
            onInvalid={(event) => {
              const disclosure = event.currentTarget.closest("details");
              if (disclosure) disclosure.open = true;
            }}
            onFocus={(event) => {
              // En creación se puede cambiar la zona antes de elegir la fecha.
              const field =
                event.currentTarget.form?.elements.namedItem("timeZone");
              const zone =
                field instanceof HTMLSelectElement ? field.value : timeZone;
              event.currentTarget.max = currentDate(zone);
            }}
            onChange={(event) =>
              onChange?.({ ...content, birthDate: event.target.value })
            }
          />
        </label>
      </div>
      <label>
        Motivo de consulta (opcional)
        <textarea
          name="consultationReason"
          rows={3}
          maxLength={2000}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-reason`}
          {...valueFor("consultationReason")}
          onChange={(event) =>
            onChange?.({ ...content, consultationReason: event.target.value })
          }
        />
      </label>
      <p id={`${id}-reason`} className={`hint ${styles.help}`}>
        Describe brevemente lo que la persona quiere trabajar. Hasta 2.000
        caracteres.
      </p>
      <label>
        Notas generales de la ficha (opcional)
        <textarea
          name="generalNote"
          rows={5}
          maxLength={12000}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-note`}
          {...valueFor("generalNote")}
          onChange={(event) =>
            onChange?.({ ...content, generalNote: event.target.value })
          }
        />
      </label>
      <p id={`${id}-note`} className={`hint ${styles.help}`}>
        Información general para tu seguimiento. Las notas de cada encuentro se
        guardan en «Notas por sesión». Hasta 12.000 caracteres.
      </p>
    </div>
  );
  return collapsible ? (
    <details className={styles.optional}>
      <summary>Datos adicionales (opcionales)</summary>
      <p className="hint">
        Sexo, fecha de nacimiento, motivo de consulta y notas generales. Guarda
        solamente los datos que la persona haya autorizado.
      </p>
      {fields}
    </details>
  ) : (
    fields
  );
}
