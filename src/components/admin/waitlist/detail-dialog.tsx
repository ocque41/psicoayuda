"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { updateGeneralWaitlistStatus } from "@/app/admin/lista-de-espera/actions";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { PracticeForm } from "@/components/practice/forms";
import {
  type AdminWaitlistData,
  type GeneralWaitlistDetail,
  type GeneralWaitlistStatus,
  generalWaitlistStatuses,
  generalWaitlistStatusLabels,
  type WaitlistDetail,
} from "@/lib/admin-waitlist/types";
import { WaitlistDialog } from "./dialog-frame";
import {
  receiveWaitlistStatus,
  recoverWaitlistStatus,
  statusDraftFromRemote,
} from "./status-draft";
import { waitlistDate, waitlistHref } from "./view-model";
import styles from "./waitlist.module.css";

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>
        {children === null || children === undefined || children === ""
          ? "Sin registrar"
          : children}
      </dd>
    </div>
  );
}

function GeneralStatusForm({
  detail,
  onBusyChange,
  onDirtyChange,
}: {
  detail: GeneralWaitlistDetail;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => statusDraftFromRemote(detail));
  const { selected, expected } = draft;
  const [conflict, setConflict] = useState(false);
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  const [reloadRequested, setReloadRequested] = useState(false);
  const [refreshing, startRecovery] = useTransition();
  const mounted = useRef(true);
  const latestProp = useRef(detail.updatedAt);
  const dirty = selected !== expected.status;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (detail.updatedAt === latestProp.current) return;
    latestProp.current = detail.updatedAt;
    setDraft((current) => receiveWaitlistStatus(current, detail));
  }, [detail]);
  useEffect(() => {
    if (!reloadRequested || refreshing) return;
    // Se acepta explícitamente la lectura, incluso si llegó mientras había cambios.
    setDraft(recoverWaitlistStatus(detail));
    setConflict(false);
    setReloadRequested(false);
    onDirtyChange(false);
    onBusyChange(false);
  }, [detail, reloadRequested, refreshing, onBusyChange, onDirtyChange]);
  const save = useCallback(
    async (
      previous: PracticeFormState,
      form: FormData,
    ): Promise<PracticeFormState> => {
      onBusyChange(true);
      try {
        const result = await updateGeneralWaitlistStatus(
          previous ?? { ok: false, message: "" },
          form,
        );
        if (result.ok && mounted.current) {
          const status = result.status ?? (selected as GeneralWaitlistStatus);
          setDraft(
            statusDraftFromRemote({
              status,
              updatedAt: result.updatedAt ?? expected.updatedAt,
            }),
          );
          setConflict(false);
          onDirtyChange(false);
          router.refresh();
        } else if (mounted.current && result.code === "conflict") {
          setConflict(true);
        }
        return result;
      } finally {
        if (mounted.current) onBusyChange(false);
      }
    },
    [expected.updatedAt, onBusyChange, onDirtyChange, router, selected],
  );
  const known = generalWaitlistStatuses.some((value) => value === selected);
  return (
    <section
      className={styles.form}
      aria-label="Seguimiento de apoyo general"
      onSubmitCapture={() => onBusyChange(true)}
    >
      <h3>Actualizar seguimiento</h3>
      <p>
        Guarda un estado confirmado por el equipo. La atención y las
        asignaciones de profesionales se gestionan por separado.
      </p>
      {reloadRequested || refreshing ? (
        <p role="status">Actualizando la ficha…</p>
      ) : (
        <PracticeForm action={save} submit="Guardar seguimiento">
          <input type="hidden" name="entryId" value={detail.id} />
          <input type="hidden" name="expectedStatus" value={expected.status} />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={expected.updatedAt}
          />
          <label>
            Estado de la lista
            <select
              name="status"
              value={selected}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  selected: event.target.value,
                }))
              }
            >
              {!known ? (
                <option value={selected}>
                  Estado actual: {detail.statusLabel}
                </option>
              ) : null}
              {generalWaitlistStatuses.map((status) => (
                <option key={status} value={status}>
                  {generalWaitlistStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </PracticeForm>
      )}
      {conflict && !reloadRequested && !refreshing ? (
        <section aria-label="Recuperar la última versión del seguimiento">
          <p>
            El registro cambió en otra ventana. Tu selección sigue sin guardar;
            revisa la versión actual antes de intentarlo de nuevo.
          </p>
          {confirmRecovery ? (
            <>
              <p role="alert">
                Actualizar descartará el estado que seleccionaste y volverá a
                leer la última versión guardada.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    setConfirmRecovery(false);
                    setReloadRequested(true);
                    onBusyChange(true);
                    startRecovery(() => router.refresh());
                  }}
                >
                  Descartar selección y actualizar
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirmRecovery(false)}
                >
                  Conservar selección
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirmRecovery(true)}
            >
              Actualizar ficha
            </button>
          )}
        </section>
      ) : null}
    </section>
  );
}

