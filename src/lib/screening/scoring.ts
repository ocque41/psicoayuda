import {
  SCREENING_BLOCKS,
  SCREENING_QUESTIONS,
  type ScoredQuestion,
  type ScreeningBlockId,
  type ScreeningQuestion,
} from "./questions";

/** Respuestas de opción: un slug (única) o varios (múltiple). */
export type ScreeningAnswers = Record<string, string | string[]>;

/** Pregunta sin la respuesta correcta, lista para el navegador. */
export type PublicScreeningQuestion =
  | {
      id: string;
      number: number;
      block: string;
      title: string;
      kind: "single" | "multi";
      options: { id: string; label: string }[];
      exclusive?: string;
    }
  | {
      id: string;
      number: number;
      block: string;
      title: string;
      kind: "text";
      minLength: number;
      maxLength: number;
    };

export type ScreeningFlag = {
  questionId: string;
  number: number;
  reason: "eliminatory" | "children" | "older";
};

export type ScreeningResult = {
  score: number;
  maxScore: number;
  flags: ScreeningFlag[];
  worksWithChildren: boolean;
  worksWithOlderAdults: boolean;
};

// FNV-1a + mulberry32: orden estable por candidato y pregunta (recargar la
// página no reordena) sin depender de Math.random.
function seed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function random(state: number) {
  let value = state;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffledOptions<T>(items: T[], key: string): T[] {
  const next = random(seed(key));
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function publicScreeningQuestions(
  candidateKey: string,
): PublicScreeningQuestion[] {
  return SCREENING_QUESTIONS.map((question, index) => {
    const base = {
      id: question.id,
      number: index + 1,
      block: SCREENING_BLOCKS[question.block as ScreeningBlockId],
      title: question.title,
    };
    if (question.kind === "text")
      return {
        ...base,
        kind: "text",
        minLength: question.minLength,
        maxLength: question.maxLength,
      };
    // El bloque A (mapeo informativo) conserva el orden natural; el resto se
    // baraja. «Ninguna de estas» siempre queda al final.
    const options =
      question.scoring === "info"
        ? question.options
        : shuffledOptions(question.options, `${candidateKey}:${question.id}`);
    return {
      ...base,
      kind: question.kind,
      options: options.map(({ id, label }) => ({ id, label })),
      ...(question.scoring === "info" && question.exclusive
        ? { exclusive: question.exclusive }
        : {}),
    };
  });
}

function optionIds(question: ScreeningQuestion) {
  return question.kind === "text"
    ? new Set<string>()
    : new Set(question.options.map((option) => option.id));
}

/**
 * Normaliza respuestas recibidas del navegador: descarta preguntas o slugs
 * desconocidos y aplica la exclusividad de «Ninguna de estas».
 */
export function sanitizeScreeningAnswers(input: unknown): ScreeningAnswers {
  const clean: ScreeningAnswers = {};
  if (!input || typeof input !== "object") return clean;
  const raw = input as Record<string, unknown>;
  for (const question of SCREENING_QUESTIONS) {
    if (question.kind === "text") continue;
    const valid = optionIds(question);
    const value = raw[question.id];
    if (question.kind === "single") {
      if (typeof value === "string" && valid.has(value))
        clean[question.id] = value;
      continue;
    }
    if (!Array.isArray(value)) continue;
    let picked = [
      ...new Set(
        value.filter(
          (item): item is string => typeof item === "string" && valid.has(item),
        ),
      ),
    ];
    if (
      question.scoring === "info" &&
      question.exclusive &&
      picked.includes(question.exclusive)
    )
      picked = [question.exclusive];
    if (picked.length) clean[question.id] = picked;
  }
  return clean;
}

export function missingScreeningAnswers(answers: ScreeningAnswers) {
  return SCREENING_QUESTIONS.filter(
    (question) =>
      question.kind !== "text" &&
      (question.kind === "single"
        ? typeof answers[question.id] !== "string"
        : !Array.isArray(answers[question.id]) ||
          answers[question.id].length === 0),
  ).map((question) => question.id);
}

function includes(value: string | string[] | undefined, id: string) {
  return Array.isArray(value) ? value.includes(id) : value === id;
}

export function scoreScreening(answers: ScreeningAnswers): ScreeningResult {
  const worksWithChildren =
    includes(answers.q1, "infancia") ||
    includes(answers.q3, "ninos") ||
    includes(answers.q3, "adolescentes");
  const worksWithOlderAdults =
    includes(answers.q2, "mayores") || includes(answers.q3, "mayores");
  let score = 0;
  let maxScore = 0;
  const flags: ScreeningFlag[] = [];
  SCREENING_QUESTIONS.forEach((question, index) => {
    if (question.scoring !== "scored") return;
    const scored = question as ScoredQuestion;
    maxScore += scored.weight;
    const right = answers[scored.id] === scored.correct;
    if (right) score += scored.weight;
    else if (
      scored.eliminatory === "always" ||
      (scored.eliminatory === "children" && worksWithChildren) ||
      (scored.eliminatory === "older" && worksWithOlderAdults)
    )
      flags.push({
        questionId: scored.id,
        number: index + 1,
        reason:
          scored.eliminatory === "always" ? "eliminatory" : scored.eliminatory,
      });
  });
  return { score, maxScore, flags, worksWithChildren, worksWithOlderAdults };
}

/** Vista de revisión para el equipo: cada pregunta con lo elegido. */
export function screeningReview(answers: ScreeningAnswers) {
  return SCREENING_QUESTIONS.filter(
    (question): question is Exclude<ScreeningQuestion, { kind: "text" }> =>
      question.kind !== "text",
  ).map((question, index) => {
    const chosen = answers[question.id];
    const chosenIds = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
    const labels = question.options
      .filter((option) => chosenIds.includes(option.id))
      .map((option) => option.label);
    if (question.scoring === "info")
      return {
        id: question.id,
        number: index + 1,
        block: SCREENING_BLOCKS[question.block],
        title: question.title,
        answer: labels.join(" · ") || "Sin respuesta",
        scored: false as const,
      };
    const correct = question.options.find(
      (option) => option.id === question.correct,
    );
    return {
      id: question.id,
      number: index + 1,
      block: SCREENING_BLOCKS[question.block],
      title: question.title,
      answer: labels[0] || "Sin respuesta",
      scored: true as const,
      right: chosen === question.correct,
      expected: correct?.label || "",
      weight: question.weight,
      eliminatory: question.eliminatory ?? null,
    };
  });
}
