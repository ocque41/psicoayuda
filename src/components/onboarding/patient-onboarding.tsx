"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { finishPatientOnboarding } from "@/app/empezar/actions";
import type { SafeDraft } from "@/lib/onboarding/drafts";
import { countryOptions, timeZoneOptions } from "@/lib/onboarding/locale";
import { captureOnboardingAnswers } from "./capture-answers";
import styles from "./onboarding.module.css";
import { useDraftSave } from "./use-draft-save";
import { WizardFrame } from "./wizard-frame";

const questions = [
  {
    title: "¿Cómo te gustaría que te llamemos?",
    description:
      "Puedes usar tu nombre de pila. No necesitas contar aquí por qué buscas apoyo.",
    field: "displayName",
  },
  {
    title: "¿Dónde recibirías el acompañamiento?",
    description:
      "Tu país ayuda a comprobar el alcance de atención del profesional que elijas.",
    field: "country",
  },
  {
    title: "¿Qué zona horaria usas?",
    description:
      "Así tu agenda muestra las horas donde estás. Puedes cambiarla después.",
    field: "timezone",
  },
  {
    title: "¿En qué idioma te sientes más a gusto?",
    description:
      "Lo guardamos como preferencia para tu espacio. La disponibilidad depende de cada profesional.",
    field: "preferredLanguage",
  },
  {
    title: "¿Para quién estás creando este espacio?",
    description:
      "El acompañamiento a menores necesita coordinación con su representante y el profesional.",
    field: "ageBand",
  },
  {
    title: "Tu privacidad forma parte del cuidado",
    description:
      "Solo vinculamos conversaciones cuando tu acceso al chat y tu cuenta están verificados. El equipo de soporte no accede a tus conversaciones clínicas.",
    field: "privacyAccepted",
  },
  {
    title: "Tu espacio está listo",
    description:
      "Revisa tus preferencias. Podrás explorar profesionales, conversar y organizar tu agenda desde un mismo lugar.",
    field: "review",
  },
] as const;

