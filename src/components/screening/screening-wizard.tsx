"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  type ScreeningFormState,
  saveScreeningProgress,
  sendScreening,
} from "@/app/pro/cuestionario/actions";
import styles from "@/components/onboarding/onboarding.module.css";
import { WizardFrame } from "@/components/onboarding/wizard-frame";
import type {
  PublicScreeningQuestion,
  ScreeningAnswers,
} from "@/lib/screening/scoring";

function answered(
  question: PublicScreeningQuestion,
  answers: ScreeningAnswers,
  exclusions: string,
) {
  if (question.kind === "text")
    return exclusions.trim().length >= question.minLength;
  const value = answers[question.id];
  return question.kind === "single"
    ? typeof value === "string"
    : Array.isArray(value) && value.length > 0;
}

/**
 * Cuestionario clínico, una pregunta a la vez. El progreso de las opciones se
 * guarda en la cuenta al avanzar; la puntuación se calcula solo en el servidor
 * y nunca se muestra a la persona candidata.
 */
export function ScreeningWizard({
  questions,
  initialAnswers,
  initialExclusions = "",
}: {
  questions: PublicScreeningQuestion[];
  initialAnswers: ScreeningAnswers;
  initialExclusions?: string;
}) {
  const formId = useId();
  const firstOpen = questions.findIndex(
    (question) =>
      question.kind !== "text" && !answered(question, initialAnswers, ""),
  );
  const [step, setStep] = useState(firstOpen < 0 ? questions.length - 1 : 0);
  const [answers, setAnswers] = useState<ScreeningAnswers>(initialAnswers);
  const [exclusions, setExclusions] = useState(initialExclusions);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState(
    "Guardamos tu progreso al avanzar.",
  );
  const [state, action, pending] = useActionState<ScreeningFormState, FormData>(
    sendScreening,
    null,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const question = questions[step];
  const last = step === questions.length - 1;

  // Un error del servidor devuelve a la pregunta pendiente.
  useEffect(() => {
    if (!state || state.ok) return;
    setError(state.message);
    const index = questions.findIndex((item) => item.id === state.questionId);
    if (index >= 0) setStep(index);
  }, [state, questions]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function persist(next: ScreeningAnswers) {
    setSaveStatus("Guardando…");
    saveScreeningProgress(next)
      .then((result) =>
        setSaveStatus(
          result.ok
            ? "Progreso guardado en tu cuenta."
            : "No pudimos guardar el progreso. Tus respuestas siguen aquí.",
        ),
      )
      .catch(() =>
        setSaveStatus(
          "Sin conexión: tus respuestas siguen aquí y se enviarán al terminar.",
        ),
      );
  }
  function next() {
    if (!answered(question, answers, exclusions)) {
      setError(
        question.kind === "multi"
          ? "Elige al menos una opción para continuar."
          : "Elige una opción para continuar.",
      );
      errorRef.current?.focus();
      return;
    }
    setError("");
    persist(answers);
    setStep((current) => Math.min(questions.length - 1, current + 1));
  }
  function choose(id: string) {
    if (question.kind === "text") return;
    setError("");
    if (question.kind === "single") {
      setAnswers((current) => ({ ...current, [question.id]: id }));
      return;
    }
    setAnswers((current) => {
      const previous = Array.isArray(current[question.id])
        ? (current[question.id] as string[])
        : [];
      let picked = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      if (question.exclusive)
        picked =
          id === question.exclusive && picked.includes(id)
            ? [id]
            : picked.filter((item) => item !== question.exclusive);
      return { ...current, [question.id]: picked };
    });
  }

  const selected = (id: string) => {
    const value = answers[question.id];
    return Array.isArray(value) ? value.includes(id) : value === id;
  };

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!last) {
          event.preventDefault();
          next();
          return;
        }
        if (!answered(question, answers, exclusions)) {
          event.preventDefault();
          next();
        }
      }}
    >
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <WizardFrame
        name="Cuestionario clínico"
        eyebrow={question.block}
        title={question.title}
        description={
          question.kind === "multi"
            ? "Puedes elegir varias opciones."
            : question.kind === "text"
              ? "Nos ayuda a derivarte solo los casos que encajan con tu práctica. No hay respuestas correctas aquí."
              : undefined
        }
        step={step}
        total={questions.length}
        pending={pending}
        saveStatus={saveStatus}
        complete={last}
        submitLabel="Enviar mi solicitud →"
        exitHref="/pro/dashboard"
        exitLabel="Guardar progreso y salir"
        onBack={() => {
          setError("");
          setStep((current) => Math.max(0, current - 1));
        }}
        onNext={next}
        onExit={async () => {
          await saveScreeningProgress(answers, exclusions).catch(() => null);
          return { ok: true };
        }}
      >
        {question.kind === "text" ? (
          <div className={styles.field}>
            <label htmlFor={`${formId}-exclusions`} className="visually-hidden">
              {question.title}
            </label>
            <textarea
              id={`${formId}-exclusions`}
              name="exclusions"
              value={exclusions}
              minLength={question.minLength}
              maxLength={question.maxLength}
              rows={6}
              required
              onChange={(event) => {
                setError("");
                setExclusions(event.target.value);
              }}
            />
            <span className={styles.save}>
              {exclusions.trim().length}/{question.maxLength}
            </span>
          </div>
        ) : (
          <fieldset className={`${styles.checks} ${styles.content}`}>
            <legend className="visually-hidden">{question.title}</legend>
            {question.options.map((option) => (
              <label key={option.id}>
                <input
                  type={question.kind === "single" ? "radio" : "checkbox"}
                  name={`${formId}-${question.id}`}
                  checked={selected(option.id)}
                  onChange={() => choose(option.id)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        )}
        {question.kind === "text" ? null : (
          <input type="hidden" name="exclusions" value={exclusions} />
        )}
        <p
          ref={errorRef}
          tabIndex={-1}
          role={error ? "alert" : undefined}
          className="form-error"
          hidden={!error}
        >
          {error}
        </p>
      </WizardFrame>
    </form>
  );
}
