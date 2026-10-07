"use server";

import { and, count, eq, gte, ne, or, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  accountOnboardingDrafts,
  allianceRequests,
  assignments,
  auditLogs,
  helpRequests,
  practiceCredentials,
  practiceSettings,
  professionals,
  user,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import {
  assignRequestToProfessional,
  closeAdministrativeAssignments,
  releaseProfessionalAssignments,
} from "@/lib/assignment";
import { getServerSession } from "@/lib/auth-server";
import { getFeedProfessionals } from "@/lib/feed";
import { verifyFpvByCedula } from "@/lib/fpv";
import { newId, nowIso } from "@/lib/ids";
import {
  notifyAdminHelpRequest,
  notifyAllianceApproved,
  notifyFoundationContact,
  notifyProfessionalApproved,
  notifyProfessionalAssignment,
} from "@/lib/notifications";
import { offerRequestToProfessionals } from "@/lib/offers";
import { validTimeZone } from "@/lib/onboarding/locale";
import { getRequesterHash } from "@/lib/requester-hash";
import { anonymizeHelpRequest } from "@/lib/retention";
import {
  allianceStatusSchema,
  foundationContactSchema,
  helpRequestSchema,
  professionalSchema,
  professionalStatusSchema,
  statusSchema,
} from "@/lib/validation";

function formEntries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

// Etiquetas humanas de los campos del alta profesional. El formulario ocupa 5
// secciones y el error se pinta al final: sin decir QUÉ campo falló, la persona
// no sabía dónde mirar (varias psicólogas abandonaron el registro por esto).
const PROFESSIONAL_FIELD_LABELS: Record<string, string> = {
  fullName: "Nombre completo",
  displayName: "Nombre para mostrar",
  country: "País",
  city: "Ciudad",
  university: "Universidad",
  fpvNumber: "Número FPV",
  cedula: "Cédula",
  supervisionInfo: "Supervisión",
  registrationType: "Tipo de registro",
  registrationDetail: "Detalle del registro",
  registrationProofDoc: "Comprobante de registro",
  phone: "WhatsApp",
  landline: "Teléfono fijo",
  emailPublic: "Correo público",
  photo: "Foto",
  supportAreas: "Áreas de apoyo",
  contactEmail: "Correo para coordinación",
  contactNotes: "Notas de contacto",
  shortBio: "Tu presentación",
  maxActiveRequests: "Personas a acompañar",
  offersPaidServices: "Servicios pagos",
  conductFreeService: "Pacto voluntario",
  conductNoClientCapture: "Pacto voluntario",
  conductConfidentiality: "Pacto voluntario",
  conductNoEmergencyGuarantee: "Pacto voluntario",
  conductCompetence: "Pacto voluntario",
};

// "«Campo»: mensaje" a partir del primer issue de Zod, para que la persona
// sepa exactamente qué corregir aunque el campo esté varias secciones arriba.
function firstIssueMessage(
  error: { issues: { message: string; path: PropertyKey[] }[] },
  labels: Record<string, string> = {},
) {
  const issue = error.issues[0];
  if (!issue) return "Revisa los datos del formulario.";
  const label = labels[String(issue.path[0])];
  return label ? `${label}: ${issue.message}` : issue.message;
}

async function isRateLimited(
  email: string | undefined,
  requesterHash?: string,
) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const conditions = [];
  if (email) {
    conditions.push(
      and(
        eq(helpRequests.email, email),
        gte(helpRequests.createdAt, oneHourAgo),
      ),
    );
  }
  if (requesterHash) {
    conditions.push(
      and(
        eq(helpRequests.requesterHash, requesterHash),
        gte(helpRequests.createdAt, oneHourAgo),
      ),
    );
  }
  // Sin correo ni IP no podemos limitar por estos ejes; no bloqueamos.
  if (conditions.length === 0) return false;

  const filters = conditions.length === 1 ? conditions[0] : or(...conditions);

  const [row] = await db
    .select({ total: count() })
    .from(helpRequests)
    .where(filters);

  return (row?.total ?? 0) >= 3;
}

