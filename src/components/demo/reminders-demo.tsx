"use client";

import { useState } from "react";
import type { BirdGuideStep } from "@/components/demo/bird-guide";
import { reminderGuideTopics } from "@/components/practice/reminder-guide";
import {
  REMINDER_OFFSET_LABELS,
  REMINDER_OFFSETS,
} from "@/lib/practice/reminder-options";
import styles from "./practice-demo.module.css";

export const reminderDemoSteps: BirdGuideStep[] = reminderGuideTopics.map(
  (topic) => ({
    ...topic,
    id: `recordatorios-${topic.id}`,
    targetId: `demo-recordatorios-${topic.id}`,
  }),
);

export function RemindersDemo() {
  const [enabled, setEnabled] = useState(false);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [offsets, setOffsets] = useState([1440, 0, 0]);
  const [notice, setNotice] = useState("");
  return (
    <>
      <p className="kicker">Avisos a tu gusto · ejemplo</p>
      <h2 id="demo-reminders-title">Recordatorios de tus sesiones.</h2>
      <p className="hint">
        En tu cuenta los encontrarás en Ajustes. Aquí puedes probarlos sin
        activar ningún envío; al recargar, el ejemplo vuelve a empezar.
      </p>
      <form
        className="practice-form"
        onSubmit={(event) => {
          event.preventDefault();
          const selected = offsets.filter((value) => value !== 0);
          if (
            enabled &&
            (!selected.length || new Set(selected).size !== selected.length)
          ) {
            setNotice("Elige de uno a tres avisos distintos para activarlos.");
            return;
          }
          if (!enabled) {
            const unique = [...new Set(selected)];
            const normalized = unique.length ? unique : [1440];
            setOffsets([normalized[0], normalized[1] || 0, normalized[2] || 0]);
          }
          setSavedEnabled(enabled);
          setNotice(
            enabled
              ? "Recordatorios activados en el ejemplo. Esta demo no envía correos."
              : "Recordatorios desactivados en el ejemplo. Las sesiones siguen igual.",
          );
        }}
      >
        {reminderGuideTopics.map((topic) => (
          <div id={`demo-recordatorios-${topic.id}`} key={topic.id}>
            <h3>{topic.title}</h3>
            <p>{topic.description}</p>
            {topic.id === "consentimiento" ? (
              <label className="practice-check">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    setEnabled(event.target.checked);
                    setNotice("");
                  }}
                />
                Quiero recibir recordatorios por correo · ejemplo
              </label>
            ) : topic.id === "anticipaciones" ? (
              <div>
                {[0, 1, 2].map((index) => (
                  <label className={styles.patientSwitcher} key={index}>
                    {index === 0
                      ? "Primer aviso"
                      : index === 1
                        ? "Segundo aviso"
                        : "Tercer aviso"}
                    <select
                      value={offsets[index]}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setOffsets((previous) =>
                          previous.map((current, slot) =>
                            slot === index ? value : current,
                          ),
                        );
                        setNotice("");
                      }}
                    >
                      <option value="0">Sin aviso</option>
                      {REMINDER_OFFSETS.map((value) => (
                        <option value={value} key={value}>
                          {REMINDER_OFFSET_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : topic.id === "desactivar" ? (
              <>
                <p>
                  Estado guardado del ejemplo:{" "}
                  <strong>{savedEnabled ? "Activados" : "Desactivados"}</strong>
                </p>
                <button type="submit" className="button human">
                  Guardar recordatorios
                </button>
                {notice ? <p role="status">{notice}</p> : null}
              </>
            ) : null}
          </div>
        ))}
      </form>
    </>
  );
}
