import { z } from "zod";
import { languages, needCategories, urgencyLevels } from "@/lib/constants";

const checkboxBoolean = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);

const requiredCheckbox = checkboxBoolean.refine((value) => value, {
  message: "Debes aceptar este punto para continuar.",
});

const optionalText = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => value || undefined);

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().optional(),
);

export const helpRequestSchema = z.object({
  email: z.email("Escribe un correo válido.").trim().toLowerCase(),
  language: z.enum(languages),
  country: z.string().trim().max(80).default("Venezuela"),
  state: optionalText,
  city: optionalText,
  lat: optionalNumber.pipe(z.number().min(-90).max(90).optional()),
  lng: optionalNumber.pipe(z.number().min(-180).max(180).optional()),
  locationConsent: checkboxBoolean.default(false),
  needCategory: z.enum(needCategories),
  urgency: z.enum(urgencyLevels),
  consentContact: checkboxBoolean.refine((value) => value, {
    message: "Necesitamos tu consentimiento para contactarte.",
  }),
});

export const professionalSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  displayName: optionalText,
  country: optionalText,
  city: optionalText,
  licenseNumber: z.string().trim().min(2).max(120),
  licenseCountry: z.string().trim().min(2).max(80),
  languages: z.array(z.enum(languages)).min(1),
  supportAreas: z.array(z.enum(needCategories)).min(1),
  remoteAvailable: checkboxBoolean.default(false),
  crisisExperience: checkboxBoolean.default(false),
  contactEmail: z.email().trim().toLowerCase().optional().or(z.literal("")),
  contactNotes: optionalText,
  shortBio: z.string().trim().max(600).optional(),
  acceptingRequests: checkboxBoolean.default(false),
  maxActiveRequests: z.coerce.number().int().min(1).max(10),
  conductFreeService: requiredCheckbox,
  conductNoClientCapture: requiredCheckbox,
  conductConfidentiality: requiredCheckbox,
  conductNoEmergencyGuarantee: requiredCheckbox,
  conductCompetence: requiredCheckbox,
});

export const statusSchema = z.enum(["new", "contacted", "assigned", "closed"]);

export const professionalStatusSchema = z.enum([
  "pending_verification",
  "approved",
  "rejected",
  "suspended",
]);