export async function createHelpRequest(
  _prevState: unknown,
  formData: FormData,
) {
  const parsed = helpRequestSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Error" };
  }

  const requesterHash = await getRequesterHash("help_request");
  if (await isRateLimited(parsed.data.email, requesterHash)) {
    return {
      ok: false,
      message:
        "Recibimos varias solicitudes recientes con este correo o conexión. Intenta más tarde.",
    };
  }

  // "Enviar a todos" difunde la solicitud y, como el solicitante no tiene
  // sesión, el correo es la ÚNICA vía para avisarle cuando alguien acepte.
  // Exigirlo aquí evita un callejón sin salida silencioso.
  if (formData.get("enviarATodos") && !parsed.data.email) {
    return {
      ok: false,
      message:
        "Para “enviar a todos” necesitamos tu correo: es donde te avisaremos cuando alguien acepte. Agrégalo arriba, o habla directo por chat con un profesional.",
    };
  }

  const timestamp = nowIso();
  const id = newId("req");
  await db.insert(helpRequests).values({
    id,
    email: parsed.data.email ?? "",
    seekerName: parsed.data.seekerName ?? null,
    language: parsed.data.language,
    country: parsed.data.country || "Venezuela",
    state: parsed.data.state,
    city: parsed.data.city,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    locationConsent: parsed.data.locationConsent,
    needCategory: parsed.data.needCategory,
    urgency: parsed.data.urgency,
    consentContact: parsed.data.consentContact,
    requesterHash,
    status: "new",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Si la persona eligió a un profesional desde el feed, registramos su
  // preferencia como una sugerencia para ese profesional. No consume cupo (lo
  // confirma un coordinador) y la solicitud le llega igual al equipo.
  if (parsed.data.preferredProfessionalId) {
    try {
      const chosen = await db.query.professionals.findFirst({
        where: and(
          eq(professionals.id, parsed.data.preferredProfessionalId),
          eq(professionals.status, "approved"),
        ),
      });
      if (chosen) {
        await db.insert(assignments).values({
          id: newId("asg"),
          helpRequestId: id,
          professionalId: chosen.id,
          status: "suggested",
          source: "seeker_choice",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        await db.insert(auditLogs).values({
          id: newId("log"),
          actorEmail: null,
          action: "request_preference",
          entityType: "help_request",
          entityId: id,
          metadata: JSON.stringify({ professionalId: chosen.id }),
          createdAt: timestamp,
        });
      }
    } catch {
      // La preferencia es un extra: si falla, la solicitud igual queda
      // registrada y le llega al equipo de coordinación.
    }
  }

  await notifyAdminHelpRequest(id);

  // Atajo "Enviar a todos": difunde la solicitud a todos los profesionales
  // disponibles y lleva directo a la confirmación.
  if (formData.get("enviarATodos")) {
    const feed = await getFeedProfessionals();
    const sent = await offerRequestToProfessionals(
      id,
      feed.map((person) => person.id),
    );
    redirect(`/ayuda/gracias?solicitud=${id}&enviado=${sent}`);
  }

  redirect(`/ayuda/gracias?solicitud=${id}`);
}

/**
 * Formulario de fundaciones/organizaciones (/alianzas). Valida, GUARDA la
 * solicitud como pendiente (para que aparezca en /admin y se pueda aprobar) y
 * avisa al buzón de coordinación con los datos que la organización facilitó.
 */
export async function createFoundationContact(
  _prevState: unknown,
  formData: FormData,
) {
  // Honeypot anti-spam: un bot rellena el campo oculto "company". Si viene con
  // algo, fingimos éxito y no enviamos nada (no le damos pistas al bot).
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true as const };
  }

  const parsed = foundationContactSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      ok: false as const,
      message:
        parsed.error.issues[0]?.message ??
        "Revisa los datos e inténtalo de nuevo.",
    };
  }

  const timestamp = nowIso();
  await db.insert(allianceRequests).values({
    id: newId("alliance"),
    organizationName: parsed.data.organizationName,
    contactName: parsed.data.contactName,
    email: parsed.data.email,
    website: parsed.data.website,
    phone: parsed.data.phone,
    preferredContact: parsed.data.preferredContact,
    message: parsed.data.message,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // El aviso por correo es best-effort: si el proveedor falla, la solicitud ya
  // quedó guardada y visible en /admin, así que no perdemos el contacto.
  await notifyFoundationContact(parsed.data);
  revalidatePath("/admin", "layout");
  return { ok: true as const };
}

/**
 * Acción de admin: aprobar o rechazar una solicitud de alianza (formulario
 * /alianzas). Al APROBAR, avisa por correo a la organización. Deja rastro en el
 * log de auditoría, igual que la aprobación de profesionales.
 */
export async function adminUpdateAllianceStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const allianceId = String(formData.get("allianceId") ?? "");
  const status = allianceStatusSchema.parse(formData.get("status"));
  if (!allianceId) redirect("/admin");

  const timestamp = nowIso();
  await db
    .update(allianceRequests)
    .set({
      status,
      reviewedBy: admin.email,
      reviewedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(allianceRequests.id, allianceId));

  if (status === "approved") {
    const request = await db.query.allianceRequests.findFirst({
      where: eq(allianceRequests.id, allianceId),
    });
    if (request?.email) {
      await notifyAllianceApproved({
        email: request.email,
        organizationName: request.organizationName,
        contactName: request.contactName,
      });
    }
  }

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action:
      status === "approved"
        ? "alliance_approval"
        : status === "rejected"
          ? "alliance_rejection"
          : "alliance_pending",
    entityType: "alliance_request",
    entityId: allianceId,
    createdAt: timestamp,
  });

  revalidatePath("/admin", "layout");
}

