import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { professionalScreenings, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { nowIso } from "@/lib/ids";
import { SCREENING_QUESTIONS, SCREENING_VERSION } from "./questions";
import {
  missingScreeningAnswers,
  type ScreeningAnswers,
  type ScreeningFlag,
  sanitizeScreeningAnswers,
  scoreScreening,
} from "./scoring";

/** Solo candidaturas clínicas pendientes responden el cuestionario. */
const candidateGate = (professionalId: string) =>
  sql`EXISTS (SELECT 1 FROM professionals WHERE id=${professionalId} AND status='pending_verification' AND non_clinical_helper=0)`;

export async function currentScreeningCandidate() {
  const session = await getServerSession();
  if (!session?.user.id) return null;
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
    columns: {
      id: true,
      status: true,
      nonClinicalHelper: true,
      fullName: true,
    },
  });
  return pro ? { ...pro, userId: session.user.id } : null;
}

export async function readScreening(professionalId: string) {
  const row = await db.query.professionalScreenings.findFirst({
    where: eq(professionalScreenings.professionalId, professionalId),
  });
  if (!row) return null;
  let answers: ScreeningAnswers = {};
  let flags: ScreeningFlag[] = [];
  try {
    answers = sanitizeScreeningAnswers(JSON.parse(row.answersJson));
  } catch {}
  try {
    const parsed = JSON.parse(row.flagsJson);
    if (Array.isArray(parsed)) flags = parsed;
  } catch {}
  return { ...row, answers, flags };
}

/** true si la candidatura clínica pendiente ya envió el cuestionario. */
export async function screeningSubmitted(professionalId: string) {
  const row = await db.query.professionalScreenings.findFirst({
    where: eq(professionalScreenings.professionalId, professionalId),
    columns: { submittedAt: true },
  });
  return Boolean(row?.submittedAt);
}

/**
 * Guarda el progreso sin puntuar. No modifica un cuestionario ya enviado.
 * `rawExclusions` (opcional) conserva el borrador del texto libre; si no llega,
 * se mantiene el que hubiera.
 */
export async function saveScreeningDraft(
  professionalId: string,
  rawAnswers: unknown,
  rawExclusions?: unknown,
) {
  const answers = sanitizeScreeningAnswers(rawAnswers);
  const text = SCREENING_QUESTIONS.find((question) => question.kind === "text");
  const exclusions =
    typeof rawExclusions === "string"
      ? rawExclusions.slice(0, text?.kind === "text" ? text.maxLength : 2000)
      : null;
  const now = nowIso();
  const rows = await db.all(sql`INSERT INTO professional_screenings
    (professional_id, version, answers_json, exclusions, created_at, updated_at)
    SELECT ${professionalId}, ${SCREENING_VERSION}, ${JSON.stringify(answers)}, COALESCE(${exclusions}, ''), ${now}, ${now}
    WHERE ${candidateGate(professionalId)}
    ON CONFLICT(professional_id) DO UPDATE SET answers_json=excluded.answers_json,
      exclusions=COALESCE(${exclusions}, professional_screenings.exclusions),
      updated_at=excluded.updated_at
    WHERE professional_screenings.submitted_at IS NULL
    RETURNING professional_id`);
  return rows.length > 0;
}

export type SubmitScreeningResult =
  | { ok: true; firstSubmission: boolean }
  | { ok: false; message: string; questionId?: string };

export async function submitScreening(
  professionalId: string,
  rawAnswers: unknown,
  rawExclusions: unknown,
): Promise<SubmitScreeningResult> {
  const answers = sanitizeScreeningAnswers(rawAnswers);
  const missing = missingScreeningAnswers(answers);
  if (missing.length)
    return {
      ok: false,
      message: "Falta responder alguna pregunta. Vuelve a ella para continuar.",
      questionId: missing[0],
    };
  const text = SCREENING_QUESTIONS.find((question) => question.kind === "text");
  const exclusions =
    typeof rawExclusions === "string" ? rawExclusions.trim() : "";
  if (
    text?.kind === "text" &&
    (exclusions.length < text.minLength || exclusions.length > text.maxLength)
  )
    return {
      ok: false,
      message: `Cuéntanos en al menos ${text.minLength} caracteres qué casos no atenderías y por qué.`,
      questionId: text.id,
    };
  const result = scoreScreening(answers);
  const now = nowIso();
  await saveScreeningDraft(professionalId, answers);
  const updated = await db
    .update(professionalScreenings)
    .set({
      version: SCREENING_VERSION,
      answersJson: JSON.stringify(answers),
      exclusions,
      score: result.score,
      maxScore: result.maxScore,
      flagsJson: JSON.stringify(result.flags),
      submittedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(professionalScreenings.professionalId, professionalId),
        isNull(professionalScreenings.submittedAt),
        candidateGate(professionalId),
      ),
    )
    .returning({ id: professionalScreenings.professionalId });
  if (updated.length) return { ok: true, firstSubmission: true };
  if (await screeningSubmitted(professionalId))
    return { ok: true, firstSubmission: false };
  return {
    ok: false,
    message:
      "No pudimos guardar tus respuestas. Comprueba tu perfil y vuelve a intentarlo.",
  };
}
