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

// Vías de contacto que puede elegir una organización como la "más rápida".
export const preferredContactMethods = ["whatsapp", "phone", "email"] as const;

// Formulario de fundaciones/organizaciones que quieren aliarse (público, sin
// sesión). Solo pedimos lo imprescindible para poder contactarles.
export const foundationContactSchema = z
  .object({
    contactName: z
      .string()
      .trim()
      .min(2, "Escribe el nombre de la persona de contacto.")
      .max(120, "El nombre es demasiado largo."),
    organizationName: z
      .string()
      .trim()
      .min(2, "Escribe el nombre de la fundación u organización.")
      .max(160, "El nombre de la organización es demasiado largo."),
    // Vía de contacto MÁS RÁPIDA (obligatorio): así el equipo sabe por dónde
    // escribir primero (WhatsApp/llamada/correo) y puede ir directo con un clic.
    preferredContact: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.enum(preferredContactMethods, {
        error: "Elige cuál es la forma más rápida de contactarte.",
      }),
    ),
    // Web opcional: muchas organizaciones pequeñas no tienen sitio. Aceptamos con
    // o sin esquema (fundacion.org o https://fundacion.org), pero si la dan
    // exigimos que PAREZCA una web (dominio con punto y TLD): no vale texto suelto.
    website: z
      .string()
      .trim()
      .max(200, "La dirección web es demasiado larga.")
      .optional()
      .transform((value) => value || undefined)
      .refine(
        (value) =>
          value === undefined ||
          /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([/?#]\S*)?$/i.test(value),
        "Escribe una dirección web válida (ej. fundacion.org).",
      ),
    email: z.email("Escribe un correo válido.").trim().toLowerCase(),
    // Teléfono opcional en general, pero OBLIGATORIO si eligen WhatsApp o llamada
    // como vía rápida (ver el .refine de abajo). Debe ser un número válido: lo
    // normalizamos con la misma heurística que la ficha profesional.
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((value) => value || undefined)
      .refine((value) => value === undefined || toIntlNumber(value) !== null, {
        message:
          "Escribe un teléfono válido. Si estás fuera de Venezuela, incluye el código de país (ej. +57…).",
      }),
    // Mensaje opcional: cómo les gustaría colaborar.
    message: z
      .string()
      .trim()
      .max(1000, "El mensaje es demasiado largo.")
      .optional()
      .transform((value) => value || undefined),
  })
  .refine(
    // Si la vía rápida es WhatsApp o llamada, necesitamos el número para poder
    // ir directo (wa.me / tel:). Con correo basta el email, que ya es obligatorio.
    (data) => data.preferredContact === "email" || Boolean(data.phone),
    {
      message:
        "Escribe tu número para poder contactarte por WhatsApp o por llamada.",
      path: ["phone"],
    },
  );

export const professionalSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Escribe tu nombre completo.")
      .max(120, "El nombre es demasiado largo."),
    displayName: optionalText,
    country: optionalText,
    city: optionalText,
    // Verificación flexible: la credencial ya no es un único campo obligatorio.
    // El alta exige UNA vía (FPV / supervisión / comprobante) o marcar "Auxiliar
    // no Clínico" — ver los .refine del final. Estas columnas quedan opcionales
    // para no tocar los perfiles registrados antes de esta regla.
    licenseNumber: z
      .string()
      .trim()
      .max(120, "La credencial es demasiado larga.")
      .optional()
      .transform((value) => value || undefined),
    licenseCountry: z
      .string()
      .trim()
      .max(80, "El país de la credencial es demasiado largo.")
      .optional()
      .transform((value) => value || undefined),
    // Universidad: obligatoria para clínicos (se exige en el .refine, salvo
    // auxiliar no clínico); aquí solo acotamos longitud.
    university: z
      .string()
      .trim()
      .max(160, "El nombre de la universidad es demasiado largo.")
      .optional()
      .transform((value) => value || undefined),
    // Vía 1: número de Psicólogo Federado (FPV). Verificable públicamente.
    fpvNumber: z
      .string()
      .trim()
      .max(60, "El número FPV es demasiado largo.")
      .optional()
      .transform((value) => value || undefined),
    // Vía 2: trabajo bajo supervisión (de quién / en qué institución).
    supervisionInfo: z
      .string()
      .trim()
      .max(300, "El texto de supervisión es demasiado largo.")
      .optional()
      .transform((value) => value || undefined),
    // Vía 3: comprobante de registro. El documento es obligatorio si se elige
    // esta vía (todos los organismos emiten prueba verificable).
    registrationType: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z
        .enum(["ministerio_educacion", "colegio_psicologos", "inprepsi"])
        .optional(),
    ),
    registrationDetail: z
      .string()
      .trim()
      .max(160, "El detalle del registro es demasiado largo.")
      .optional()
      .transform((value) => value || undefined),
    // Documento subido como data URL (imagen o PDF). Acotamos tamaño (~1 MB) y
    // formato para que no pese ni permita inyectar otra cosa.
    registrationProofDoc: z
      .string()
      .max(
        1_200_000,
        "El documento es demasiado grande. Sube un archivo más liviano (máx ~1 MB).",
      )
      .refine(
        (value) =>
          value === "" ||
          /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(value),
        "Formato de documento no válido. Sube una imagen (JPG/PNG/WebP) o un PDF.",
      )
      .optional()
      .transform((value) => value || undefined),
    // Auxiliar no clínico: exime de credencial y universidad; etiqueta pública.
    nonClinicalHelper: checkboxBoolean.default(false),
    // Contacto directo (libro amarillo). El alta exige AL MENOS UNA vía de las
    // tres: correo público, teléfono fijo o WhatsApp (ver .refine del final). Las
    // columnas siguen siendo opcionales para preservar sin cambios los perfiles
    // existentes registrados antes de esta regla.
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
    // ¿Mostrar el correo de la cuenta como contacto público? Es una de las tres
    // vías válidas; por defecto sí (checkbox marcado en el alta).
    emailPublic: checkboxBoolean.default(false),
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
  })
  .refine(
    // Obligatorio: al menos UNA vía de contacto (correo público, fijo o WhatsApp).
    (data) => data.emailPublic || Boolean(data.phone || data.landline),
    {
      message:
        "Danos al menos una forma de contacto: tu correo, un teléfono fijo o WhatsApp.",
      path: ["emailPublic"],
    },
  )
  .refine(
    // Universidad obligatoria salvo auxiliar no clínico (estudiantes/voluntarios).
    (data) => data.nonClinicalHelper || Boolean(data.university),
    {
      message: "Indica la universidad donde obtuviste tu título.",
      path: ["university"],
    },
  )
  .refine(
    // Verificación: al menos UNA vía de credencial, salvo auxiliar no clínico.
    (data) =>
      data.nonClinicalHelper ||
      Boolean(data.fpvNumber || data.supervisionInfo || data.registrationType),
    {
      message:
        'Acredita tu perfil: indica tu número FPV, tu supervisión, o sube un comprobante de registro. Si no tienes credencial para ejercer, marca "Auxiliar no Clínico".',
      path: ["fpvNumber"],
    },
  )
  .refine(
    // Si eligen la vía de comprobante de registro, el documento es obligatorio.
    (data) => !data.registrationType || Boolean(data.registrationProofDoc),
    {
      message: "Sube el comprobante de tu registro (una imagen o un PDF).",
      path: ["registrationProofDoc"],
    },
  );

export const statusSchema = z.enum(["new", "contacted", "assigned", "closed"]);

export const professionalStatusSchema = z.enum([
  "pending_verification",
  "approved",
  "rejected",
  "suspended",
]);

// Estado de una solicitud de alianza (formulario /alianzas), gestionada en /admin.
export const allianceStatusSchema = z.enum(["pending", "approved", "rejected"]);