export async function saveProfessionalOnboarding(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getServerSession();
  if (!session?.user?.id || !session.user.email) {
    redirect("/pro");
  }
  if (formData.get("expectedOwnerId") !== session.user.id)
    return {
      ok: false as const,
      message:
        "Tu sesión cambió. Vuelve a abrir este recorrido para continuar.",
    };

  const raw = formEntries(formData);
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });
  if (existing?.status === "deleting")
    return {
      ok: false as const,
      message:
        "Tu cuenta está en proceso de eliminación. Espera a que termine antes de guardar cambios.",
    };
  const requestedTimeZone = String(formData.get("timezone") ?? "");
  if (requestedTimeZone && !validTimeZone(requestedTimeZone)) {
    return {
      ok: false as const,
      message: "Elige una zona horaria válida.",
      field: "timezone",
    };
  }
  const parsed = professionalSchema.safeParse({
    ...raw,
    // Un comprobante ya recibido solo se lee desde el perfil de esta cuenta.
    // Editar otro dato no exige volver a enviar el documento ni lo borra.
    registrationProofDoc:
      raw.registrationProofDoc || existing?.registrationProofDoc || "",
    supportAreas: formData.getAll("supportAreas"),
  });

  if (!parsed.success) {
    // React 19 resetea los campos no controlados del <form> al terminar la
    // action; sin devolver lo enviado, un alta nueva perdía TODO lo tecleado
    // ante cualquier error de validación (pasó con psicólogas reales). Re-
    // emitimos los valores para que el formulario los repueble. Excluimos la
    // foto y el comprobante (van por estado del cliente, ya persisten) y la
    // cédula (no se guarda ni se re-muestra).
    const { photo: _p, registrationProofDoc: _d, cedula: _c, ...rest } = raw;
    return {
      ok: false as const,
      message: firstIssueMessage(parsed.error, PROFESSIONAL_FIELD_LABELS),
      field: String(parsed.error.issues[0]?.path[0] ?? ""),
      values: {
        ...rest,
        supportAreas: formData.getAll("supportAreas").map(String),
      } as Record<string, string> & { supportAreas: string[] },
    };
  }

  const timestamp = nowIso();

  const values = {
    userId: session.user.id,
    email: session.user.email,
    fullName: parsed.data.fullName,
    displayName: parsed.data.displayName,
    country: parsed.data.country,
    city: parsed.data.city,
    licenseNumber: parsed.data.licenseNumber ?? null,
    licenseCountry: parsed.data.licenseCountry ?? null,
    university: parsed.data.university ?? null,
    fpvNumber: parsed.data.fpvNumber ?? null,
    supervisionInfo: parsed.data.supervisionInfo ?? null,
    registrationType: parsed.data.registrationType ?? null,
    registrationDetail: parsed.data.registrationDetail ?? null,
    registrationProofDoc: parsed.data.registrationProofDoc ?? null,
    nonClinicalHelper: parsed.data.nonClinicalHelper,
    phone: parsed.data.phone ?? null,
    landline: parsed.data.landline ?? null,
    emailPublic: parsed.data.emailPublic,
    photo: parsed.data.photo ?? null,
    // Todos acompañan en español: el idioma ya no se pregunta en el alta.
    languages: JSON.stringify(["es"]),
    supportAreas: JSON.stringify(parsed.data.supportAreas),
    remoteAvailable: parsed.data.remoteAvailable,
    inPersonAvailable: parsed.data.inPersonAvailable,
    crisisExperience: parsed.data.crisisExperience,
    offersPaidServices: parsed.data.offersPaidServices,
    contactEmail: parsed.data.contactEmail || session.user.email,
    contactNotes: parsed.data.contactNotes,
    shortBio: parsed.data.shortBio,
    acceptingRequests: parsed.data.acceptingRequests,
    maxActiveRequests: parsed.data.maxActiveRequests,
    conductAcceptedAt: timestamp,
    updatedAt: timestamp,
  };

  // Verificación FPV: solo si aporta cédula + Nº FPV. La cédula NO se guarda
  // (se usa únicamente para consultar el registro oficial). Si la API falla,
  // `verifyFpvByCedula` degrada a "no verificado" sin lanzar, así el alta nunca
  // se rompe. Al editar sin cédula, `fpvFields` es null y NO tocamos las
  // columnas FPV (no borramos una verificación previa).
  const fpvFields =
    parsed.data.cedula && parsed.data.fpvNumber
      ? await verifyFpvByCedula({
          cedula: parsed.data.cedula,
          fpvNumber: parsed.data.fpvNumber,
          fullName: parsed.data.fullName,
          university: parsed.data.university ?? null,
        }).then((result) => ({
          fpvVerified: result.match,
          fpvVerifiedAt: result.match ? new Date() : null,
          fpvSnapshot: JSON.stringify(result),
        }))
      : null;

  const professionalId = existing?.id ?? newId("pro");
  const credentialChanged = Boolean(
    existing &&
      (existing.licenseNumber !== values.licenseNumber ||
        existing.licenseCountry !== values.licenseCountry ||
        existing.fpvNumber !== values.fpvNumber ||
        existing.supervisionInfo !== values.supervisionInfo ||
        existing.nonClinicalHelper !== values.nonClinicalHelper ||
        existing.registrationType !== values.registrationType ||
        existing.registrationDetail !== values.registrationDetail ||
        existing.registrationProofDoc !== values.registrationProofDoc),
  );
  const reviewChange =
    credentialChanged && existing?.status === "approved"
      ? { status: "pending_verification" }
      : {};
  const outdatedFpv =
    existing && existing.fpvNumber !== values.fpvNumber && !fpvFields
      ? { fpvVerified: false, fpvVerifiedAt: null }
      : {};
  const profileWrite = existing
    ? db
        .update(professionals)
        .set({
          ...values,
          ...reviewChange,
          ...outdatedFpv,
          ...(fpvFields ?? {}),
        })
        .where(
          and(
            eq(professionals.id, existing.id),
            eq(professionals.userId, session.user.id),
            ne(professionals.status, "deleting"),
          ),
        )
        .returning({ id: professionals.id })
    : db
        .insert(professionals)
        .values({
          ...values,
          ...(fpvFields ?? {}),
          id: professionalId,
          status: "pending_verification",
          currentActiveRequests: 0,
          createdAt: timestamp,
        })
        .returning({ id: professionals.id });
  // Se evalúa dentro del mismo batch que el perfil. Si la baja ganó la
  // carrera, tampoco se cambian preferencias, ámbitos ni memoria del alta.
  const profileSaved = sql`EXISTS(SELECT 1 FROM professionals p WHERE p.id=${professionalId} AND p.user_id=${session.user.id} AND p.status!='deleting' AND p.updated_at=${timestamp})`;
  const settingsWrite = requestedTimeZone
    ? [
        db
          .insert(practiceSettings)
          .select(
            sql`SELECT ${professionalId},${requestedTimeZone},9,18,${timestamp} WHERE ${profileSaved}`,
          )
          .onConflictDoUpdate({
            target: practiceSettings.professionalId,
            set: { timeZone: requestedTimeZone, updatedAt: timestamp },
          }),
      ]
    : [];
  const results = await db.batch([
    profileWrite,
    ...(credentialChanged
      ? [
          db
            .insert(auditLogs)
            .select(
              sql`SELECT ${newId("audit")},${session.user.email},'professional_credential_review_requested','professional',${professionalId},NULL,${timestamp} WHERE changes()=1`,
            ),
        ]
      : []),
    ...settingsWrite,
    ...(credentialChanged
      ? [
          db
            .update(practiceCredentials)
            .set({ expiresAt: timestamp })
            .where(
              and(
                eq(practiceCredentials.professionalId, professionalId),
                profileSaved,
              ),
            ),
        ]
      : []),
    db
      .delete(accountOnboardingDrafts)
      .where(
        and(
          eq(accountOnboardingDrafts.userId, session.user.id),
          eq(accountOnboardingDrafts.role, "pro"),
          profileSaved,
        ),
      ),
  ]);
  if (!results[0].length)
    return {
      ok: false as const,
      message:
        "Tu perfil inició su eliminación antes de guardar. Conservamos tu borrador; espera a que termine antes de hacer cambios.",
    };

  revalidateDirectoryViews();
  redirect("/pro/dashboard");
}

