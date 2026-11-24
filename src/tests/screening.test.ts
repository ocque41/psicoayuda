import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { professionalScreenings, professionals, user } from "@/db/schema";
import { SCREENING_QUESTIONS } from "@/lib/screening/questions";
import {
  missingScreeningAnswers,
  publicScreeningQuestions,
  type ScreeningAnswers,
  sanitizeScreeningAnswers,
  scoreScreening,
} from "@/lib/screening/scoring";
import {
  readScreening,
  saveScreeningDraft,
  submitScreening,
} from "@/lib/screening/store";

const P = "test-screening";
const stamp = () => new Date().toISOString();

/** Todas las preguntas puntuables bien respondidas, adultos sin infancia. */
function perfect(): ScreeningAnswers {
  const answers: ScreeningAnswers = {
    q1: ["ansiedad"],
    q2: ["adicciones"],
    q3: "adultos",
    q4: ["ninguna"],
  };
  for (const question of SCREENING_QUESTIONS)
    if (question.scoring === "scored") answers[question.id] = question.correct;
  return answers;
}
function wrong(answers: ScreeningAnswers, id: string) {
  const question = SCREENING_QUESTIONS.find((item) => item.id === id);
  if (question?.scoring !== "scored") throw new Error(id);
  answers[id] = question.options.find(
    (option) => option.id !== question.correct,
  )?.id as string;
  return answers;
}