export function WaitlistDetailDialog({
  data,
  detail,
}: {
  data: AdminWaitlistData;
  detail: WaitlistDetail;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const source =
    detail.tab === "general" ? "Apoyo general" : "Ayuda Terremoto · $0";
  return (
    <WaitlistDialog
      title={
        detail.tab === "general"
          ? "Solicitud de apoyo general"
          : detail.name || "Persona sin alias"
      }
      source={source}
      busy={busy}
      dirty={dirty}
      onClose={() => router.replace(waitlistHref(data), { scroll: false })}
    >
      <dl className={styles.details}>
        <Field title="Referencia">{detail.id.slice(-8)}</Field>
        <Field title="Correo de contacto">{detail.email}</Field>
        <Field title="Seguimiento">{detail.statusLabel}</Field>
        <Field title="Registro">
          {waitlistDate(detail.createdAt, true)} · UTC
        </Field>
        <Field title="Última actualización">
          {waitlistDate(detail.updatedAt, true)} · UTC
        </Field>
        {detail.tab === "general" ? (
          <Field title="Origen del registro">{detail.sourceLabel}</Field>
        ) : null}
      </dl>
      {detail.tab === "general" ? (
        <>
          <section className={styles.context}>
            <h3>Motivo registrado</h3>
            <p>{detail.title || "Sin título registrado"}</p>
          </section>
          <section className={styles.context}>
            <h3>Descripción de la solicitud</h3>
            <p>{detail.description || "Sin descripción registrada"}</p>
          </section>
          <GeneralStatusForm
            detail={detail}
            onBusyChange={setBusy}
            onDirtyChange={setDirty}
          />
        </>
      ) : (
        <>
          <dl className={styles.details}>
            <Field title="País">{detail.country}</Field>
            <Field title="Estado o región">{detail.state}</Field>
            <Field title="Ciudad">{detail.city}</Field>
            <Field title="Idioma">{detail.languageLabel}</Field>
            <Field title="Necesidad registrada">
              {detail.needCategoryLabel}
            </Field>
            <Field title="Prioridad registrada">{detail.urgencyLabel}</Field>
            <Field title="Autorización de contacto">
              {detail.consentContact
                ? "Registrada"
                : "Sin autorización registrada"}
            </Field>
            <Field title="Asignaciones activas">
              {detail.activeAssignments}
            </Field>
          </dl>
          <section className={styles.context}>
            <h3>Asignaciones registradas</h3>
            {detail.assignments.length ? (
              <ul
                className={styles.list}
                aria-label="Asignaciones de Ayuda Terremoto"
              >
                {detail.assignments.map((assignment) => (
                  <li key={assignment.id} className={styles.entry}>
                    <strong>{assignment.professionalName}</strong>
                    <span className={styles.status}>
                      {assignment.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No hay asignaciones registradas para esta solicitud.</p>
            )}
            {detail.assignmentsHasMore ? (
              <p>
                Se muestran las primeras 50 asignaciones. Consulta la gestión de
                solicitudes para continuar revisando el seguimiento.
              </p>
            ) : null}
          </section>
          <section className={styles.notice}>
            <strong>Consulta del programa gratuito</strong>
            <p>
              Revisa o cambia la asignación y el seguimiento desde la sección
              Solicitudes de Ayuda Terremoto.
            </p>
            <Link
              className={styles.secondary}
              href="/admin/solicitudes"
              prefetch={false}
            >
              Gestionar Ayuda Terremoto →
            </Link>
          </section>
        </>
      )}
    </WaitlistDialog>
  );
}