export async function updateProfessionalAvailability(formData: FormData) {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/pro");

  await db
    .update(professionals)
    .set({
      acceptingRequests: formData.get("acceptingRequests") === "on",
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(professionals.userId, session.user.id),
        eq(professionals.status, "approved"),
      ),
    );

  revalidatePath("/pro/dashboard");
  revalidateDirectoryViews();
}

/**
 * Activa/desactiva la etiqueta pública "ofrece servicios pagos" desde el panel.
 * La ayuda por el terremoto sigue siendo gratuita; esto solo habilita la sección
 * de paquetes y links de pago (módulo src/lib/payments). Solo profesionales
 * aprobados: es una etiqueta del directorio público.
 */
export async function updateProfessionalPaidServices(formData: FormData) {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/pro");

  await db
    .update(professionals)
    .set({
      offersPaidServices: formData.get("offersPaidServices") === "on",
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(professionals.userId, session.user.id),
        eq(professionals.status, "approved"),
      ),
    );

  revalidatePath("/pro/dashboard");
  revalidateDirectoryViews();
}

// Revalida las vistas públicas donde se lista a los profesionales. Llamar tras
// cualquier cambio que altere quién aparece o cómo (estado, visibilidad, tipo,
// disponibilidad). Mismo patrón que revalidatePartnerViews en actions-partners.
function revalidateDirectoryViews() {
  revalidatePath("/");
  revalidatePath("/profesionales");
  revalidatePath("/ayuda");
  // Invalida también el data cache de getCachedFeedProfessionals (tag cache D1):
  // sin esto, el directorio cacheado seguiría 60s con la foto/estado viejos.
  revalidateTag("professionals", { expire: 0 });
}

