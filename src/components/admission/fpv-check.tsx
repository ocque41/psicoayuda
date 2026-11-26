"use client";

import { useCallback, useEffect, useState } from "react";
import type { FpvAdmissionCheck } from "@/lib/fpv-types";
import styles from "./admission.module.css";
import { formatAdmissionDate } from "./view-model";

const FPV_LOOKUP = "https://sistema.fpv.org.ve/consulta-psicologos";

type State =
  | { kind: "loading" }
  | { kind: "done"; result: FpvAdmissionCheck }
  | { kind: "failed" };

/** Texto para la referencia del cotejo: fuente, fecha y registro, sin cédula. */
export function fpvReference(result: FpvAdmissionCheck) {
  const colegios = result.official?.colegios
    .map(
      (entry) =>
        `${entry.colegio}${entry.solvencia ? " (solvente)" : " (sin solvencia)"}`,
    )
    .join(", ");
  return `Consulta pública FPV (sistema.fpv.org.ve) del ${formatAdmissionDate(result.checkedAt)}: Nº FPV ${result.fpv}${colegios ? `, ${colegios}` : ""}.`.slice(
    0,
    300,
  );
}

/**
 * Consulta automática del registro público de la FPV por el Nº FPV que
 * declaró la candidatura. Solo informa: la confirmación es de quien revisa.
 */
export function FpvCheck({
  professionalId,
  onUseReference,
}: {
  professionalId: string;
  onUseReference: (reference: string) => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(
        `/admin/admision/fpv/${encodeURIComponent(professionalId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("fpv");
      setState({
        kind: "done",
        result: (await response.json()) as FpvAdmissionCheck,
      });
    } catch {
      setState({ kind: "failed" });
    }
  }, [professionalId]);
  useEffect(() => {
    void load();
  }, [load]);

  const result = state.kind === "done" ? state.result : null;
  const official = result?.official;
  const unavailable =
    state.kind === "failed" || result?.status === "unavailable";
  return (
    <div className={styles.gate} aria-live="polite">
      <strong>Consulta automática en la FPV</strong>
      {state.kind === "loading" ? (
        <p className={styles.muted} role="status">
          Consultando el registro público de la Federación de Psicólogos de
          Venezuela…
        </p>
      ) : unavailable ? (
        <p className={styles.muted} role="status">
          No pudimos consultar la FPV ahora. Puedes reintentar o comprobarlo a
          mano en su consulta pública.
        </p>
      ) : result?.status === "not_found" ? (
        <p className={styles.notice} role="status">
          No aparece ningún psicólogo con el Nº FPV {result.fpv} en la consulta
          pública. Pide a la persona que confirme su número antes de aceptar.
        </p>
      ) : result && official ? (
        <>
          <p
            className={result.status === "match" ? styles.muted : styles.notice}
            role="status"
          >
            {result.status === "match"
              ? `✓ Registrado en la FPV con el Nº ${result.fpv} y el nombre coincide con el declarado.`
              : `⚠ El Nº FPV ${result.fpv} existe, pero a otro nombre. Comprueba que sea la misma persona.`}
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>Nombre en la FPV</dt>
              <dd>{official.nombreCompleto || "Sin nombre publicado"}</dd>
            </div>
            <div>
              <dt>Colegio</dt>
              <dd>
                {official.colegios.length
                  ? official.colegios
                      .map(
                        (entry) =>
                          `${entry.colegio} · ${entry.solvencia ? "solvente" : "sin solvencia"}`,
                      )
                      .join("; ")
                  : "Sin colegio publicado"}
              </dd>
            </div>
            <div>
              <dt>Título</dt>
              <dd>
                {[official.denominacionTitulo, official.universidad]
                  .filter(Boolean)
                  .join(" · ") || "Sin título publicado"}
                {result.universityMatch === false
                  ? " (la universidad no coincide con la declarada)"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Estado en la FPV</dt>
              <dd>
                {official.deletedAt
                  ? "Dado de baja"
                  : official.statusGeneral === false
                    ? "Inactivo"
                    : official.statusGeneral
                      ? "Activo"
                      : "Sin estado publicado"}
              </dd>
            </div>
          </dl>
          {result.status === "match" && !official.deletedAt ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => onUseReference(fpvReference(result))}
            >
              Usar como referencia de credenciales
            </button>
          ) : null}
        </>
      ) : null}
      <p className={styles.muted}>
        {unavailable ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void load()}
          >
            Reintentar
          </button>
        ) : null}{" "}
        <a href={FPV_LOOKUP} target="_blank" rel="noopener noreferrer">
          Abrir la consulta de la FPV ↗
        </a>
      </p>
    </div>
  );
}
