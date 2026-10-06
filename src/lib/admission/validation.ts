import { z } from "zod";
import { countries } from "@/lib/constants";
import { timeZoneSchema } from "@/lib/practice/domain";
import { type AdmissionStage, admissionCoreStageIds } from "./types";

const reference = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => !/@|\b[VE]\s*[-:]?\s*\d+\b|\b\d{5,}\b/i.test(value),
    "Usa una referencia de cotejo sin cédula, teléfono ni correo.",
  );
export const requiredAdmissionReference = reference.refine(
  (value) => value.length >= 5,
  "Describe brevemente el cotejo, sin datos de identidad.",
);
export const admissionMutationSchema = z.object({
  professionalId: z.string().min(1).max(120),
  revision: z.coerce.number().int().min(0).max(1_000_000),
  configRevision: z.coerce.number().int().min(1).max(1_000_000),
  profileRevision: z.string().datetime().max(40),
});
export const admissionReviewSchema = admissionMutationSchema
  .extend({
    identityChecked: z.boolean(),
    identityReference: reference,
    credentialsChecked: z.boolean(),
    credentialsReference: reference,
    interviewLocal: z.string().max(16),
    interviewTimeZone: timeZoneSchema,
    interviewReference: reference,
    interviewCompleted: z.boolean(),
  })
  .superRefine((value, context) => {
    for (const key of ["identity", "credentials"] as const) {
      if (value[`${key}Checked`] && value[`${key}Reference`].length < 5)
        context.addIssue({
          code: "custom",
          path: [`${key}Reference`],
          message: "Añade una referencia breve del cotejo realizado.",
        });
    }
    if (
      value.interviewCompleted &&
      (!value.interviewLocal || value.interviewReference.length < 5)
    )
      context.addIssue({
        code: "custom",
        path: [value.interviewLocal ? "interviewReference" : "interviewLocal"],
        message: "La entrevista realizada necesita fecha y referencia.",
      });
  });
export const admissionScopeSchema = admissionMutationSchema.extend({
  country: z
    .string()
    .refine((value) => (countries as readonly string[]).includes(value)),
  registryReference: requiredAdmissionReference,
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checked: z.literal("on"),
});
export function parseAdmissionStages(value: string): AdmissionStage[] | null {
  if (value.length > 12_000) return null;
  try {
    const result = z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
          label: z.string().trim().min(2).max(48),
          core: z.boolean(),
        }),
      )
      .min(5)
      .max(12)
      .safeParse(JSON.parse(value));
    if (!result.success) return null;
    const stages = result.data;
    if (
      new Set(stages.map((stage) => stage.id)).size !== stages.length ||
      stages.at(-1)?.id !== "publication"
    )
      return null;
    for (const id of admissionCoreStageIds)
      if (!stages.some((stage) => stage.id === id && stage.core)) return null;
    if (
      stages.some(
        (stage) =>
          stage.core &&
          !(admissionCoreStageIds as readonly string[]).includes(stage.id),
      )
    )
      return null;
    return stages;
  } catch {
    return null;
  }
}