export async function adminUpdateProfessionalStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  const status = professionalStatusSchema.parse(formData.get("status"));
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.id, professionalId),
    columns: {
      id: true,
      status: true,
      nonClinicalHelper: true,
      userId: true,
      updatedAt: true,
      currentActiveRequests: true,
    },
  });
  if (!existing || existing.status === "deleting") redirect("/admin");
  if (
    status === "approved" &&
    existing.status === "pending_verification" &&
    !existing.nonClinicalHelper
  ) {
    redirect(`/admin/admision?candidato=${encodeURIComponent(existing.id)}`);
  }
  const timestamp = nowIso();
  const actionByStatus = {
    pending_verification: "professional_pending_verification",
    approved: "professional_approval",
    rejected: "professional_rejection",
    suspended: "professional_suspension",
  } as const;
  const updates =
    status === "approved"
      ? {
          status,
          // Al aprobar, hazlo VISIBLE y contactable en el directorio: el feed
          // público exige remoteAvailable=true, así que sin esto un aprobado con
          // remoteAvailable=false quedaba oculto en home y /profesionales. Mismo
          // criterio que adminApproveIncompleteRegistration. Se puede ocultar
          // luego con el botón Mostrar/Ocultar (adminSetProfessionalVisibility).
          remoteAvailable: true,
          acceptingRequests: true,
          updatedAt: timestamp,
        }
      : { status, acceptingRequests: false, updatedAt: timestamp };

  if (status === "suspended" || status === "rejected") {
    if (!admin.session?.session?.id) redirect("/pro");
    await closeAdministrativeAssignments({
      kind: "professional",
      id: professionalId,
      status,
      expected: existing,
      actor: {
        userId: admin.session.user.id,
        email: admin.email,
        sessionId: admin.session.session.id,
      },
    });
    revalidatePath("/admin", "layout");
    revalidateDirectoryViews();
    return;
  }

  const results = await db.batch([
    db
      .update(professionals)
      .set(updates)
      .where(
        and(
          eq(professionals.id, professionalId),
          ne(professionals.status, "deleting"),
          status === "approved"
            ? or(
                ne(professionals.status, "pending_verification"),
                eq(professionals.nonClinicalHelper, true),
              )
            : undefined,
        ),
      )
      .returning({ id: professionals.id }),
    db
      .insert(auditLogs)
      .select(
        sql`SELECT ${newId("log")},${admin.email},${actionByStatus[status]},'professional',${professionalId},NULL,${timestamp} WHERE changes()=1`,
      ),
  ]);
  if (!results[0].length) redirect("/admin");

  // Al aprobar, avisamos al profesional por correo (best-effort) — el panel ya
  // le prometía "te avisaremos por correo".
  if (status === "approved") {
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
    });
    if (pro?.email) {
      await notifyProfessionalApproved({
        professionalEmail: pro.email,
        professionalName: pro.displayName ?? pro.fullName,
        nonClinicalHelper: pro.nonClinicalHelper,
      });
    }
  }

  revalidatePath("/admin", "layout");
  revalidateDirectoryViews();
}

