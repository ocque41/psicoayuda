import { z } from "zod";
import { timeZoneSchema } from "./domain";
import {
  type PatientProfileContent,
  patientSexValues,
} from "./patient-profile-fields-model";

export {
  emptyPatientProfile,
  type PatientProfileContent,
  patientSexLabels,
  patientSexValues,
} from "./patient-profile-fields-model";
export const patientProfileContentSchema = z.object({
  sex: z.enum(patientSexValues, "Elige una opción válida de sexo.").default(""),
  birthDate: z.string().trim().max(10).default(""),
  consultationReason: z
    .string()
    .trim()
    .max(2000, "El motivo admite hasta 2.000 caracteres.")
    .default(""),
  generalNote: z
    .string()
    .trim()
    .max(12000, "La nota de ficha admite hasta 12.000 caracteres.")
    .default(""),
});

function todayInZone(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** La fecha pertenece al calendario local de la persona, sin convertir a UTC. */
export function patientProfileSchema(timeZone: string, now = new Date()) {
  return patientProfileContentSchema.superRefine((content, context) => {
    if (!timeZoneSchema.safeParse(timeZone).success) {
      context.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Revisa la zona horaria de esta ficha.",
      });
      return;
    }
    if (!content.birthDate) return;
    const value = content.birthDate;
    const date = new Date(`${value}T12:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value < "0001-01-01" ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      context.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Indica una fecha de nacimiento válida.",
      });
    } else if (value > todayInZone(timeZone, now)) {
      context.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "La fecha de nacimiento no puede estar en el futuro.",
      });
    }
  });
}
export function hasPatientProfileContent(content: PatientProfileContent) {
  return Object.values(content).some(Boolean);
}
