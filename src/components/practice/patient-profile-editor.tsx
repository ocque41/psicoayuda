"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { savePatientProfile } from "@/app/pro/pacientes/[patientId]/profile-actions";
import type { PatientProfileView } from "@/lib/practice/patient-profile";
import type { PatientProfileContent } from "@/lib/practice/patient-profile-fields-model";
import { PracticeForm } from "./forms";
import styles from "./patient-profile.module.css";
import { PatientProfileFields } from "./patient-profile-fields";

export function PatientProfileEditor({
  patientId,
  profile,
  timeZone,
}: {
  patientId: string;
  profile: PatientProfileView;
  timeZone: string;
}) {
  const router = useRouter();
  const id = useId();
  const [content, setContent] = useState(profile.content);
  const [saved, setSaved] = useState(profile.content);
  const [revision, setRevision] = useState(profile.revision);
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const destination = useRef<string | null>(null);
  const leaving = useRef(false);
  const mounted = useRef(true);
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    function showLinkedPanel() {
      if (window.location.hash === "#ficha-privada" && panel.current) {
        panel.current.open = true;
      }
    }
    showLinkedPanel();
    window.addEventListener("hashchange", showLinkedPanel);
    return () => window.removeEventListener("hashchange", showLinkedPanel);
  }, []);

  useEffect(() => {
    // Una actualización de otra ventana nunca reemplaza un borrador abierto.
    if (profile.status !== "ready" || dirty || profile.revision <= revision)
      return;
    setContent(profile.content);
    setSaved(profile.content);
    setRevision(profile.revision);
  }, [profile, dirty, revision]);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      if (!leaving.current) event.preventDefault();
    }
    function guardLink(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        leaving.current
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const next = new URL(anchor.href, window.location.href);
      if (
        next.origin !== location.origin ||
        (next.pathname === location.pathname && next.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      destination.current = next.href;
      dialog.current?.showModal();
    }
    function guardFilter(event: SubmitEvent) {
      if (event.defaultPrevented || leaving.current) return;
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        !form.hasAttribute("data-note-navigation")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const next = new URL(form.action, window.location.href);
      const params = new URLSearchParams();
      for (const [name, value] of new FormData(form)) {
        if (typeof value === "string") params.append(name, value);
      }
      next.search = params.toString();
      destination.current = next.href;
      dialog.current?.showModal();
    }
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    document.addEventListener("submit", guardFilter, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
      document.removeEventListener("submit", guardFilter, true);
    };
  }, [dirty]);

  const save = useCallback(
    async (
      _previous: PracticeFormState,
      data: FormData,
    ): Promise<PracticeFormState> => {
      const submitted = {
        sex: String(data.get("sex") || "") as PatientProfileContent["sex"],
        birthDate: String(data.get("birthDate") || ""),
        consultationReason: String(data.get("consultationReason") || ""),
        generalNote: String(data.get("generalNote") || ""),
      };
      const result = await savePatientProfile({
        patientId,
        revision: Number(data.get("revision")),
        ...submitted,
        consent: data.get("profileConsent") === "on",
      });
      if (result.ok && mounted.current) {
        setRevision(result.revision ?? revision);
        setSaved(submitted);
        router.refresh();
      }
      return result;
    },
    [patientId, revision, router],
  );

  if (profile.status !== "ready") {
    return (
      <section
        id="ficha-privada"
        className={styles.unavailable}
        aria-labelledby={`${id}-title`}
      >
        <h2 id={`${id}-title`}>Datos privados de la ficha</h2>
        <p role="alert">
          No pudimos abrir estos datos. El registro se conserva y no se puede
          reemplazar desde esta ventana. Vuelve a intentarlo o contacta a
          soporte sin compartir su contenido.
        </p>
      </section>
    );
  }
  return (
    <>
      <details ref={panel} id="ficha-privada" className={styles.panel}>
        <summary>
          <span className={styles.summary}>
            <strong>Datos privados del paciente</strong>
            <small>
              Sexo, nacimiento, motivo de consulta y notas generales
            </small>
          </span>
        </summary>
        <div className={styles.body}>
          <p className="hint">
            Opcionales, privados y guardados con cifrado. El paciente y el
            equipo de soporte no pueden ver estos datos desde sus cuentas.
          </p>
          <PracticeForm action={save} submit="Guardar datos de la ficha">
            <input type="hidden" name="revision" value={revision} />
            <PatientProfileFields
              content={content}
              onChange={setContent}
              timeZone={timeZone}
            />
            <label className={`practice-check ${styles.consent}`}>
              <input type="checkbox" name="profileConsent" required />
              La persona conoce y autoriza guardar estos datos en su ficha.
            </label>
            <p className={styles.state} role="status">
              {dirty
                ? "Cambios sin guardar"
                : revision
                  ? "Datos guardados"
                  : "Todavía no hay datos adicionales guardados"}
              . Guarda antes de salir.
            </p>
          </PracticeForm>
        </div>
      </details>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-leave`}
      >
        <h2 id={`${id}-leave`}>Tienes cambios sin guardar</h2>
        <p>
          Los datos siguen en esta ventana. Guarda los datos de la ficha y las
          notas que estés editando antes de salir.
        </p>
        <div className="panel-nav">
          <button
            type="button"
            className="button human"
            onClick={() => dialog.current?.close()}
          >
            Seguir editando
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              if (!destination.current) return;
              leaving.current = true;
              window.location.assign(destination.current);
            }}
          >
            Salir sin guardar
          </button>
        </div>
      </dialog>
    </>
  );
}