// Reclasifica perfiles existentes. Pasar de auxiliar a clínico inicia Admisión
// y retira sus ámbitos anteriores; no convierte una aprobación auxiliar en
// acreditación clínica. Repetir el mismo tipo no altera el perfil.
export async function adminSetProfessionalKind(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  if (!professionalId) return;
  const nonClinicalHelper = formData.get("kind") === "non_clinical";
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.id, professionalId),
    columns: { id: true, status: true, nonClinicalHelper: true },
  });
  if (!existing || existing.status === "deleting") redirect("/admin");
  if (existing.nonClinicalHelper === nonClinicalHelper) return;
  const timestamp = nowIso();
  const auditId = newId("log");
  const results = await db.batch([
    db
      .update(professionals)
      .set(
        nonClinicalHelper
          ? { nonClinicalHelper, updatedAt: timestamp }
          : {
              nonClinicalHelper,
              status: "pending_verification",
              credentialConfirmed: false,
              acceptingRequests: false,
              updatedAt: timestamp,
            },
      )
      .where(
        and(
          eq(professionals.id, professionalId),
          ne(professionals.status, "deleting"),
          eq(professionals.nonClinicalHelper, existing.nonClinicalHelper),
        ),
      )
      .returning({ id: professionals.id }),
    db
      .insert(auditLogs)
      .select(
        sql`SELECT ${auditId},${admin.email},${nonClinicalHelper ? "professional_kind_non_clinical" : "professional_kind_certified"},'professional',${professionalId},NULL,${timestamp} WHERE changes()=1`,
      ),
    ...(!nonClinicalHelper
      ? [
          db
            .update(practiceCredentials)
            .set({ expiresAt: timestamp })
            .where(
              and(
                eq(practiceCredentials.professionalId, professionalId),
                sql`${practiceCredentials.expiresAt} > ${timestamp}`,
                sql`EXISTS(SELECT 1 FROM audit_logs WHERE id=${auditId})`,
              ),
            ),
        ]
      : []),
  ]);
  if (!results[0].length) redirect("/admin");
  if (!nonClinicalHelper) await releaseProfessionalAssignments(professionalId);

  revalidatePath("/admin", "layout");
  revalidateDirectoryViews();
  if (!nonClinicalHelper)
    redirect(`/admin/admision?candidato=${encodeURIComponent(existing.id)}`);
}

// Muestra u oculta a un profesional del directorio público (remoteAvailable).
// Sirve para publicar a quien se aprobó con ficha mínima (p. ej. auxiliares dados
// de alta manualmente, que antes quedaban ocultos) o para retirar a alguien sin
// rechazarlo. El feed público exige status='approved' Y remoteAvailable.
export async function adminSetProfessionalVisibility(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  if (!professionalId) return;
  const remoteAvailable = formData.get("visible") === "true";
  const timestamp = nowIso();

  await db
    .update(professionals)
    .set({ remoteAvailable, updatedAt: timestamp })
    .where(eq(professionals.id, professionalId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: remoteAvailable ? "professional_shown" : "professional_hidden",
    entityType: "professional",
    entityId: professionalId,
    createdAt: timestamp,
  });

  revalidatePath("/admin", "layout");
  revalidateDirectoryViews();
}

