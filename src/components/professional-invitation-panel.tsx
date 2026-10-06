"use client";

import { useId, useRef, useState } from "react";
import { MEMBERSHIP_PLAN, TRIAL_DAYS } from "@/lib/practice/membership-plan";
import styles from "./professional-invitation-panel.module.css";

export type ProfessionalInvitationPanelProps = {
  registrationUrl: string;
  message: string;
  whatsappUrl: string;
  emailUrl: string;
};

export function ProfessionalInvitationPanel({
  registrationUrl,
  message,
  whatsappUrl,
  emailUrl,
}: ProfessionalInvitationPanelProps) {
  const id = useId();
  const linkField = useRef<HTMLInputElement>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);
  const copying = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function copy(kind: "link" | "message") {
    if (copying.current) return;
    copying.current = true;
    setBusy(true);
    setFeedback("");
    const value = kind === "link" ? registrationUrl : message;
    const field = kind === "link" ? linkField.current : messageField.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard");
      await navigator.clipboard.writeText(value);
      setFeedback(
        kind === "link"
          ? "Enlace copiado. Ya puedes compartirlo."
          : "Mensaje copiado. Ya puedes compartirlo.",
      );
    } catch {
      field?.focus();
      field?.select();
      setFeedback(
        kind === "link"
          ? "El enlace está seleccionado. Usa «Copiar» en tu dispositivo."
          : "El mensaje está seleccionado. Usa «Copiar» en tu dispositivo.",
      );
    } finally {
      copying.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Preparar una invitación">
      <div className={styles.introduction}>
        <span className={styles.mark} aria-hidden="true">
          ↗
        </span>
        <p className={styles.eyebrow}>Una consulta con más espacio</p>
        <h2>Comparte Nido con tus colegas.</h2>
        <p>
          Invítales a organizar su agenda, pacientes, notas por sesión y
          conversaciones en un mismo lugar.
        </p>
        <div className={styles.offer}>
          <strong>{TRIAL_DAYS} días de prueba sin tarjeta</strong>
          <span>Después, {MEMBERSHIP_PLAN.priceLabel}/mes al contratar.</span>
        </div>
        <p className={styles.detail}>
          Cada profesional crea su cuenta y completa la revisión de su perfil.
          Tras la aprobación, puede activar su prueba gratuita.
        </p>
      </div>

      <div className={styles.preparation}>
        <div className={styles.field}>
          <label htmlFor={`${id}-link`}>Enlace para crear una cuenta</label>
          <input
            ref={linkField}
            id={`${id}-link`}
            className={styles.linkField}
            value={registrationUrl}
            readOnly
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            aria-busy={busy}
            onClick={() => copy("link")}
          >
            Copiar enlace
          </button>
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-message`}>Mensaje listo para compartir</label>
          <textarea
            ref={messageField}
            id={`${id}-message`}
            className={styles.messageField}
            value={message}
            readOnly
            autoComplete="off"
            spellCheck={false}
            rows={8}
          />
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            aria-busy={busy}
            onClick={() => copy("message")}
          >
            Copiar mensaje
          </button>
        </div>

        <p className={styles.feedback} role="status" aria-atomic="true">
          {feedback}
        </p>

        <div className={styles.share}>
          <a
            className={styles.primary}
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Compartir por WhatsApp (se abre en otra pestaña)"
          >
            Compartir por WhatsApp <span aria-hidden="true">↗</span>
          </a>
          <a className={styles.secondary} href={emailUrl}>
            Compartir por correo
          </a>
        </div>
        <p className={styles.detail}>
          Se abrirá la app para revisar el mensaje y elegir a quién enviarlo.
        </p>
      </div>
    </section>
  );
}
