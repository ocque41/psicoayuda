"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  AdmissionAction,
  AdmissionBoardData,
  AdmissionStage,
} from "@/lib/admission/types";
import { AdmissionActionForm } from "./action-form";
import styles from "./admission.module.css";
import { AdmissionDialog } from "./dialog-frame";
import { moveAdmissionStage } from "./view-model";

export function AdmissionConfiguration({
  data,
  action,
  onClose,
  notice,
  onSavedNotice,
}: {
  data: AdmissionBoardData;
  action: AdmissionAction;
  onClose: () => void;
  notice?: string;
  onSavedNotice?: (message: string) => void;
}) {
  const router = useRouter();
  const [stages, setStages] = useState<AdmissionStage[]>(() =>
    data.stages.map((stage) => ({ ...stage })),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  function update(next: AdmissionStage[]) {
    setStages(next);
    setDirty(true);
  }
  return (
    <AdmissionDialog
      title="Etapas a tu manera."
      description="Cambia las etiquetas y el orden de revisión. Los cuatro controles esenciales y la publicación permanecen protegidos."
      onClose={onClose}
      dirty={dirty}
      busy={busy}
    >
      {notice ? (
        <p className={styles.success} role="status">
          {notice}
        </p>
      ) : null}
      <AdmissionActionForm
        action={action}
        submit="Guardar etapas"
        onBusyChange={setBusy}
        disabled={refreshing}
        onChange={() => setDirty(true)}
        onSaved={(state) => {
          setDirty(false);
          onSavedNotice?.(state.message);
          startRefresh(() => router.refresh());
        }}
      >
        <input
          type="hidden"
          name="configRevision"
          value={data.configRevision}
        />
        <input type="hidden" name="stagesJSON" value={JSON.stringify(stages)} />
        <ol className={styles.stageList} aria-label="Orden de las etapas">
          {stages.map((stage, index) => (
            <li key={stage.id} className={styles.stageRow}>
              <label>
                {index + 1}. {stage.core ? "Etapa esencial" : "Etapa adicional"}
                <input
                  value={stage.label}
                  maxLength={48}
                  minLength={2}
                  required
                  onChange={(event) =>
                    update(
                      stages.map((item) =>
                        item.id === stage.id
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  disabled={index === 0 || stage.id === "publication"}
                  aria-label={`Subir etapa ${stage.label}`}
                  onClick={() => update(moveAdmissionStage(stages, index, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  disabled={
                    index >= stages.length - 2 || stage.id === "publication"
                  }
                  aria-label={`Bajar etapa ${stage.label}`}
                  onClick={() => update(moveAdmissionStage(stages, index, 1))}
                >
                  ↓
                </button>
                {!stage.core ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() =>
                      update(stages.filter((item) => item.id !== stage.id))
                    }
                  >
                    Quitar etapa
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={styles.secondary}
          disabled={stages.length >= 12}
          onClick={() => {
            const extra = {
              id: `custom_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
              label: "Nueva etapa",
              core: false,
            };
            update([...stages.slice(0, -1), extra, stages[stages.length - 1]]);
          }}
        >
          + Añadir etapa opcional
        </button>
        <p className={styles.muted}>
          Hasta 12 etapas. Antes de quitar una etapa adicional, mueve sus
          candidaturas a otra. El historial se conserva.
        </p>
        <label>
          Motivo del ajuste
          <input
            name="reference"
            required
            minLength={5}
            maxLength={300}
            placeholder="Qué cambia y por qué"
          />
        </label>
      </AdmissionActionForm>
    </AdmissionDialog>
  );
}