// Confirma (o revierte) MANUALMENTE la credencial de un profesional sin
// verificación automática (fuera de Venezuela, donde no hay FPV). El admin la
// marca tras cotejar su nº de colegiado / cédula profesional con el registro
// oficial del país. Es un sello interno (solo /admin), no toca el directorio
// público ni el estado de aprobación: el profesional sigue activo mientras tanto.
export async function adminSetCredentialConfirmed(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  if (!professionalId) return;
  const confirmed = formData.get("confirmed") === "true";
  const timestamp = nowIso();

  await db
    .update(professionals)
    .set({ credentialConfirmed: confirmed, updatedAt: timestamp })
    .where(eq(professionals.id, professionalId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: confirmed ? "credential_confirmed" : "credential_unconfirmed",
    entityType: "professional",
    entityId: professionalId,
    createdAt: timestamp,
  });

  revalidatePath("/admin", "layout");
}

// Alta manual desde /admin: una cuenta clínica incompleta inicia Admisión,
// sin aprobación ni aceptación de condiciones inventadas. El auxiliar conserva
// su alta no clínica. La ficha mínima debe completar el onboarding.
export async function adminApproveIncompleteRegistration(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const nonClinicalHelper = formData.get("kind") === "non_clinical";

  const [account] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account?.email) {
    revalidatePath("/admin", "layout");
    return;
  }

  // Si ya tiene perfil (dejó de estar "incompleto" entre la carga y el clic), no
  // duplicamos: el email tiene índice único y reventaría el insert.
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
  });
  if (existing) {
    revalidatePath("/admin", "layout");
    return;
  }

  const timestamp = nowIso();
  const professionalId = newId("pro");
  const results = await db.batch([
    db
      .insert(professionals)
      .values({
        id: professionalId,
        userId,
        email: account.email,
        fullName: account.name?.trim() || account.email,
        contactEmail: account.email,
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify([]),
        nonClinicalHelper,
        // El alta mínima clínica inicia Admisión; no declara cotejos,
        // entrevista ni aceptación del candidato que no se han realizado.
        status: nonClinicalHelper ? "approved" : "pending_verification",
        remoteAvailable: true,
        acceptingRequests: nonClinicalHelper,
        currentActiveRequests: 0,
        conductAcceptedAt: nonClinicalHelper ? timestamp : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing()
      .returning({ id: professionals.id }),
    db
      .insert(auditLogs)
      .select(
        sql`SELECT ${newId("log")},${admin.email},${nonClinicalHelper ? "professional_manual_approval_non_clinical" : "professional_manual_draft_for_admission"},'professional',${userId},NULL,${timestamp} WHERE changes()=1`,
      ),
  ]);
  if (!results[0].length) {
    revalidatePath("/admin", "layout");
    return;
  }

  if (!nonClinicalHelper) {
    revalidatePath("/admin", "layout");
    revalidateDirectoryViews();
    redirect(`/admin/admision?candidato=${encodeURIComponent(professionalId)}`);
  }

  await notifyProfessionalApproved({
    professionalEmail: account.email,
    professionalName: account.name?.trim() || account.email,
    nonClinicalHelper,
  });

  revalidatePath("/admin", "layout");
  revalidateDirectoryViews();
}

export async function adminUpdateHelpRequestStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const requestId = String(formData.get("requestId") ?? "");
  const status = statusSchema.parse(formData.get("status"));
  const timestamp = nowIso();
  if (status === "closed") {
    if (!admin.session?.session?.id) redirect("/pro");
    await closeAdministrativeAssignments({
      kind: "request",
      id: requestId,
      actor: {
        userId: admin.session.user.id,
        email: admin.email,
        sessionId: admin.session.session.id,
      },
    });
  } else {
    await db
      .update(helpRequests)
      .set({ status, updatedAt: timestamp })
      .where(eq(helpRequests.id, requestId));
  }

  revalidatePath("/admin", "layout");
}

export async function adminAssignRequest(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const helpRequestId = String(formData.get("helpRequestId") ?? "");
  const professionalId = String(formData.get("professionalId") ?? "");
  const result = await assignRequestToProfessional({
    helpRequestId,
    professionalId,
    actorEmail: admin.email,
  });

  if (result.ok) {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
    });
    if (professional?.contactEmail) {
      await notifyProfessionalAssignment(professional.contactEmail);
    }
  }

  revalidatePath("/admin", "layout");
}

export async function adminAnonymizeHelpRequest(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/admin");

  // Anonimización end-to-end (solicitud + conversaciones + transcript del DO +
  // sesiones del seeker), compartida con el cron de retención.
  await anonymizeHelpRequest(requestId, admin.email);

  revalidatePath("/admin", "layout");
}
