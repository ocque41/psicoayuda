import { z } from "zod";
import { languages, needCategories, urgencyLevels } from "@/lib/constants";
import { toIntlNumber } from "@/lib/phone";

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
  // Opcional: quien pide ayuda puede dejar correo para que le escriban, o no
  // darlo y hablar por chat con un profesional. Vacío o ausente = sin correo.
  email: z
    .email("Escribe un correo válido.")
    .trim()
    .toLowerCase()
    .optional()
    .or(z.literal(""))
    .transform((value) => value || undefined),
  // Alias opcional: cómo quiere que la llamen. No es identidad legal; la persona
  // decide qué compartir. Se muestra al profesional en el aviso de mensaje.
  seekerName: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => value || undefined),
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
  // Si la persona eligió a un profesional concreto desde el feed, viaja su id.
  preferredProfessionalId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => value || undefined),
});

export const professionalSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Escribe tu nombre completo.")
    .max(120, "El nombre es demasiado largo."),
  displayName: optionalText,
  country: optionalText,
  city: optionalText,
  licenseNumber: z
    .string()
    .trim()
    .min(2, "Indica tu credencial o número de licencia.")
    .max(120, "La credencial es demasiado larga."),
  licenseCountry: z
    .string()
    .trim()
    .min(2, "Elige el país de tu credencial.")
    .max(80, "El país de la credencial es demasiado largo."),
  university: z
    .string()
    .trim()
    .min(2, "Indica la universidad donde obtuviste tu título.")
    .max(160, "El nombre de la universidad es demasiado largo."),
  // Contacto directo (libro amarillo). Ya NO es obligatorio: el correo de la
  // cuenta siempre se muestra como contacto, así que con eso basta. WhatsApp y
  // teléfono fijo son opcionales; cuando se dan, se validan para que generen un
  // enlace usable (ver src/lib/phone.ts y professional-card): wa.me / tel:.
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || toIntlNumber(value) !== null, {
      message:
        "Escribe un WhatsApp válido. Si estás fuera de Venezuela, incluye el código de país (ej. +57…).",
    }),
  landline: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || toIntlNumber(value) !== null, {
      message:
        "Escribe un teléfono fijo válido. Si estás fuera de Venezuela, incluye el código de país (ej. +57…).",
    }),
  // Foto opcional: data URL ya redimensionada en el cliente. Acotamos formato y
  // tamaño (~225 KB) para que no pese ni permita inyectar otra cosa.
  photo: z
    .string()
    .max(300_000, "La foto es demasiado grande. Sube una imagen más liviana.")
    .refine(
      (value) =>
        value === "" || /^data:image\/(jpeg|png|webp);base64,/.test(value),
      "Formato de foto no válido.",
    )
    .optional()
    .transform((value) => value || undefined),
  supportAreas: z
    .array(z.enum(needCategories))
    .min(1, "Elige al menos un área de apoyo."),
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
