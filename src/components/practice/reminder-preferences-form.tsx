"use client";
import { useEffect, useState } from "react";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import {
  REMINDER_OFFSET_LABELS,
  REMINDER_OFFSETS,
  type ReminderPreferencesView,
} from "@/lib/practice/reminder-options";
import { PracticeForm, TimeZoneSelect } from "./forms";
import styles from "./reminder-preferences.module.css";

export function ReminderPreferencesForm({
  preferences,
  action,
}: {
  preferences: ReminderPreferencesView;
  action: (
    state: PracticeFormState,
    data: FormData,
  ) => Promise<PracticeFormState>;
}) {
  const [enabled, setEnabled] = useState(preferences.emailEnabled);
  const [offsets, setOffsets] = useState([
    preferences.offsets[0] || 1440,
    preferences.offsets[1] || 0,
    preferences.offsets[2] || 0,
  ]);
  const storedOffsets = preferences.offsets.join(",");
  useEffect(() => {
    setEnabled(preferences.emailEnabled);
    const values = storedOffsets.split(",").map(Number);
    setOffsets([values[0] || 1440, values[1] || 0, values[2] || 0]);
  }, [preferences.emailEnabled, storedOffsets]);
  const canEnable = preferences.emailVerified && preferences.providerReady;
  return (
    <PracticeForm action={action} submit="Guardar recordatorios">
      <input type="hidden" name="revision" value={preferences.revision} />
      <label className="practice-check">
        <input
          type="checkbox"
          name="emailEnabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={!enabled && !canEnable}
        />
        Quiero recibir recordatorios de mis sesiones por correo.
      </label>
      <p className="hint">
        Están desactivados hasta que tú los actives. Puedes elegir hasta tres
        avisos distintos por sesión y desactivarlos cuando quieras.
      </p>
      {!preferences.emailVerified ? (
        <p className="hint">
          Verifica el correo de tu cuenta para activar los avisos.
        </p>
      ) : !preferences.providerReady ? (
        <p className="hint">
          El envío por correo todavía no está disponible. Tus recordatorios se
          mantienen desactivados.
        </p>
      ) : null}
      <div className={styles.slots}>
        {[0, 1, 2].map((slot) => (
          <label key={slot}>
            {slot === 0
              ? "Primer aviso"
              : slot === 1
                ? "Segundo aviso"
                : "Tercer aviso"}
            <select
              name="offsetMinutes"
              value={offsets[slot]}
              onChange={(event) =>
                setOffsets((previous) =>
                  previous.map((value, index) =>
                    index === slot ? Number(event.target.value) : value,
                  ),
                )
              }
            >
              <option value="0">Sin aviso</option>
              {REMINDER_OFFSETS.map((offset) => (
                <option key={offset} value={offset}>
                  {REMINDER_OFFSET_LABELS[offset]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <TimeZoneSelect value={preferences.timeZone} />
      <p className="hint">
        Esta zona se usa para presentar la hora del recordatorio. No cambia el
        horario de tus sesiones. El envío se comprueba cada cinco minutos y
        puede llegar con unos minutos de diferencia.
      </p>
      <p className="hint">
        El correo muestra la hora y un enlace para entrar a Nido. No incluye
        nombres de pacientes, notas ni conversaciones.
      </p>
    </PracticeForm>
  );
}
