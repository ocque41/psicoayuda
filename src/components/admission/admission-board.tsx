"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type {
  AdmissionActions,
  AdmissionBoardData,
} from "@/lib/admission/types";
import styles from "./admission.module.css";
import { AdmissionConfiguration } from "./configuration";
import { AdmissionDetailDialog, type AdmissionPanel } from "./detail-dialog";
import {
  admissionGateLabels,
  admissionHref,
  completedGates,
  formatAdmissionDate,
} from "./view-model";

export function AdmissionBoard({
  data,
  actions,
}: {
  data: AdmissionBoardData;
  actions: AdmissionActions;
}) {
  const board = useRef<HTMLElement>(null);
  const [configure, setConfigure] = useState(false);
  const [notice, setNotice] = useState<{
    professionalId: string;
    message: string;
  } | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<{
    professionalId: string;
    panel: AdmissionPanel;
  } | null>(null);
  const visibleStages = data.stageFilter
    ? data.stages.filter((stage) => stage.id === data.stageFilter)
    : data.stages;
  function scrollBoard(direction: -1 | 1) {
    board.current?.scrollBy({
      left: direction * 260,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>Revisión profesional</p>
          <h2>Un paso claro hacia Nido.</h2>
          <p className={styles.description}>
            Identidad, credenciales, ámbitos e entrevista antes de publicar cada
            perfil.
          </p>
        </div>
        {data.canConfigure ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setConfigure(true)}
          >
            Ajustar etapas
          </button>
        ) : null}
      </header>
      {notice ? (
        <p className={styles.success} role="status">
          {notice.message}
        </p>
      ) : null}
      {data.limitedReviewer ? (
        <p className={styles.notice}>
          Este espacio está limitado a nuevos profesionales pendientes de
          admisión.
        </p>
      ) : null}
      <form className={styles.toolbar} action="/admin/admision" method="get">
        <label>
          Buscar profesional
          <input
            type="search"
            name="q"
            defaultValue={data.query}
            placeholder="Nombre o correo"
            maxLength={100}
          />
        </label>
        <label>
          Etapa
          <select name="etapa" defaultValue={data.stageFilter}>
            <option value="">Todas las etapas</option>
            {data.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.rowActions}>
          <button type="submit" className={styles.primary}>
            Aplicar filtros
          </button>
          {data.query || data.stageFilter ? (
            <Link href="/admin/admision" className={styles.secondary}>
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>
      <div className={styles.topbar}>
        <p className={styles.muted} role="status">
          {data.candidates.length}{" "}
          {data.candidates.length === 1 ? "profesional" : "profesionales"} en
          esta página · Página {data.page}
        </p>
        {visibleStages.length > 1 ? (
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Ver etapas anteriores"
              onClick={() => scrollBoard(-1)}
            >
              ←
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Ver etapas siguientes"
              onClick={() => scrollBoard(1)}
            >
              →
            </button>
          </div>
        ) : null}
      </div>
      {!data.candidates.length ? (
        <div className={styles.empty}>
          <strong>
            {data.query || data.stageFilter
              ? "No encontramos coincidencias."
              : "La bandeja de admisión está al día."}
          </strong>
          <p>
            {data.query || data.stageFilter
              ? "Prueba otro nombre o revisa todas las etapas."
              : "Los nuevos perfiles clínicos pendientes aparecerán aquí. Los perfiles ya publicados mantienen su estado e historial."}
          </p>
        </div>
      ) : null}
      <section
        ref={board}
        className={styles.board}
        aria-label="Etapas de admisión, desplazamiento horizontal"
      >
        {visibleStages.map((stage) => {
          const candidates = data.candidates.filter(
            (candidate) => candidate.stageId === stage.id,
          );
          return (
            <section
              className={styles.column}
              key={stage.id}
              aria-label={`${stage.label}: ${data.stageCounts[stage.id] ?? 0} profesionales en esta etapa`}
            >
              <header className={styles.columnHead}>
                <h3>{stage.label}</h3>
                <span className={styles.count} aria-hidden="true">
                  {data.stageCounts[stage.id] ?? 0}
                </span>
              </header>
              <ul className={styles.cards}>
                {candidates.map((candidate) => (
                  <li key={candidate.professionalId}>
                    <Link
                      className={styles.card}
                      href={admissionHref(data, {
                        candidate: candidate.professionalId,
                      })}
                    >
                      <div>
                        <strong>{candidate.name}</strong>
                        <span className={styles.cardMeta}>
                          {candidate.country || "País pendiente"}
                        </span>
                      </div>
                      <div className={styles.checks}>
                        {Object.entries(admissionGateLabels).map(
                          ([gate, label]) => (
                            <span
                              key={gate}
                              className={styles.badge}
                              data-complete={
                                candidate.gates[
                                  gate as keyof typeof candidate.gates
                                ]
                              }
                            >
                              {candidate.gates[
                                gate as keyof typeof candidate.gates
                              ]
                                ? "✓ "
                                : "○ "}
                              {label}
                            </span>
                          ),
                        )}
                      </div>
                      <span className={styles.cardMeta}>
                        {completedGates(candidate.gates)} de 4 revisiones ·{" "}
                        {candidate.hasDocument
                          ? "Documento disponible"
                          : "Sin documento adjunto"}
                      </span>
                      <span className={styles.cardMeta}>
                        Actualizado {formatAdmissionDate(candidate.updatedAt)}
                      </span>
                      <span>Revisar perfil →</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {!candidates.length ? (
                <p className={styles.muted}>Sin perfiles en esta página.</p>
              ) : null}
            </section>
          );
        })}
      </section>
      <nav className={styles.pagination} aria-label="Páginas de admisión">
        <span className={styles.muted}>
          Las cifras de las etapas incluyen todas las páginas.
        </span>
        <div className={styles.rowActions}>
          {data.page > 1 ? (
            <Link
              className={styles.secondary}
              href={admissionHref(data, { page: data.page - 1 })}
            >
              ← Anterior
            </Link>
          ) : null}
          {data.hasMore ? (
            <Link
              className={styles.secondary}
              href={admissionHref(data, { page: data.page + 1 })}
            >
              Siguiente →
            </Link>
          ) : null}
        </div>
      </nav>
      {data.selected ? (
        <AdmissionDetailDialog
          key={`${data.selected.professionalId}:${data.selected.revision}:${data.selected.profileRevision}`}
          data={data}
          candidate={data.selected}
          actions={actions}
          initialTab={
            selectedPanel?.professionalId === data.selected.professionalId
              ? selectedPanel.panel
              : "profile"
          }
          onTabChange={(panel) =>
            setSelectedPanel({
              professionalId: data.selected?.professionalId ?? "",
              panel,
            })
          }
          notice={
            notice?.professionalId === data.selected.professionalId
              ? notice.message
              : undefined
          }
          onSavedNotice={(message) =>
            setNotice({
              professionalId: data.selected?.professionalId ?? "",
              message,
            })
          }
        />
      ) : null}
      {configure && data.canConfigure ? (
        <AdmissionConfiguration
          key={data.configRevision}
          data={data}
          action={actions.configure}
          onClose={() => setConfigure(false)}
          notice={
            notice?.professionalId === "configuration"
              ? notice.message
              : undefined
          }
          onSavedNotice={(message) =>
            setNotice({ professionalId: "configuration", message })
          }
        />
      ) : null}
    </div>
  );
}