describe("cuestionario clínico: preguntas públicas y puntuación", () => {
  it("tiene 20 pasos numerados y nunca envía la respuesta correcta al navegador", () => {
    const questions = publicScreeningQuestions("candidato-a");
    expect(questions).toHaveLength(20);
    expect(questions.map((question) => question.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    const serialized = JSON.stringify(questions);
    expect(serialized).not.toContain("correct");
    expect(serialized).not.toContain("weight");
    expect(serialized).not.toContain("eliminatory");
    expect(questions.at(-1)).toMatchObject({ kind: "text" });
  });
  it("baraja las opciones de forma estable por candidato y distinta entre candidatos", () => {
    const a1 = publicScreeningQuestions("candidato-a");
    const a2 = publicScreeningQuestions("candidato-a");
    const b = publicScreeningQuestions("candidato-b");
    expect(a1).toEqual(a2);
    const order = (list: typeof a1) =>
      list.map((question) =>
        "options" in question
          ? question.options.map((option) => option.id).join()
          : "",
      );
    expect(order(a1)).not.toEqual(order(b));
    // La correcta no queda siempre en la misma posición (en el original era b).
    const positions = new Set(
      SCREENING_QUESTIONS.filter(
        (question) => question.scoring === "scored",
      ).map((question) => {
        const shown = a1.find((item) => item.id === question.id);
        return shown && "options" in shown && question.scoring === "scored"
          ? shown.options.findIndex((option) => option.id === question.correct)
          : -1;
      }),
    );
    expect(positions.size).toBeGreaterThan(1);
  });
  it("el bloque de especialidad conserva su orden natural", () => {
    const first = publicScreeningQuestions("x")[3];
    expect("options" in first && first.options.at(-1)?.id).toBe("ninguna");
  });
  it("descarta opciones desconocidas y aplica «Ninguna de estas» como exclusiva", () => {
    expect(
      sanitizeScreeningAnswers({
        q1: ["ansiedad", "inventada", "ansiedad"],
        q3: "adultos",
        q4: ["neuro", "ninguna"],
        q5: "alianza",
        q6: ["tcc"],
        desconocida: "x",
      }),
    ).toEqual({
      q1: ["ansiedad"],
      q3: "adultos",
      q4: ["ninguna"],
      q5: "alianza",
    });
    expect(missingScreeningAnswers({})).toHaveLength(19);
    expect(missingScreeningAnswers(perfect())).toEqual([]);
  });
  it("puntúa 18 de 18 con todas correctas y sin alertas", () => {
    expect(scoreScreening(perfect())).toMatchObject({
      score: 18,
      maxScore: 18,
      flags: [],
    });
  });
  it("las preguntas de peso alto restan 2 puntos", () => {
    expect(scoreScreening(wrong(perfect(), "q8")).score).toBe(16);
  });
  it.each([
    "q6",
    "q10",
    "q13",
    "q14",
  ])("marca %s como eliminatoria siempre", (id) => {
    expect(scoreScreening(wrong(perfect(), id)).flags).toEqual([
      expect.objectContaining({ questionId: id, reason: "eliminatory" }),
    ]);
  });
  it("TDAH solo es eliminatoria si trabaja con infancia o adolescencia", () => {
    expect(scoreScreening(wrong(perfect(), "q12")).flags).toEqual([]);
    const children = wrong({ ...perfect(), q3: "adolescentes" }, "q12");
    expect(scoreScreening(children).flags).toEqual([
      expect.objectContaining({ questionId: "q12", reason: "children" }),
    ]);
    const area = wrong({ ...perfect(), q1: ["infancia"] }, "q12");
    expect(scoreScreening(area).flags).toHaveLength(1);
  });
  it("delirium solo es eliminatoria si trabaja con adultos mayores", () => {
    expect(scoreScreening(wrong(perfect(), "q15")).flags).toEqual([]);
    const older = wrong({ ...perfect(), q2: ["mayores"] }, "q15");
    expect(scoreScreening(older).flags).toEqual([
      expect.objectContaining({ questionId: "q15", reason: "older" }),
    ]);
  });
});

describe("cuestionario clínico: guardado y envío", () => {
  async function cleanup() {
    await db
      .delete(professionalScreenings)
      .where(like(professionalScreenings.professionalId, `${P}%`));
    await db.delete(professionals).where(like(professionals.id, `${P}%`));
    await db.delete(user).where(like(user.id, `${P}%`));
  }
  async function candidate(
    id: string,
    status = "pending_verification",
    nonClinicalHelper = false,
  ) {
    await db.insert(user).values({
      id,
      name: "Candidatura ficticia",
      email: `${id}@example.test`,
    });
    await db.insert(professionals).values({
      id,
      userId: id,
      email: `${id}@example.test`,
      fullName: "Candidatura ficticia",
      status,
      nonClinicalHelper,
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: stamp(),
      updatedAt: stamp(),
    });
  }
  beforeEach(cleanup);
  afterAll(cleanup);

  it("guarda el progreso y no puntúa hasta el envío", async () => {
    await candidate(P);
    expect(await saveScreeningDraft(P, { q1: ["trauma"], q5: "alianza" })).toBe(
      true,
    );
    expect(await readScreening(P)).toMatchObject({
      answers: { q1: ["trauma"], q5: "alianza" },
      submittedAt: null,
      score: null,
    });
    expect(
      await saveScreeningDraft(P, { q1: ["trauma"] }, "Borrador de límites"),
    ).toBe(true);
    expect((await readScreening(P))?.exclusions).toBe("Borrador de límites");
    await saveScreeningDraft(P, { q1: ["trauma"], q5: "alianza" });
    expect(await readScreening(P)).toMatchObject({
      answers: { q1: ["trauma"], q5: "alianza" },
      exclusions: "Borrador de límites",
    });
  });
  it("rechaza un envío incompleto señalando la primera pregunta pendiente", async () => {
    await candidate(P);
    expect(await submitScreening(P, { q1: ["trauma"] }, "")).toMatchObject({
      ok: false,
      questionId: "q2",
    });
    expect(await submitScreening(P, perfect(), "corto")).toMatchObject({
      ok: false,
      questionId: "exclusions",
    });
  });
  it("envía, puntúa en el servidor y no permite reescribir lo enviado", async () => {
    await candidate(P);
    expect(
      await submitScreening(
        P,
        wrong(perfect(), "q14"),
        "No atendería casos fuera de mi formación ficticia.",
      ),
    ).toEqual({ ok: true, firstSubmission: true });
    const saved = await readScreening(P);
    expect(saved).toMatchObject({ score: 17, maxScore: 18 });
    expect(saved?.submittedAt).toBeTruthy();
    expect(saved?.flags).toEqual([
      expect.objectContaining({ questionId: "q14" }),
    ]);
    expect(await saveScreeningDraft(P, perfect())).toBe(false);
    expect(
      await submitScreening(
        P,
        perfect(),
        "Otra respuesta suficientemente larga.",
      ),
    ).toEqual({ ok: true, firstSubmission: false });
    expect((await readScreening(P))?.score).toBe(17);
  });
  it("una solicitud de apoyo voluntario también envía el cuestionario", async () => {
    await candidate(P, "pending_verification", true);
    expect(
      await submitScreening(
        P,
        perfect(),
        "No atendería casos clínicos: acompaño solo como voluntario.",
      ),
    ).toEqual({ ok: true, firstSubmission: true });
    expect((await readScreening(P))?.submittedAt).toBeTruthy();
  });
  it.each([
    ["aprobado", "approved", false],
    ["rechazado", "rejected", false],
    ["voluntario aprobado", "approved", true],
  ] as const)("no guarda cuestionarios de un perfil %s", async (_label, status, helper) => {
    await candidate(P, status, helper);
    expect(await saveScreeningDraft(P, perfect())).toBe(false);
    expect(
      await submitScreening(P, perfect(), "Respuesta ficticia suficiente."),
    ).toMatchObject({ ok: false });
    expect(
      await db.query.professionalScreenings.findFirst({
        where: eq(professionalScreenings.professionalId, P),
      }),
    ).toBeUndefined();
  });
});
