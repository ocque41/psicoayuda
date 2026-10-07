/** Lee controles visibles antes de desmontarlos; autofill puede omitir change.
 * Sólo sincroniza texto ya presente en el modelo. No infiere consentimientos,
 * radios, adjuntos ni claves que el borrador seguro haya excluido. */
export function captureOnboardingAnswers<T extends object>(
  form: HTMLFormElement | null,
  answers: T,
): T {
  let captured = answers;
  const controls = form?.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("[data-onboarding-answer]");
  for (const control of controls ?? []) {
    const key = control.getAttribute("data-onboarding-answer") as keyof T;
    if (
      !Object.hasOwn(answers, key) ||
      typeof answers[key] !== "string" ||
      control.matches(
        "input[type=hidden], input[type=file], input[type=checkbox], input[type=radio]",
      )
    )
      continue;
    if (captured[key] !== control.value)
      captured = { ...captured, [key]: control.value };
  }
  return captured;
}
