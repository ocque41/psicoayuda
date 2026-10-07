"use client";

import {
  type ChangeEvent,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { saveProfessionalOnboarding } from "@/app/actions";
import { captureOnboardingAnswers } from "@/components/onboarding/capture-answers";
import styles from "@/components/onboarding/onboarding.module.css";
import { useDraftSave } from "@/components/onboarding/use-draft-save";
import { WizardFrame } from "@/components/onboarding/wizard-frame";
import { needCategories, needLabels } from "@/lib/constants";
import { COUNTRY_OPTIONS } from "@/lib/geography";
import type { SafeDraft } from "@/lib/onboarding/drafts";
import { timeZoneOptions } from "@/lib/onboarding/locale";

// Redimensiona la foto elegida a un avatar pequeño (máx 256px) y la comprime a
// JPEG antes de subirla: así no pesa ni recarga la web ni la base de datos.
const PHOTO_MAX_PX = 256;
const PHOTO_QUALITY = 0.82;

function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(
          1,
          PHOTO_MAX_PX / Math.max(img.width, img.height),
        );
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Pipeline aparte para el COMPROBANTE de registro (no reusa el de la foto: un
// certificado a 256px sería ilegible). Imágenes → se redimensionan a un tamaño
// legible; PDF → se lee tal cual. Tope ~1 MB, igual que la validación del server.
// ponytail: base64 en D1, sin R2. Techo ~1 MB; si el volumen crece, mover a R2 + URL.
const DOC_MAX_PX = 1600;
const DOC_QUALITY = 0.7;
const DOC_MAX_BYTES = 1_200_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function resizeDocumentToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, DOC_MAX_PX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", DOC_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Datos actuales del perfil para precargar el formulario al EDITAR. Sin esto,
// quien entraba a actualizar su información veía todo vacío y al guardar
// machacaba su perfil con blancos (pasó con voluntarias reales).
export type ExistingProfessional = {
  fullName: string;
  displayName: string | null;
  country: string | null;
  city: string | null;
  photo: string | null;
  nonClinicalHelper: boolean;
  fpvNumber: string | null;
  supervisionInfo: string | null;
  licenseNumber: string | null;
  licenseCountry: string | null;
  university: string | null;
  supportAreas: string[];
  maxActiveRequests: number;
  remoteAvailable: boolean;
  inPersonAvailable: boolean;
  acceptingRequests: boolean;
  crisisExperience: boolean;
  offersPaidServices: boolean;
  shortBio: string | null;
  emailPublic: boolean;
  phone: string | null;
  landline: string | null;
  contactEmail: string | null;
  contactNotes: string | null;
  registrationType?: string | null;
  registrationDetail?: string | null;
  hasRegistrationProof?: boolean;
  timezone?: string | null;
};

type ProfessionalAnswers = {
  fullName: string;
  displayName: string;
  country: string;
  city: string;
  timezone: string;
  photo: string;
  nonClinicalHelper: boolean;
  credentialPath: string;
  university: string;
  fpvNumber: string;
  cedula: string;
  supervisionInfo: string;
  licenseNumber: string;
  licenseCountry: string;
  registrationType: string;
  registrationDetail: string;
  registrationProofDoc: string;
  supportAreas: string[];
  maxActiveRequests: string;
  remoteAvailable: boolean;
  inPersonAvailable: boolean;
  acceptingRequests: boolean;
  crisisExperience: boolean;
  offersPaidServices: boolean;
  shortBio: string;
  emailPublic: boolean;
  phone: string;
  landline: string;
  contactEmail: string;
  contactNotes: string;
  conductFreeService: boolean;
  conductNoClientCapture: boolean;
  conductConfidentiality: boolean;
  conductNoEmergencyGuarantee: boolean;
  conductCompetence: boolean;
};
type Question = {
  field: keyof ProfessionalAnswers | "review";
  title: string;
  description?: string;
};

function questionsFor(answers: ProfessionalAnswers): Question[] {
  const steps: Question[] = [
    {
      field: "fullName",
      title: "¿Cuál es tu nombre completo?",
      description:
        "Lo usamos para revisar tu perfil. Luego eliges cómo quieres aparecer en el catálogo.",
    },
    {
      field: "displayName",
      title: "¿Cómo quieres presentarte?",
      description:
        "Este será tu nombre público. Puedes dejarlo vacío para usar tu nombre completo.",
    },
    {
      field: "country",
      title: "¿En qué país te encuentras?",
      description:
        "Tu ubicación y los países donde puedes atender se revisan por separado.",
    },
    {
      field: "city",
      title: "¿En qué ciudad estás?",
      description:
        "Nos ayuda a mostrar tu ubicación, especialmente si atiendes presencialmente.",
    },
    {
      field: "timezone",
      title: "¿Qué zona horaria usa tu consulta?",
      description:
        "Tu calendario y tus horarios se organizan con esta zona. Puedes ajustarla después.",
    },
    {
      field: "photo",
      title: "Una cara cercana, si te apetece",
      description:
        "Tu foto es opcional. La optimizamos antes de enviarla para mantener tu perfil ligero.",
    },
    {
      field: "nonClinicalHelper",
      title: "¿Cuál es tu rol de acompañamiento?",
      description:
        "Distinguir el acompañamiento clínico del apoyo voluntario ayuda a que cada persona elija con claridad.",
    },
  ];
  if (!answers.nonClinicalHelper) {
    steps.push({
      field: "university",
      title: "¿Dónde obtuviste tu título?",
      description:
        "La institución que emitió tu título profesional. El equipo revisa la información que compartes.",
    });
    steps.push({
      field: "credentialPath",
      title: "¿Cómo acreditas tu práctica?",
      description:
        "Elige la vía que corresponda a tu situación. Una persona revisará su validez y alcance; el registro no autoriza a ejercer en otros países.",
    });
    if (answers.credentialPath === "fpv") {
      steps.push({
        field: "fpvNumber",
        title: "Tu número de Psicólogo Federado",
        description:
          "Indica tu número FPV para cotejarlo con el registro correspondiente.",
      });
      steps.push({
        field: "cedula",
        title: "¿Quieres que cotejemos tu FPV ahora?",
        description:
          "Tu cédula es opcional y se utiliza solo para la consulta al registro oficial. No la guardamos.",
      });
    } else if (answers.credentialPath === "supervision") {
      steps.push({
        field: "supervisionInfo",
        title: "¿Quién supervisa tu trabajo?",
        description:
          "Indica la persona y la institución. El equipo comprobará el alcance de esta supervisión antes de habilitar atención clínica.",
      });
    } else if (answers.credentialPath === "document") {
      steps.push({
        field: "registrationType",
        title: "¿Dónde está registrado tu ejercicio?",
        description:
          "Selecciona el organismo correspondiente. Puedes indicar cualquier jurisdicción en el siguiente paso.",
      });
      steps.push({
        field: "registrationDetail",
        title: "La referencia de tu registro",
        description:
          "Indica número o jurisdicción para que el equipo pueda cotejarlo.",
      });
      steps.push({
        field: "registrationProofDoc",
        title: "Tu comprobante, en privado",
        description:
          "Sube una imagen legible o PDF, hasta 1 MB. Solo lo consulta el equipo autorizado para revisar credenciales.",
      });
    } else {
      steps.push({
        field: "licenseNumber",
        title: "¿Cuál es tu número de licencia?",
        description:
          "Usamos este dato para cotejar tu registro, sin publicarlo en tu ficha.",
      });
      steps.push({
        field: "licenseCountry",
        title: "¿Qué país emitió tu licencia?",
        description:
          "El equipo revisará las condiciones de ejercicio para cada país de atención.",
      });
    }
  }
  steps.push(
    {
      field: "supportAreas",
      title: "¿En qué áreas acompañas?",
      description:
        "Selecciona las áreas que corresponden a tu formación y experiencia.",
    },
    {
      field: "maxActiveRequests",
      title: "¿Cuántas solicitudes puedes acompañar?",
      description:
        "Este es el cupo del programa gratuito, separado de los pacientes que organizas en tu consulta. Puedes liberar contactos que no continúen.",
    },
    {
      field: "remoteAvailable",
      title: "¿Cómo prefieres acompañar?",
      description:
        "Marca las modalidades que ofreces. El profesional y la persona confirman la ubicación y las condiciones de cada atención.",
    },
    {
      field: "acceptingRequests",
      title: "¿Quieres recibir solicitudes?",
      description:
        "Puedes activar o pausar esta opción después. Las solicitudes se habilitan cuando el equipo apruebe tu perfil.",
    },
    {
      field: "crisisExperience",
      title: "¿Tienes experiencia en situaciones de crisis?",
      description:
        "Es una declaración de experiencia que el equipo puede revisar; no implica disponibilidad para emergencias.",
    },
    {
      field: "offersPaidServices",
      title: "¿Ofreces servicios de tu consulta?",
      description:
        "Tú acuerdas las condiciones con cada paciente. La Ayuda Terremoto conserva su programa gratuito y nunca se condiciona a contratar.",
    },
    {
      field: "shortBio",
      title: "¿Cómo te gustaría presentar tu forma de acompañar?",
      description:
        "Unas líneas claras y cercanas para tu ficha. Evita datos o relatos de pacientes.",
    },
    {
      field: "emailPublic",
      title: "¿Quieres mostrar tu correo en tu perfil?",
      description:
        "Tú eliges si tu correo de cuenta aparece como vía de contacto público.",
    },
    {
      field: "phone",
      title: "¿Usas WhatsApp para coordinar?",
      description:
        "Opcional si ya elegiste publicar tu correo. Incluye el prefijo internacional para que puedan contactarte desde cualquier país.",
    },
    {
      field: "landline",
      title: "¿Prefieres también un teléfono de contacto?",
      description:
        "Opcional. Será una vía de contacto pública si lo añades; incluye el prefijo internacional.",
    },
    {
      field: "contactEmail",
      title: "¿A qué correo debe escribirte el equipo?",
      description:
        "Este correo de coordinación se mantiene privado. Puede ser el mismo de tu cuenta.",
    },
    {
      field: "contactNotes",
      title: "¿Algo más para coordinar contigo?",
      description:
        "Opcional y privado. Indica solo preferencias de coordinación, sin datos de pacientes ni información clínica.",
    },
    {
      field: "conductFreeService",
      title: "Cuidamos el programa gratuito",
      description:
        "La ayuda por el terremoto no puede convertirse en una condición de pago.",
    },
    {
      field: "conductNoClientCapture",
      title: "Cada decisión se toma con libertad",
      description: "La ayuda gratuita no depende de contratar tu consulta.",
    },
    {
      field: "conductConfidentiality",
      title: "La confianza empieza por la privacidad",
      description:
        "La información que recibes exige un tratamiento confidencial.",
    },
    {
      field: "conductNoEmergencyGuarantee",
      title: "Aclaramos nuestros límites",
      description:
        "Nido no es un servicio de emergencias ni garantiza respuesta inmediata.",
    },
    {
      field: "conductCompetence",
      title: "Tu práctica, dentro de tu competencia",
      description:
        "El alcance profesional y los países de atención se revisan por separado.",
    },
    {
      field: "review",
      title: "Revisa tu perfil antes de enviarlo",
      description:
        "El equipo revisará tu incorporación. Podrás consultar el estado y actualizar la información desde tu cuenta.",
    },
  );
  return steps;
}

const checkboxLabels: Partial<Record<keyof ProfessionalAnswers, string>> = {
  acceptingRequests:
    "Quiero recibir solicitudes cuando mi perfil esté aprobado.",
  crisisExperience:
    "Tengo formación y experiencia acompañando situaciones de crisis.",
  offersPaidServices:
    "Ofrezco consultas y servicios de mi práctica profesional.",
  emailPublic: "Quiero mostrar el correo de mi cuenta como contacto público.",
  conductFreeService:
    "Acepto que la Ayuda Terremoto en Nido es gratuita y no cobraré por ella.",
  conductNoClientCapture:
    "Acepto no presionar para contratar servicios ni condicionar la ayuda gratuita a una contratación.",
  conductConfidentiality:
    "Acepto mantener la confidencialidad de la información recibida.",
  conductNoEmergencyGuarantee:
    "Entiendo que Nido no garantiza respuesta de emergencia.",
  conductCompetence:
    "Acepto trabajar solo dentro de mi competencia y del alcance de ejercicio revisado.",
};

export function ProfessionalOnboardingForm({
  email,
  name,
  existing,
  draft = {},
  ownerId,
}: {
  email: string;
  name?: string | null;
  existing?: ExistingProfessional | null;
  draft?: SafeDraft;
  ownerId: string;
}) {
  const editing = Boolean(existing);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [answers, setAnswers] = useState<ProfessionalAnswers>(() => ({
    fullName: existing?.fullName ?? String(draft.fullName ?? name ?? ""),
    displayName: existing?.displayName ?? String(draft.displayName ?? ""),
    country: existing?.country ?? String(draft.country ?? "Venezuela"),
    city: existing?.city ?? String(draft.city ?? ""),
    timezone: existing?.timezone ?? String(draft.timezone ?? "America/Caracas"),
    photo: existing?.photo ?? "",
    nonClinicalHelper:
      existing?.nonClinicalHelper ?? Boolean(draft.nonClinicalHelper),
    credentialPath: existing?.fpvNumber
      ? "fpv"
      : existing?.supervisionInfo
        ? "supervision"
        : existing?.registrationType
          ? "document"
          : "license",
    university: existing?.university ?? "",
    fpvNumber: existing?.fpvNumber ?? "",
    cedula: "",
    supervisionInfo: existing?.supervisionInfo ?? "",
    licenseNumber: existing?.licenseNumber ?? "",
    licenseCountry: existing?.licenseCountry ?? "Venezuela",
    registrationType: existing?.registrationType ?? "",
    registrationDetail: existing?.registrationDetail ?? "",
    registrationProofDoc: "",
    supportAreas:
      existing?.supportAreas ??
      (Array.isArray(draft.supportAreas) ? draft.supportAreas : []),
    maxActiveRequests: String(
      existing?.maxActiveRequests ?? draft.maxActiveRequests ?? 3,
    ),
    remoteAvailable:
      existing?.remoteAvailable ?? draft.remoteAvailable !== false,
    inPersonAvailable:
      existing?.inPersonAvailable ?? Boolean(draft.inPersonAvailable),
    acceptingRequests:
      existing?.acceptingRequests ?? draft.acceptingRequests !== false,
    crisisExperience:
      existing?.crisisExperience ?? Boolean(draft.crisisExperience),
    offersPaidServices:
      existing?.offersPaidServices ?? Boolean(draft.offersPaidServices),
    shortBio: existing?.shortBio ?? "",
    emailPublic: existing?.emailPublic ?? draft.emailPublic !== false,
    phone: existing?.phone ?? "",
    landline: existing?.landline ?? "",
    contactEmail: existing?.contactEmail ?? email,
    contactNotes: existing?.contactNotes ?? "",
    conductFreeService: editing,
    conductNoClientCapture: editing,
    conductConfidentiality: editing,
    conductNoEmergencyGuarantee: editing,
    conductCompetence: editing,
  }));
  const [step, setStep] = useState(
    editing ? 0 : Math.min(6, Number(draft.step) || 0),
  );
  const [clientError, setClientError] = useState("");
  const [serverErrorVisible, setServerErrorVisible] = useState(false);
  const [filePending, setFilePending] = useState(false);
  const [proofName, setProofName] = useState("");
  const questions = questionsFor(answers);
  const activeStep = Math.min(step, questions.length - 1);
  const question = questions[activeStep];
  const safeDraft = useMemo(
    () => ({
      fullName: answers.fullName,
      displayName: answers.displayName,
      country: answers.country,
      city: answers.city,
      timezone: answers.timezone,
      nonClinicalHelper: answers.nonClinicalHelper,
      supportAreas: answers.supportAreas,
      maxActiveRequests: answers.maxActiveRequests,
      remoteAvailable: answers.remoteAvailable,
      inPersonAvailable: answers.inPersonAvailable,
      acceptingRequests: answers.acceptingRequests,
      crisisExperience: answers.crisisExperience,
      offersPaidServices: answers.offersPaidServices,
      emailPublic: answers.emailPublic,
      step: activeStep,
    }),
    [
      answers.fullName,
      answers.displayName,
      answers.country,
      answers.city,
      answers.timezone,
      answers.nonClinicalHelper,
      answers.supportAreas,
      answers.maxActiveRequests,
      answers.remoteAvailable,
      answers.inPersonAvailable,
      answers.acceptingRequests,
      answers.crisisExperience,
      answers.offersPaidServices,
      answers.emailPublic,
      activeStep,
    ],
  );
  const { status, flush } = useDraftSave("pro", safeDraft, ownerId);
  const safeAction = useCallback(
    async (previous: unknown, data: FormData) => {
      const saved = await flush();
      if (!saved?.ok) return saved;
      try {
        return await saveProfessionalOnboarding(previous, data);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "digest" in error &&
          String(error.digest).startsWith("NEXT_REDIRECT")
        )
          throw error;
        return {
          ok: false as const,
          message:
            "No pudimos confirmar el guardado. Conserva esta ventana abierta y vuelve a intentar.",
        };
      }
    },
    [flush],
  );
  const [state, action, pending] = useActionState(safeAction, null);
  const zones = useMemo(
    () =>
      timeZoneOptions(
        existing?.timezone ?? String(draft.timezone ?? "America/Caracas"),
      ),
    [existing?.timezone, draft.timezone],
  );
  const countries = useMemo(
    () =>
      [
        ...new Set([
          ...COUNTRY_OPTIONS.map((option) => option.name),
          answers.country,
          answers.licenseCountry,
        ]),
      ].filter(Boolean),
    [answers.country, answers.licenseCountry],
  );
  useEffect(() => {
    // Retiramos borradores antiguos que almacenaban contacto y credenciales en el navegador.
    try {
      localStorage.removeItem(`nido-borrador-perfil:${email}`);
    } catch {
      /* El flujo funciona también si el almacenamiento está bloqueado. */
    }
  }, [email]);
  useEffect(() => {
    if (existing?.timezone || draft.timezone) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zones.includes(zone))
      setAnswers((current) => ({ ...current, timezone: zone }));
  }, [existing?.timezone, draft.timezone, zones]);
  const handledResponse = useRef<typeof state>(null);
  useEffect(() => {
    if (handledResponse.current === state) return;
    handledResponse.current = state;
    setServerErrorVisible(Boolean(state?.message));
    if (!state || !("field" in state) || !state.field) return;
    const index = questionsFor(answers).findIndex(
      (item) => item.field === state.field,
    );
    if (index >= 0) setStep(index);
  }, [state, answers]);
  function update(
    key: keyof ProfessionalAnswers,
    value: string | boolean | string[],
  ) {
    setClientError("");
    setServerErrorVisible(false);
    setAnswers((current) => ({ ...current, [key]: value }));
  }
  function next() {
    const current = captureOnboardingAnswers(formRef.current, answers);
    setAnswers(current);
    if (!formRef.current?.reportValidity()) return;
    if (question.field === "supportAreas" && !current.supportAreas.length) {
      setClientError("Elige al menos un área de acompañamiento.");
      return;
    }
    if (
      question.field === "remoteAvailable" &&
      !current.remoteAvailable &&
      !current.inPersonAvailable
    ) {
      setClientError("Elige al menos una modalidad para tu perfil.");
      return;
    }
    if (
      question.field === "registrationProofDoc" &&
      !current.registrationProofDoc &&
      !existing?.hasRegistrationProof
    ) {
      setClientError(
        "Carga un comprobante para que el equipo pueda revisarlo.",
      );
      return;
    }
    if (
      question.field === "landline" &&
      !current.emailPublic &&
      !current.phone.trim() &&
      !current.landline.trim()
    ) {
      setClientError(
        "Elige al menos una vía de contacto: correo, WhatsApp o teléfono.",
      );
      return;
    }
    setClientError("");
    setStep(Math.min(questions.length - 1, activeStep + 1));
  }
  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 12_000_000
    ) {
      setClientError("Elige una imagen JPG, PNG o WebP de hasta 12 MB.");
      return;
    }
    setFilePending(true);
    try {
      update("photo", await resizeImageToDataUrl(file));
    } catch {
      setClientError("No se pudo procesar la imagen. Prueba con otra.");
    } finally {
      setFilePending(false);
    }
  }
  async function handleProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    if (
      (!isPdf &&
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)) ||
      file.size > 12_000_000
    ) {
      setClientError(
        "Elige una imagen JPG, PNG o WebP, o un PDF. El archivo original puede tener hasta 12 MB.",
      );
      return;
    }
    setFilePending(true);
    try {
      const dataUrl = isPdf
        ? await readFileAsDataUrl(file)
        : await resizeDocumentToDataUrl(file);
      if (dataUrl.length > DOC_MAX_BYTES) {
        setClientError(
          "El comprobante supera 1 MB. Elige una versión más ligera.",
        );
        return;
      }
      update("registrationProofDoc", dataUrl);
      setProofName(file.name);
    } catch {
      setClientError(
        "No se pudo procesar el documento. Prueba con otro archivo.",
      );
    } finally {
      setFilePending(false);
    }
  }
  const field = question.field;
  const requiredText = [
    "fullName",
    "university",
    "fpvNumber",
    "licenseNumber",
    "supervisionInfo",
  ].includes(field);
  const textFields = [
    "fullName",
    "displayName",
    "city",
    "university",
    "fpvNumber",
    "cedula",
    "licenseNumber",
    "registrationDetail",
    "supervisionInfo",
    "phone",
    "landline",
    "contactEmail",
  ];
  const checkboxText = field !== "review" ? checkboxLabels[field] : undefined;
  return (
    <form
      action={action}
      ref={formRef}
      onSubmit={(event) => {
        if (field !== "review") {
          event.preventDefault();
          next();
        }
      }}
    >
      {Object.entries(answers).flatMap(([key, value]) =>
        key === "credentialPath"
          ? []
          : Array.isArray(value)
            ? value.map((item) => (
                <input
                  key={`${key}-${item}`}
                  type="hidden"
                  name={key}
                  value={item}
                />
              ))
            : [
                <input
                  key={key}
                  type="hidden"
                  name={key}
                  value={
                    typeof value === "boolean" ? (value ? "on" : "") : value
                  }
                />,
              ],
      )}
      <WizardFrame
        name={editing ? "Tu perfil profesional" : "Tu nueva consulta"}
        title={question.title}
        description={question.description}
        step={activeStep}
        total={questions.length}
        pending={pending || filePending}
        saveStatus={
          editing
            ? "Los cambios se confirman al terminar."
            : `${status} Credenciales y adjuntos se envían al terminar.`
        }
        onBack={() => {
          setAnswers(captureOnboardingAnswers(formRef.current, answers));
          setClientError("");
          setStep(Math.max(0, activeStep - 1));
        }}
        onNext={next}
        complete={field === "review"}
        onExit={() => {
          setAnswers(captureOnboardingAnswers(formRef.current, answers));
          return flush(captureOnboardingAnswers(formRef.current, safeDraft));
        }}
      >
        <div className={styles.field}>
          {textFields.includes(field) ? (
            <>
              <label htmlFor={`${formId}-${field}`}>
                {field === "contactEmail"
                  ? "Correo privado de coordinación"
                  : field === "cedula"
                    ? "Cédula · opcional"
                    : field === "phone"
                      ? "WhatsApp · opcional"
                      : field === "landline"
                        ? "Teléfono · opcional"
                        : question.title}
              </label>
              <input
                id={`${formId}-${field}`}
                data-onboarding-answer={field}
                value={String(answers[field as keyof ProfessionalAnswers])}
                onChange={(event) =>
                  update(field as keyof ProfessionalAnswers, event.target.value)
                }
                required={requiredText}
                minLength={requiredText ? 2 : undefined}
                maxLength={
                  field === "supervisionInfo"
                    ? 300
                    : field === "fullName"
                      ? 120
                      : 160
                }
                type={
                  field === "contactEmail"
                    ? "email"
                    : ["phone", "landline"].includes(field)
                      ? "tel"
                      : "text"
                }
                autoComplete={
                  field === "fullName"
                    ? "name"
                    : field === "city"
                      ? "address-level2"
                      : ["phone", "landline"].includes(field)
                        ? "tel"
                        : field === "contactEmail"
                          ? "email"
                          : "off"
                }
                inputMode={field === "cedula" ? "numeric" : undefined}
              />
            </>
          ) : null}
          {field === "country" || field === "licenseCountry" ? (
            <>
              <label htmlFor={`${formId}-${field}`}>País</label>
              <select
                id={`${formId}-${field}`}
                data-onboarding-answer={field}
                value={answers[field]}
                onChange={(event) => update(field, event.target.value)}
                autoComplete="country-name"
              >
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {field === "timezone" ? (
            <>
              <label htmlFor={`${formId}-timezone`}>Zona horaria</label>
              <select
                id={`${formId}-timezone`}
                data-onboarding-answer="timezone"
                value={answers.timezone}
                onChange={(event) => update("timezone", event.target.value)}
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {field === "photo" ? (
            <>
              {answers.photo ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: vista previa local de data URL sin descarga de red */}
                  <img
                    className={styles.photo}
                    src={answers.photo}
                    alt="Vista previa de tu foto"
                  />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => update("photo", "")}
                  >
                    Quitar foto
                  </button>
                </>
              ) : null}
              <label htmlFor={`${formId}-photo`}>
                Elige una foto · opcional
              </label>
              <input
                id={`${formId}-photo`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoChange}
                disabled={filePending}
              />
            </>
          ) : null}
          {field === "nonClinicalHelper" ? (
            <div className={styles.checks}>
              <label>
                <input
                  type="radio"
                  checked={!answers.nonClinicalHelper}
                  onChange={() => update("nonClinicalHelper", false)}
                />
                Profesional clínico · revisaré mi credencial
              </label>
              <label>
                <input
                  type="radio"
                  checked={answers.nonClinicalHelper}
                  onChange={() => update("nonClinicalHelper", true)}
                />
                Auxiliar no clínico · apoyo voluntario dentro de mi competencia
              </label>
            </div>
          ) : null}
          {field === "credentialPath" ? (
            <div className={styles.checks}>
              {[
                ["license", "Licencia o colegiatura profesional"],
                ["fpv", "Registro FPV de Venezuela"],
                ["document", "Comprobante de registro"],
                ["supervision", "Trabajo bajo supervisión"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    checked={answers.credentialPath === value}
                    onChange={() => update("credentialPath", value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : null}
          {field === "registrationType" ? (
            <>
              <label htmlFor={`${formId}-registration`}>
                Organismo de registro
              </label>
              <select
                id={`${formId}-registration`}
                data-onboarding-answer="registrationType"
                value={answers.registrationType}
                onChange={(event) =>
                  update("registrationType", event.target.value)
                }
                required
              >
                <option value="">Selecciona tu registro</option>
                <option value="colegio_psicologos">
                  Colegio u organismo profesional de mi jurisdicción
                </option>
                <option value="ministerio_educacion">
                  Ministerio de Educación
                </option>
                <option value="inprepsi">INPREPSI</option>
              </select>
            </>
          ) : null}
          {field === "registrationProofDoc" ? (
            <>
              {existing?.hasRegistrationProof &&
              !answers.registrationProofDoc ? (
                <p className="status-message">
                  Ya recibimos tu comprobante. Puedes conservarlo o sustituirlo.
                </p>
              ) : null}
              <label htmlFor={`${formId}-proof`}>
                Comprobante de tu registro
              </label>
              <input
                id={`${formId}-proof`}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleProofChange}
                disabled={filePending}
                required={
                  !answers.registrationProofDoc &&
                  !existing?.hasRegistrationProof
                }
              />
              {proofName ? (
                <p role="status">Documento preparado: {proofName}</p>
              ) : null}
            </>
          ) : null}
          {field === "supportAreas" ? (
            <div className={styles.checks}>
              {needCategories.map((area) => (
                <label key={area}>
                  <input
                    type="checkbox"
                    checked={answers.supportAreas.includes(area)}
                    onChange={(event) =>
                      update(
                        "supportAreas",
                        event.target.checked
                          ? [...answers.supportAreas, area]
                          : answers.supportAreas.filter(
                              (value) => value !== area,
                            ),
                      )
                    }
                  />
                  {needLabels[area]}
                </label>
              ))}
            </div>
          ) : null}
          {field === "maxActiveRequests" ? (
            <>
              <label htmlFor={`${formId}-max`}>
                Solicitudes del programa gratuito
              </label>
              <input
                id={`${formId}-max`}
                data-onboarding-answer="maxActiveRequests"
                type="number"
                min={1}
                max={10}
                step={1}
                inputMode="numeric"
                required
                value={answers.maxActiveRequests}
                onChange={(event) =>
                  update("maxActiveRequests", event.target.value)
                }
              />
            </>
          ) : null}
          {field === "remoteAvailable" ? (
            <div className={styles.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={answers.remoteAvailable}
                  onChange={(event) =>
                    update("remoteAvailable", event.target.checked)
                  }
                />
                Atención en remoto
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={answers.inPersonAvailable}
                  onChange={(event) =>
                    update("inPersonAvailable", event.target.checked)
                  }
                />
                Atención presencial en mi ciudad
              </label>
            </div>
          ) : null}
          {field === "shortBio" || field === "contactNotes" ? (
            <>
              <label htmlFor={`${formId}-${field}`}>
                {field === "shortBio"
                  ? "Tu presentación pública"
                  : "Preferencias privadas de coordinación"}
              </label>
              <textarea
                id={`${formId}-${field}`}
                data-onboarding-answer={field}
                value={answers[field]}
                onChange={(event) => update(field, event.target.value)}
                maxLength={field === "shortBio" ? 600 : 500}
                rows={4}
              />
            </>
          ) : null}
          {checkboxText ? (
            <div className={styles.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(answers[field as keyof ProfessionalAnswers])}
                  onChange={(event) =>
                    update(
                      field as keyof ProfessionalAnswers,
                      event.target.checked,
                    )
                  }
                  required={field.startsWith("conduct")}
                />
                {checkboxText}
              </label>
              {field === "emailPublic" ? (
                <p className="hint">Correo de tu cuenta: {email}</p>
              ) : null}
            </div>
          ) : null}
          {field === "review" ? (
            <dl className={styles.review}>
              <div>
                <dt>Nombre público</dt>
                <dd>{answers.displayName || answers.fullName}</dd>
              </div>
              <div>
                <dt>Ubicación</dt>
                <dd>
                  {[answers.city, answers.country].filter(Boolean).join(", ")}
                </dd>
              </div>
              <div>
                <dt>Calendario</dt>
                <dd>{answers.timezone.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Modalidad</dt>
                <dd>
                  {[
                    answers.remoteAvailable ? "Remoto" : "",
                    answers.inPersonAvailable ? "Presencial" : "",
                  ]
                    .filter(Boolean)
                    .join(" y ")}
                </dd>
              </div>
              <div>
                <dt>Perfil</dt>
                <dd>
                  {answers.nonClinicalHelper
                    ? "Auxiliar no clínico"
                    : "Profesional clínico · revisión del equipo"}
                </dd>
              </div>
              <div>
                <dt>Áreas</dt>
                <dd>
                  {answers.supportAreas
                    .map(
                      (value) => needLabels[value as keyof typeof needLabels],
                    )
                    .join(", ")}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        {clientError || (serverErrorVisible && state?.message) ? (
          <p className="form-error" role="alert">
            {clientError || (serverErrorVisible && state?.message)}
          </p>
        ) : null}
        {filePending ? (
          <p className="hint" role="status">
            Preparando el archivo…
          </p>
        ) : null}
      </WizardFrame>
    </form>
  );
}
