"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import styles from "./onboarding.module.css";

export function WizardFrame({
  title,
  description,
  step,
  total,
  name,
  children,
  saveStatus,
  pending = false,
  onBack,
  onNext,
  complete = false,
  onExit,
}: {
  title: string;
  description?: string;
  step: number;
  total: number;
  name: string;
  children: ReactNode;
  saveStatus?: string;
  pending?: boolean;
  onBack: () => void;
  onNext?: () => void;
  complete?: boolean;
  onExit?: () => Promise<unknown>;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const exitPending = useRef(false);
  const question = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || typeof element.showModal !== "function") return;
    if (element.open) element.close();
    element.showModal();
    return () => element.close();
  }, []);
  async function exit() {
    if (pending || exitPending.current) return;
    exitPending.current = true;
    try {
      const result = await onExit?.();
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === false
      )
        return;
      router.push("/empezar?cambiar=1");
    } finally {
      exitPending.current = false;
    }
  }
  const previousHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (step < 0 || !question.current) return;
    const element = question.current;
    const height = element.getBoundingClientRect().height;
    const before = previousHeight.current;
    previousHeight.current = height;
    if (
      before !== null &&
      before !== height &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // Interpola el espacio mínimo: el contenido puede crecer durante la
      // transición sin invadir la navegación. Después vuelve al mínimo CSS.
      const animation = element.animate(
        [{ minHeight: `${before}px` }, { minHeight: `${height}px` }],
        { duration: 260, easing: "cubic-bezier(.22, 1, .36, 1)" },
      );
      return () => animation.cancel();
    }
  }, [step]);
  useEffect(() => {
    if (step < 0) return;
    const focusable = question.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), select, textarea, button, [tabindex='-1']",
    );
    focusable?.focus();
  }, [step]);
  return (
    <div className={styles.scene}>
      <dialog
        open
        ref={dialog}
        className={styles.modal}
        aria-label={name}
        onCancel={(event) => {
          event.preventDefault();
          void exit();
        }}
      >
        <div className={styles.top}>
          <span>{name}</span>
          <span aria-live="polite">
            {step + 1} de {total}
          </span>
          <button
            type="button"
            className={styles.arrow}
            aria-label="Guardar progreso básico y salir"
            disabled={pending}
            onClick={() => void exit()}
          >
            ×
          </button>
        </div>
        <progress
          className={styles.progress}
          value={step + 1}
          max={total}
          aria-label="Tu progreso"
        />
        <div className={styles.question} key={step} ref={question}>
          <p className={styles.eyebrow}>
            {complete ? "Todo listo para continuar" : "Un paso a la vez"}
          </p>
          <h2 tabIndex={-1}>{title}</h2>
          {description ? (
            <p className={styles.description}>{description}</p>
          ) : null}
          <fieldset className={styles.content} disabled={pending}>
            {children}
          </fieldset>
        </div>
        <div className={styles.navigation}>
          <button
            className={styles.arrow}
            type="button"
            onClick={onBack}
            disabled={step === 0 || pending}
            aria-label="Pregunta anterior"
          >
            ←
          </button>
          <span className={styles.save} role="status">
            {saveStatus ?? "Puedes volver atrás antes de terminar."}
          </span>
          {complete ? (
            <button
              key="confirm-onboarding"
              className="button human"
              type="submit"
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Guardando…" : "Entrar a mi espacio →"}
            </button>
          ) : (
            <button
              key="next-question"
              className="button human"
              type="button"
              onClick={onNext}
              disabled={pending}
            >
              Continuar →
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