export function PatientOnboarding({
  initial,
  defaultName,
  ownerId,
}: {
  initial: SafeDraft;
  defaultName: string;
  ownerId: string;
}) {
  const id = useId();
  const [answers, setAnswers] = useState({
    displayName: String(initial.displayName ?? defaultName).slice(0, 80),
    country: String(initial.country ?? "VE"),
    timezone: String(initial.timezone ?? "America/Caracas"),
    preferredLanguage: String(initial.preferredLanguage ?? "es"),
    ageBand: String(initial.ageBand ?? "adult"),
    privacyAccepted: false,
  });
  const [step, setStep] = useState(
    Math.min(questions.length - 2, Number(initial.step) || 0),
  );
  const [clientError, setClientError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const draft = useMemo(
    () => ({
      displayName: answers.displayName,
      country: answers.country,
      timezone: answers.timezone,
      preferredLanguage: answers.preferredLanguage,
      ageBand: answers.ageBand,
      step,
    }),
    [
      answers.displayName,
      answers.country,
      answers.timezone,
      answers.preferredLanguage,
      answers.ageBand,
      step,
    ],
  );
  const { status, flush } = useDraftSave("patient", draft, ownerId);
  const submit = useCallback(
    async (
      previous: Parameters<typeof finishPatientOnboarding>[0],
      data: FormData,
    ) => {
      const saved = await flush();
      if (!saved?.ok) return saved;
      try {
        return await finishPatientOnboarding(previous, data);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "digest" in error &&
          String(error.digest).startsWith("NEXT_REDIRECT")
        )
          throw error;
        return {
          ok: false,
          message:
            "No pudimos confirmar el resultado. Conserva esta ventana abierta y vuelve a intentar.",
        };
      }
    },
    [flush],
  );
  const [state, action, pending] = useActionState(submit, null);
  const question = questions[step];
  const countries = useMemo(countryOptions, []);
  const zones = useMemo(
    () => timeZoneOptions(String(initial.timezone ?? "America/Caracas")),
    [initial.timezone],
  );
  useEffect(() => {
    if (initial.timezone) return;
    const inferred = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zones.includes(inferred))
      setAnswers((current) => ({ ...current, timezone: inferred }));
  }, [initial.timezone, zones]);
  function update(key: keyof typeof answers, value: string | boolean) {
    setClientError("");
    setAnswers((current) => ({ ...current, [key]: value }));
  }
  function next() {
    const current = captureOnboardingAnswers(form.current, answers);
    setAnswers(current);
    if (!form.current?.reportValidity()) return;
    if (
      question.field === "displayName" &&
      current.displayName.trim().length < 1
    ) {
      setClientError("Escribe el nombre que quieres usar en tu espacio.");
      return;
    }
    if (question.field === "privacyAccepted" && !current.privacyAccepted) {
      setClientError(
        "Confirma que leíste cómo se utilizan tus datos para continuar.",
      );
      return;
    }
    setClientError("");
    setStep((current) => Math.min(questions.length - 1, current + 1));
  }
  return (
    <form
      action={action}
      ref={form}
      onSubmit={(event) => {
        if (step < questions.length - 1) {
          event.preventDefault();
          next();
        }
      }}
    >
      <input type="hidden" name="expectedOwnerId" value={ownerId} />
      {Object.entries(answers).map(([key, value]) => (
        <input
          key={key}
          type="hidden"
          name={key}
          value={typeof value === "boolean" ? (value ? "on" : "") : value}
        />
      ))}
      <WizardFrame
        name="Tu espacio de acompañamiento"
        title={question.title}
        description={question.description}
        step={step}
        total={questions.length}
        pending={pending}
        saveStatus={status}
        onBack={() => {
          setAnswers(captureOnboardingAnswers(form.current, answers));
          setClientError("");
          setStep((current) => current - 1);
        }}
        onNext={next}
        complete={step === questions.length - 1}
        onExit={() => {
          setAnswers(captureOnboardingAnswers(form.current, answers));
          return flush(captureOnboardingAnswers(form.current, draft));
        }}
      >
        <div className={styles.field}>
          {question.field === "displayName" ? (
            <>
              <label htmlFor={`${id}-name`}>Tu nombre</label>
              <input
                id={`${id}-name`}
                data-onboarding-answer="displayName"
                value={answers.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                autoComplete="given-name"
                required
                minLength={1}
                maxLength={80}
              />
            </>
          ) : null}
          {question.field === "country" ? (
            <>
              <label htmlFor={`${id}-country`}>
                País donde recibirías atención
              </label>
              <select
                id={`${id}-country`}
                data-onboarding-answer="country"
                value={answers.country}
                onChange={(event) => update("country", event.target.value)}
                autoComplete="country"
                required
              >
                {countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {question.field === "timezone" ? (
            <>
              <label htmlFor={`${id}-zone`}>Zona horaria</label>
              <select
                id={`${id}-zone`}
                data-onboarding-answer="timezone"
                value={answers.timezone}
                onChange={(event) => update("timezone", event.target.value)}
                required
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {question.field === "preferredLanguage" ? (
            <>
              <label htmlFor={`${id}-language`}>Idioma preferido</label>
              <select
                id={`${id}-language`}
                data-onboarding-answer="preferredLanguage"
                value={answers.preferredLanguage}
                onChange={(event) =>
                  update("preferredLanguage", event.target.value)
                }
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="pt">Portugués</option>
                <option value="fr">Francés</option>
                <option value="other">Otro idioma · lo coordinaré</option>
              </select>
            </>
          ) : null}
          {question.field === "ageBand" ? (
            <div className={styles.checks}>
              <label>
                <input
                  type="radio"
                  checked={answers.ageBand === "adult"}
                  onChange={() => update("ageBand", "adult")}
                />
                Para mí · tengo 18 años o más
              </label>
              <label>
                <input
                  type="radio"
                  checked={answers.ageBand === "guardian"}
                  onChange={() => update("ageBand", "guardian")}
                />
                Acompaño como representante de un menor
              </label>
            </div>
          ) : null}
          {question.field === "privacyAccepted" ? (
            <div className={styles.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={answers.privacyAccepted}
                  onChange={(event) =>
                    update("privacyAccepted", event.target.checked)
                  }
                  required
                />
                <span>
                  He leído la{" "}
                  <Link
                    href="/privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    información de privacidad
                  </Link>{" "}
                  y entiendo cómo se organiza mi cuenta.
                </span>
              </label>
            </div>
          ) : null}
          {question.field === "review" ? (
            <dl className={styles.review}>
              <div>
                <dt>Tu nombre</dt>
                <dd>{answers.displayName}</dd>
              </div>
              <div>
                <dt>País</dt>
                <dd>
                  {
                    countries.find((option) => option.code === answers.country)
                      ?.label
                  }
                </dd>
              </div>
              <div>
                <dt>Zona horaria</dt>
                <dd>{answers.timezone.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Tu recorrido</dt>
                <dd>
                  {answers.ageBand === "guardian"
                    ? "Representante de un menor"
                    : "Acompañamiento para mí"}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        {clientError || state?.message ? (
          <p className="form-error" role="alert">
            {clientError || state?.message}
          </p>
        ) : null}
      </WizardFrame>
    </form>
  );
}
