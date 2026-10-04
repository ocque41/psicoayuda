"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type {
  AdmissionActions,
  AdmissionBoardData,
  AdmissionDetail,
} from "@/lib/admission/types";
import { countries } from "@/lib/constants";
import { TIME_ZONES } from "@/lib/geography";
import { AdmissionActionForm } from "./action-form";
import styles from "./admission.module.css";
import { AdmissionDialog } from "./dialog-frame";
import { admissionHref, formatAdmissionDate } from "./view-model";

const tabs = [
  { id: "profile", label: "Perfil" },
  { id: "review", label: "Documentos" },
  { id: "scope", label: "Ámbitos" },
  { id: "interview", label: "Entrevista" },
  { id: "publish", label: "Publicación" },
  { id: "history", label: "Historial" },
] as const;
export type AdmissionPanel = (typeof tabs)[number]["id"];

export function AdmissionDetailDialog({
  data,
  candidate,
  actions,
  initialTab = "profile",
  onTabChange,
  notice,
  onSavedNotice,
}: {
  data: AdmissionBoardData;
  candidate: AdmissionDetail;
  actions: AdmissionActions;
  initialTab?: AdmissionPanel;
  onTabChange?: (tab: AdmissionPanel) => void;
  notice?: string;
  onSavedNotice?: (message: string) => void;
}) {
  const router = useRouter();
  const prefix = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState<AdmissionPanel>(initialTab);
  const [saving, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const [dirtyForms, setDirtyForms] = useState<string[]>([]);
  const [identityChecked, setIdentityChecked] = useState(
    candidate.gates.identity,
  );
  const [credentialsChecked, setCredentialsChecked] = useState(
    candidate.gates.credentials,
  );
  const [interviewCompleted, setInterviewCompleted] = useState(
    candidate.interview.completed,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [scopePage, setScopePage] = useState(1);
  const dirty = dirtyForms.length > 0;
  function markDirty(form: string) {
    setDirtyForms((current) =>
      current.includes(form) ? current : [...current, form],
    );
  }
  function saved(form: string, message: string) {
    setDirtyForms((current) => current.filter((item) => item !== form));
    onSavedNotice?.(message);
    startRefresh(() => router.refresh());
  }
  function changeTab(next: AdmissionPanel) {
    setTab(next);
    onTabChange?.(next);
  }
  function panelProps(id: AdmissionPanel) {
    return {
      id: `${prefix}-panel-${id}`,
      role: "tabpanel" as const,
      "aria-labelledby": `${prefix}-tab-${id}`,
      hidden: tab !== id,
      className: styles.panel,
    };
  }
  const ids = (
    <>
      <input
        type="hidden"
        name="professionalId"
        value={candidate.professionalId}
      />
      <input type="hidden" name="revision" value={candidate.revision} />
      <input
        type="hidden"
        name="profileRevision"
        value={candidate.profileRevision}
      />
      <input type="hidden" name="configRevision" value={data.configRevision} />
    </>
  );
  return (
    <AdmissionDialog
      title={candidate.name}
      description={`${candidate.country || "País por confirmar"} · ${candidate.email}`}
      dirty={dirty}
      busy={busy}
      onClose={() => router.replace(admissionHref(data), { scroll: false })}
    >
      <div
        role="tablist"
        aria-label="Revisión del profesional"
        className={styles.tabs}
      >
        {tabs.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${item.id}`}
            aria-controls={`${prefix}-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={styles.tab}
            disabled={busy}
            onClick={() => changeTab(item.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft")
                next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              changeTab(tabs[next].id);
              tabRefs.current[next]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {dirty ? (
        <p className={styles.notice} role="status">
          Guarda los cambios del apartado que estás editando antes de usar otra
          acción. Puedes cambiar de pestaña sin perder los campos.
        </p>
      ) : null}
      {notice ? (
        <p className={styles.success} role="status">
          {notice}
        </p>
      ) : null}

      <section {...panelProps("profile")}>
        <div className={styles.formGrid}>
          <div className={styles.gate}>
            <strong>Formación declarada</strong>
            <p className={styles.muted}>
              {candidate.profile.university || "Universidad no indicada"}
            </p>
            <p className={styles.muted}>
              País de credencial: {candidate.licenseCountry || "Por confirmar"}
            </p>
          </div>
          <div className={styles.gate}>
            <strong>Registro declarado</strong>
            <p className={styles.muted}>
              {candidate.profile.licenseNumber ||
                candidate.profile.fpvNumber ||
                "Registro no indicado"}
            </p>
            <p className={styles.muted}>
              {candidate.profile.registrationType ||
                "Tipo de registro por confirmar"}
            </p>
            {candidate.profile.registrationDetail ? (
              <p className={styles.muted}>
                {candidate.profile.registrationDetail}
              </p>
            ) : null}
          </div>
        </div>
        {candidate.profile.fpvVerified ? (
          <p className={styles.notice}>
            Hay una coincidencia con el registro FPV. La identidad,
            documentación y autorización de ejercicio requieren revisión humana.
          </p>
        ) : null}
        {candidate.hasDocument ? (
          <a
            className={styles.secondary}
            href={`/admin/admision/documento/${encodeURIComponent(candidate.professionalId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir documento privado ↗
          </a>
        ) : (
          <p className={styles.muted}>
            No hay un documento adjunto. Conserva únicamente una referencia del
            cotejo; evita copiar documentos o números de identidad en las notas.
          </p>
        )}
        <AdmissionActionForm
          action={actions.moveStage}
          submit="Guardar cambio de etapa"
          disabled={busy || dirtyForms.some((form) => form !== "move")}
          onBusyChange={setBusy}
          onChange={() => markDirty("move")}
          onSaved={(state) => saved("move", state.message)}
        >
          {ids}
          <label>
            Etapa actual
            <select name="stageId" defaultValue={candidate.stageId}>
              {data.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motivo del cambio
            <input
              name="reference"
              required
              minLength={5}
              maxLength={300}
              placeholder="Qué se ha revisado o qué falta"
            />
          </label>
          <p className={styles.muted}>
            Avanzar requiere completar el control de la etapa que se deja.
            Retroceder conserva las revisiones y el historial.
          </p>
        </AdmissionActionForm>
      </section>

      <div hidden={tab !== "review" && tab !== "interview"}>
        <AdmissionActionForm
          action={actions.saveReview}
          disabled={busy || dirtyForms.some((form) => form !== "review")}
          onBusyChange={setBusy}
          onChange={() => markDirty("review")}
          onSaved={(state) => saved("review", state.message)}
          onInvalid={(event) => {
            const input = event.target as HTMLInputElement;
            const panel = input.closest<HTMLElement>("[role=tabpanel]");
            if (!panel?.hidden) return;
            event.preventDefault();
            changeTab(panel.id.endsWith("-interview") ? "interview" : "review");
            requestAnimationFrame(() => {
              input.focus();
              input.reportValidity();
            });
          }}
        >
          {ids}
          <section {...panelProps("review")}>
            <p className={styles.muted}>
              Registra dónde y cómo cotejaste los datos. No copies cédulas,
              correos, teléfonos ni otros datos de identidad en las referencias.
            </p>
            <div className={styles.gate}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  name="identityChecked"
                  checked={identityChecked}
                  onChange={(event) => setIdentityChecked(event.target.checked)}
                />
                He cotejado la identidad del profesional.
              </label>
              <label>
                Referencia del cotejo de identidad
                <input
                  name="identityReference"
                  defaultValue={candidate.evidence.identity}
                  required={identityChecked}
                  minLength={5}
                  maxLength={300}
                  placeholder="Canal y método de verificación"
                />
              </label>
            </div>
            <div className={styles.gate}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  name="credentialsChecked"
                  checked={credentialsChecked}
                  onChange={(event) =>
                    setCredentialsChecked(event.target.checked)
                  }
                />
                He revisado la formación y las credenciales.
              </label>
              <label>
                Referencia de la revisión de credenciales
                <input
                  name="credentialsReference"
                  defaultValue={candidate.evidence.credentials}
                  required={credentialsChecked}
                  minLength={5}
                  maxLength={300}
                  placeholder="Registro o fuente de comprobación"
                />
              </label>
            </div>
          </section>
          <section {...panelProps("interview")}>
            <p className={styles.muted}>
              Programa la entrevista en su zona horaria y conserva una
              referencia de lo revisado. No se envía una invitación
              automáticamente.
            </p>
            <div className={styles.formGrid}>
              <label>
                Fecha y hora local
                <input
                  type="datetime-local"
                  name="interviewLocal"
                  defaultValue={candidate.interview.localDateTime}
                  required={interviewCompleted}
                />
              </label>
              <label>
                Zona horaria
                <select
                  name="interviewTimeZone"
                  defaultValue={
                    candidate.interview.timeZone || "America/Caracas"
                  }
                >
                  {Array.from(
                    new Set([
                      candidate.interview.timeZone || "America/Caracas",
                      ...TIME_ZONES,
                    ]),
                  ).map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {candidate.interview.startsAt ? (
              <p className={styles.muted}>
                Guardada:{" "}
                {formatAdmissionDate(
                  candidate.interview.startsAt,
                  candidate.interview.timeZone,
                )}{" "}
                · {candidate.interview.timeZone}
              </p>
            ) : null}
            <label>
              Referencia de la entrevista
              <textarea
                name="interviewReference"
                defaultValue={candidate.interview.reference}
                minLength={5}
                maxLength={300}
                required={interviewCompleted}
                placeholder="Qué se cotejó y resultado de la entrevista, sin información clínica"
              />
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                name="interviewCompleted"
                checked={interviewCompleted}
                onChange={(event) =>
                  setInterviewCompleted(event.target.checked)
                }
              />
              La entrevista se ha realizado y revisado.
            </label>
          </section>
          <p className={styles.muted}>
            Guardar conserva la revisión de documentos y la entrevista de esta
            ficha.
          </p>
        </AdmissionActionForm>
      </div>

      <section {...panelProps("scope")}>
        <p className={styles.muted}>
          Revisa cada país por separado. Un país de residencia o una
          coincidencia en un registro no conceden autorización internacional.
        </p>
        {candidate.scopes.length ? (
          <ul className={styles.history}>
            {candidate.scopes
              .slice((scopePage - 1) * 5, scopePage * 5)
              .map((scope) => (
                <li key={scope.id}>
                  <strong>{scope.country}</strong>{" "}
                  <span className={styles.badge} data-complete={scope.valid}>
                    {scope.valid ? "Vigente" : "Vencido"}
                  </span>
                  <p>{scope.reference}</p>
                  <time dateTime={scope.expiresAt}>
                    Revisar antes de {formatAdmissionDate(scope.expiresAt)}
                  </time>
                </li>
              ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            Todavía no hay ámbitos de atención revisados.
          </p>
        )}
        {candidate.scopes.length > 5 ? (
          <nav
            className={styles.pagination}
            aria-label="Páginas de ámbitos revisados"
          >
            <span className={styles.muted}>
              Página {scopePage} de {Math.ceil(candidate.scopes.length / 5)}
            </span>
            <div className={styles.rowActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={scopePage === 1}
                onClick={() => setScopePage((page) => page - 1)}
              >
                ← Anterior
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={scopePage * 5 >= candidate.scopes.length}
                onClick={() => setScopePage((page) => page + 1)}
              >
                Siguiente →
              </button>
            </div>
          </nav>
        ) : null}
        <AdmissionActionForm
          action={actions.saveScope}
          submit="Guardar ámbito revisado"
          disabled={busy || dirtyForms.some((form) => form !== "scope")}
          onBusyChange={setBusy}
          onChange={() => markDirty("scope")}
          onSaved={(state) => saved("scope", state.message)}
        >
          {ids}
          <div className={styles.formGrid}>
            <label>
              País de atención
              <select
                name="country"
                required
                defaultValue={
                  candidate.licenseCountry &&
                  (countries as readonly string[]).includes(
                    candidate.licenseCountry,
                  )
                    ? candidate.licenseCountry
                    : ""
                }
              >
                <option value="" disabled>
                  Elige un país
                </option>
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Próxima revisión
              <input type="date" name="expiresAt" required />
            </label>
          </div>
          <label>
            Referencia del ámbito
            <input
              name="registryReference"
              required
              minLength={5}
              maxLength={300}
              placeholder="Fuente y comprobación del permiso para ejercer"
            />
          </label>
          <label className={styles.checkbox}>
            <input name="checked" type="checkbox" required />
            He cotejado la autorización de atención para este país.
          </label>
        </AdmissionActionForm>
      </section>

      <section {...panelProps("publish")}>
        <h3>Una decisión explícita.</h3>
        <p className={styles.muted}>
          Publicar aprueba el perfil clínico y permite su aparición en el
          catálogo. La revisión humana no se sustituye por el orden de las
          tarjetas.
        </p>
        {candidate.publishBlockers.length ? (
          <div className={styles.notice}>
            <strong>Antes de publicar</strong>
            <ul>
              {candidate.publishBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.success}>
            Los controles guardados permiten solicitar la publicación. Nido
            volverá a comprobarlos al confirmar.
          </p>
        )}
        {dirtyForms.some((form) => form !== "publish") ? (
          <p className={styles.notice}>
            Guarda primero los cambios en los otros apartados de esta ficha.
          </p>
        ) : null}
        <p className={styles.muted}>
          Compromiso de conducta:{" "}
          {candidate.profile.conductAccepted
            ? "aceptado por el profesional"
            : "pendiente de aceptación"}
          .
        </p>
        <AdmissionActionForm
          action={actions.publish}
          submit="Confirmar publicación del perfil"
          disabled={
            busy ||
            !candidate.canPublish ||
            dirtyForms.some((form) => form !== "publish")
          }
          submitDisabled={!confirmed}
          onBusyChange={setBusy}
          onChange={() => markDirty("publish")}
          onSaved={(state) => {
            if (state.published) {
              setDirtyForms([]);
              onSavedNotice?.(state.message);
              startRefresh(() =>
                router.replace(
                  `${admissionHref(data)}${admissionHref(data).includes("?") ? "&" : "?"}publicado=1`,
                  { scroll: false },
                ),
              );
            } else saved("publish", state.message);
          }}
        >
          {ids}
          <label>
            Referencia de la decisión
            <input
              name="reference"
              required
              minLength={5}
              maxLength={300}
              placeholder="Motivo de la aprobación tras la revisión"
              disabled={!candidate.canPublish}
            />
          </label>
          <label className={styles.checkbox}>
            <input
              name="confirm"
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={!candidate.canPublish}
              required
            />
            Confirmo que he revisado los requisitos y quiero publicar este
            perfil.
          </label>
        </AdmissionActionForm>
      </section>

      <section {...panelProps("history")}>
        <p className={styles.muted}>
          Fechas del historial en UTC. La entrevista se presenta en la zona
          horaria indicada.
        </p>
        {candidate.history.length ? (
          <ol className={styles.history}>
            {candidate.history.map((event) => (
              <li key={event.id}>
                <strong>{event.summary}</strong>
                {Array.from(new Set(event.details ?? []))
                  .slice(0, 6)
                  .map((detail) => (
                    <p key={`${event.id}-detail-${detail}`}>
                      {detail.slice(0, 350)}
                    </p>
                  ))}
                <p className={styles.muted}>{event.actorLabel}</p>
                <time dateTime={event.createdAt}>
                  {formatAdmissionDate(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>
            Las decisiones y cambios guardados aparecerán aquí.
          </p>
        )}
        <nav
          className={styles.pagination}
          aria-label="Páginas del historial de admisión"
        >
          <span className={styles.muted}>Página {candidate.historyPage}</span>
          <div className={styles.rowActions}>
            {candidate.historyPage > 1 ? (
              <Link
                className={styles.secondary}
                aria-disabled={dirty || busy}
                onClick={(event) => {
                  if (dirty || busy) event.preventDefault();
                }}
                href={admissionHref(data, {
                  candidate: candidate.professionalId,
                  historyPage: candidate.historyPage - 1,
                })}
              >
                ← Anterior
              </Link>
            ) : null}
            {candidate.historyHasMore ? (
              <Link
                className={styles.secondary}
                aria-disabled={dirty || busy}
                onClick={(event) => {
                  if (dirty || busy) event.preventDefault();
                }}
                href={admissionHref(data, {
                  candidate: candidate.professionalId,
                  historyPage: candidate.historyPage + 1,
                })}
              >
                Siguiente →
              </Link>
            ) : null}
          </div>
        </nav>
      </section>
    </AdmissionDialog>
  );
}
