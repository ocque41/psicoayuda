"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type {
  AdmissionActions,
  AdmissionBoardData,
  AdmissionDetail,
  AdmissionFormState,
} from "@/lib/admission/types";
import { countries, needLabels } from "@/lib/constants";
import { countryName, TIME_ZONES } from "@/lib/geography";
import { AdmissionActionForm } from "./action-form";
import styles from "./admission.module.css";
import { AdmissionDialog } from "./dialog-frame";
import {
  admissionHref,
  admissionRegistrationLabel,
  formatAdmissionDate,
} from "./view-model";

const tabs = [
  { id: "profile", label: "Perfil" },
  { id: "screening", label: "Cuestionario" },
  { id: "review", label: "Documentos" },
  { id: "scope", label: "Ámbitos" },
  { id: "interview", label: "Entrevista" },
  { id: "publish", label: "Decisión" },
  { id: "history", label: "Historial" },
] as const;
export type AdmissionPanel = (typeof tabs)[number]["id"];
/** El apoyo voluntario no tiene documentos, ámbitos ni entrevista clínica. */
const volunteerPanels: readonly AdmissionPanel[] = [
  "profile",
  "screening",
  "publish",
  "history",
];

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
  const visibleTabs = candidate.volunteer
    ? tabs.filter((item) => volunteerPanels.includes(item.id))
    : tabs;
  const [tab, setTab] = useState<AdmissionPanel>(
    visibleTabs.some((item) => item.id === initialTab) ? initialTab : "profile",
  );
  const [saving, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const [dirtyForms, setDirtyForms] = useState<string[]>([]);
  const reviewForm = useRef<HTMLFormElement | null>(null);
  const [errorField, setErrorField] = useState<AdmissionFormState["field"]>();
  useEffect(() => {
    if (busy || tab !== "interview" || !errorField) return;
    const input = reviewForm.current?.elements.namedItem(errorField);
    if (input instanceof HTMLElement && input.isConnected) input.focus();
    setErrorField(undefined);
  }, [busy, tab, errorField]);
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
  const [rejectConfirmed, setRejectConfirmed] = useState(false);
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
      description={`${candidate.country ? countryName(candidate.country) : "País por confirmar"} · ${candidate.email}`}
      dirty={dirty}
      busy={busy}
      onClose={() => router.replace(admissionHref(data), { scroll: false })}
    >
      <div
        role="tablist"
        aria-label="Revisión del profesional"
        className={styles.tabs}
      >
        {visibleTabs.map((item, index) => (
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
              if (event.key === "ArrowRight")
                next = (index + 1) % visibleTabs.length;
              else if (event.key === "ArrowLeft")
                next = (index + visibleTabs.length - 1) % visibleTabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = visibleTabs.length - 1;
              else return;
              event.preventDefault();
              changeTab(visibleTabs[next].id);
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
        <ApplicationAnswers candidate={candidate} />
        {candidate.volunteer ? (
          <div className={styles.gate}>
            <strong>Apoyo voluntario no clínico</strong>
            <p className={styles.muted}>
              Se inscribió para acompañar dentro de su competencia, sin atención
              clínica. No declara título ni registro que cotejar: la decisión se
              toma con su perfil y su cuestionario.
            </p>
          </div>
        ) : null}
        <div className={styles.formGrid} hidden={candidate.volunteer}>
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
              {admissionRegistrationLabel(candidate.profile.registrationType)}
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
        ) : candidate.volunteer ? null : (
          <p className={styles.muted}>
            No hay un documento adjunto. Conserva únicamente una referencia del
            cotejo; evita copiar documentos o números de identidad en las notas.
          </p>
        )}
        {candidate.volunteer ? null : (
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
        )}
      </section>

      <section {...panelProps("screening")}>
        {candidate.screeningProgress ? (
          <p className={styles.notice} role="status">
            Empezó el cuestionario y lleva{" "}
            {candidate.screeningProgress.answered} de{" "}
            {candidate.screeningProgress.total} preguntas respondidas, sin
            enviarlo todavía. Verás sus respuestas aquí en cuanto lo envíe.
          </p>
        ) : null}
        {candidate.screeningDetail ? (
          <>
            <div className={styles.screeningSummary}>
              <span className={styles.screeningScore}>
                {candidate.screening.score}/{candidate.screening.maxScore}
              </span>
              <span className={styles.muted}>
                Puntuación ponderada (las preguntas de peso alto valen 2).
              </span>
            </div>
            {candidate.screeningDetail.flags.length ? (
              <p className={styles.error} role="status">
                Respuestas eliminatorias falladas:{" "}
                {candidate.screeningDetail.flags
                  .map(
                    (flag) =>
                      `P${flag.number}${
                        flag.reason === "children"
                          ? " (trabaja con infancia)"
                          : flag.reason === "older"
                            ? " (trabaja con adultos mayores)"
                            : ""
                      }`,
                  )
                  .join(", ")}
                . Revísalas en la entrevista antes de aceptar.
              </p>
            ) : (
              <p className={styles.success}>
                Sin respuestas eliminatorias falladas.
              </p>
            )}
            <div className={styles.gate}>
              <strong>Qué casos no atendería y por qué</strong>
              <p className={styles.exclusions}>
                {candidate.screeningDetail.exclusions || "Sin respuesta"}
              </p>
            </div>
            <ol className={styles.screeningList}>
              {candidate.screeningDetail.items.map((item) => {
                const flagged = candidate.screeningDetail?.flags.some(
                  (flag) => flag.number === item.number,
                );
                return (
                  <li
                    key={item.id}
                    data-result={
                      !item.scored || item.right
                        ? "ok"
                        : flagged
                          ? "flag"
                          : "wrong"
                    }
                  >
                    <span className={styles.cardMeta}>
                      P{item.number} · {item.block}
                      {item.scored
                        ? ` · ${item.right ? "Correcta" : "Incorrecta"}${item.weight > 1 ? " · peso alto" : ""}${item.eliminatory === "always" ? " · eliminatoria" : item.eliminatory ? " · eliminatoria según población" : ""}`
                        : " · informativa"}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.answer}</p>
                    {item.scored && !item.right ? (
                      <p className={styles.muted}>Esperada: {item.expected}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className={styles.empty}>
            La persona candidata todavía no envió el cuestionario de admisión.
            Lo verá automáticamente al entrar en su panel; la aceptación queda
            bloqueada hasta recibirlo. Puedes no aceptar la solicitud en
            cualquier momento desde «Decisión».
          </p>
        )}
      </section>

      <div hidden={tab !== "review" && tab !== "interview"}>
        <AdmissionActionForm
          action={actions.saveReview}
          disabled={busy || dirtyForms.some((form) => form !== "review")}
          onBusyChange={setBusy}
          onChange={() => markDirty("review")}
          onSaved={(state) => saved("review", state.message)}
          onFailed={(state, form) => {
            if (!state.field) return;
            reviewForm.current = form;
            setErrorField(state.field);
            changeTab("interview");
          }}
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
          {candidate.volunteer
            ? "Aceptar le envía un correo para activar su plan; en cuanto paga entra a su panel y empieza a recibir solicitudes. No aceptar cierra la solicitud y se lo comunica por correo."
            : "Aceptar aprueba el perfil clínico, permite su aparición en el catálogo y le envía un correo para activar su plan y entrar a su panel. No aceptar cierra la solicitud y se lo comunica por correo."}
        </p>
        {candidate.publishBlockers.length ? (
          <div className={styles.notice}>
            <strong>Antes de aceptar</strong>
            <ul>
              {candidate.publishBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.success}>
            Los controles guardados permiten aceptar la solicitud. Nido volverá
            a comprobarlos al confirmar.
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
          action={
            candidate.volunteer ? actions.approveVolunteer : actions.publish
          }
          submit={
            candidate.volunteer
              ? "Aceptar la solicitud"
              : "Aceptar y publicar el perfil"
          }
          disabled={
            busy ||
            !candidate.canPublish ||
            dirtyForms.some((form) => form !== "publish")
          }
          submitDisabled={!confirmed}
          onBusyChange={setBusy}
          onChange={() => markDirty("publish")}
          onSaved={(state) => {
            if (state.published || state.decided) {
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
              placeholder="Motivo de la aceptación tras la revisión"
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
            {candidate.volunteer
              ? "Confirmo que he revisado su perfil y su cuestionario y acepto esta solicitud."
              : "Confirmo que he revisado los requisitos y quiero publicar este perfil."}
          </label>
        </AdmissionActionForm>

        <div className={styles.rejection}>
          <h3>No aceptar la solicitud</h3>
          <p className={styles.muted}>
            La solicitud se cierra y la persona recibe un correo amable que no
            incluye el motivo. El motivo queda solo en el registro interno.
          </p>
          <AdmissionActionForm
            action={actions.reject}
            submit="No aceptar la solicitud"
            disabled={busy || dirtyForms.some((form) => form !== "reject")}
            submitDisabled={!rejectConfirmed}
            onBusyChange={setBusy}
            onChange={() => markDirty("reject")}
            onSaved={(state) => {
              setDirtyForms([]);
              onSavedNotice?.(state.message);
              startRefresh(() =>
                router.replace(
                  `${admissionHref(data)}${admissionHref(data).includes("?") ? "&" : "?"}decidido=1`,
                  { scroll: false },
                ),
              );
            }}
          >
            {ids}
            <label>
              Motivo interno
              <input
                name="reference"
                required
                minLength={5}
                maxLength={300}
                placeholder="Por qué no se acepta (no se envía a la persona)"
              />
            </label>
            <label className={styles.checkbox}>
              <input
                name="confirm"
                type="checkbox"
                checked={rejectConfirmed}
                onChange={(event) => setRejectConfirmed(event.target.checked)}
                required
              />
              Confirmo que esta solicitud no se acepta. Se enviará un correo
              para informarle.
            </label>
          </AdmissionActionForm>
        </div>
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

const yesNo = (value: boolean) => (value ? "Sí" : "No");

/** Parte 1 de la solicitud: todo lo que la persona respondió en su perfil. */
function ApplicationAnswers({ candidate }: { candidate: AdmissionDetail }) {
  const answers = candidate.application;
  // Solo fotos subidas por el formulario (data URL de imagen); nunca una URL
  // externa ni otro esquema que el navegador pudiera cargar o ejecutar.
  const photo =
    answers.photo &&
    /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(answers.photo)
      ? answers.photo
      : null;
  const facts: [string, string][] = [
    [
      "Rol",
      candidate.volunteer
        ? "Apoyo voluntario no clínico"
        : "Profesional clínico",
    ],
    ["Nombre completo", candidate.name],
    ["Nombre público", answers.displayName || "Sin indicar"],
    [
      "País y ciudad",
      [candidate.country && countryName(candidate.country), answers.city]
        .filter(Boolean)
        .join(" · ") || "Sin indicar",
    ],
    ["Zona horaria", answers.timeZone || "Sin indicar"],
    [
      "Áreas de acompañamiento",
      answers.supportAreas
        .map(
          (area) => needLabels[area as keyof typeof needLabels] ?? "Otra área",
        )
        .join(", ") || "Sin indicar",
    ],
    [
      "Modalidad",
      [
        answers.remoteAvailable ? "En línea" : "",
        answers.inPersonAvailable ? "Presencial" : "",
      ]
        .filter(Boolean)
        .join(" y ") || "Sin indicar",
    ],
    [
      "Personas a la vez",
      answers.maxActiveRequests
        ? `Hasta ${answers.maxActiveRequests}`
        : "Sin indicar",
    ],
    ["Recibir solicitudes al empezar", yesNo(answers.acceptingRequests)],
    ["Experiencia en crisis", yesNo(answers.crisisExperience)],
    ["Ofrece servicios pagos", yesNo(answers.offersPaidServices)],
    ["Correo de coordinación", answers.contactEmail || candidate.email],
    ["WhatsApp", answers.phone || "Sin indicar"],
    ["Teléfono", answers.landline || "Sin indicar"],
    ["Correo visible en su perfil", yesNo(answers.emailPublic)],
    // Formación y registro clínicos ya se muestran debajo, en sus recuadros.
    ...(!candidate.volunteer && answers.supervisionInfo
      ? ([["Supervisión", answers.supervisionInfo]] as [string, string][])
      : []),
    [
      "Condiciones y código de conducta",
      candidate.profile.conductAccepted ? "Aceptados" : "Pendientes",
    ],
    ["Solicitud enviada", formatAdmissionDate(answers.createdAt)],
  ];
  return (
    <div className={styles.application}>
      <div className={styles.applicationHead}>
        {photo ? (
          // biome-ignore lint/performance/noImgElement: foto privada en data URL, sin optimizador.
          <img
            className={styles.applicationPhoto}
            src={photo}
            alt={`Foto de ${candidate.name}`}
            width={64}
            height={64}
          />
        ) : null}
        <div>
          <h3>Parte 1 · Perfil</h3>
          <p className={styles.muted}>
            Todo lo que respondió en su solicitud. El cuestionario (parte 2)
            está en su pestaña.
          </p>
        </div>
      </div>
      <dl className={styles.facts}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {answers.shortBio ? (
        <div className={styles.gate}>
          <strong>Presentación</strong>
          <p className={styles.exclusions}>{answers.shortBio}</p>
        </div>
      ) : null}
      {answers.contactNotes ? (
        <div className={styles.gate}>
          <strong>Notas de contacto</strong>
          <p className={styles.exclusions}>{answers.contactNotes}</p>
        </div>
      ) : null}
    </div>
  );
}
