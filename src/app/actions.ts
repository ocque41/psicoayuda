"use server";

import { createHash } from "node:crypto";
import { and, count, eq, gte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  allianceRequests,
  assignments,
  auditLogs,
  helpRequests,
  professionals,
  user,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import {
  assignRequestToProfessional,
  releaseAssignmentsForRequest,
  releaseProfessionalAssignments,
} from "@/lib/assignment";
import { getAuthSecret } from "@/lib/auth-secret";
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

async function getRequesterHash() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ip =
    requestHeaders.get("cf-connecting-ip") ||
    forwardedFor?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip");

  if (!ip) return undefined;

  return createHash("sha256").update(`${getAuthSecret()}:${ip}`).digest("hex");
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

  const requesterHash = await getRequesterHash();
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
  revalidatePath("/admin");
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

  revalidatePath("/admin");
}

export async function saveProfessionalOnboarding(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getServerSession();
  if (!session?.user?.id || !session.user.email) {
    redirect("/pro");
  }

  const raw = formEntries(formData);
  const parsed = professionalSchema.safeParse({
    ...raw,
    supportAreas: formData.getAll("supportAreas"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Error" };
  }

  const timestamp = nowIso();
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });

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
    crisisExperience: parsed.data.crisisExperience,
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

  if (existing) {
    // ponytail: no tocamos status al editar — preserva una posible suspensión/baja del admin.
    await db
      .update(professionals)
      .set({ ...values, ...(fpvFields ?? {}) })
      .where(eq(professionals.id, existing.id));
  } else {
    await db.insert(professionals).values({
      ...values,
      ...(fpvFields ?? {}),
      id: newId("pro"),
      // Sin verificación previa: el profesional queda activo al instante (la
      // marca "verificado FPV" es una señal adicional, no una puerta de acceso).
      status: "approved",
      currentActiveRequests: 0,
      createdAt: timestamp,
    });
  }

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
}

export async function adminUpdateProfessionalStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  const status = professionalStatusSchema.parse(formData.get("status"));
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

  await db
    .update(professionals)
    .set(updates)
    .where(eq(professionals.id, professionalId));

  // Al suspender/rechazar, libera capacidad y devuelve sus solicitudes a la
  // cola para reasignación: nadie queda huérfano y los cupos no se pierden.
  if (status === "suspended" || status === "rejected") {
    await releaseProfessionalAssignments(professionalId);
  }

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

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: actionByStatus[status],
    entityType: "professional",
    entityId: professionalId,
    createdAt: timestamp,
  });

  revalidatePath("/admin");
}

// Reclasifica el tipo de un profesional ya dado de alta: certificado (con
// credencial) ↔ auxiliar no clínico. El admin lo usa para corregir la elección
// del onboarding antes o después de aprobar. Solo toca la etiqueta de tipo.
export async function adminSetProfessionalKind(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const professionalId = String(formData.get("professionalId") ?? "");
  if (!professionalId) return;
  const nonClinicalHelper = formData.get("kind") === "non_clinical";
  const timestamp = nowIso();

  await db
    .update(professionals)
    .set({ nonClinicalHelper, updatedAt: timestamp })
    .where(eq(professionals.id, professionalId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: nonClinicalHelper
      ? "professional_kind_non_clinical"
      : "professional_kind_certified",
    entityType: "professional",
    entityId: professionalId,
    createdAt: timestamp,
  });

  revalidatePath("/admin");
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

  revalidatePath("/admin");
}

// Alta manual desde /admin de una cuenta que se registró pero no completó el
// onboarding. Crea un perfil aprobado con el tipo elegido (certificado o
// auxiliar no clínico), pero FUERA del directorio público (remoteAvailable=false)
// y sin aceptar solicitudes: no tiene áreas, bio ni credencial todavía. Cuando la
// persona complete su perfil en /pro/onboarding, ese formulario rellena los datos
// y activa su disponibilidad (saveProfessionalOnboarding no toca el status, así
// que sigue aprobado).
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
    revalidatePath("/admin");
    return;
  }

  // Si ya tiene perfil (dejó de estar "incompleto" entre la carga y el clic), no
  // duplicamos: el email tiene índice único y reventaría el insert.
  const existing = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
  });
  if (existing) {
    revalidatePath("/admin");
    return;
  }

  const timestamp = nowIso();
  await db.insert(professionals).values({
    id: newId("pro"),
    userId,
    email: account.email,
    fullName: account.name?.trim() || account.email,
    contactEmail: account.email,
    languages: JSON.stringify(["es"]),
    supportAreas: JSON.stringify([]),
    nonClinicalHelper,
    status: "approved",
    // Visible en el directorio y aceptando contacto desde el alta: el admin lo
    // aprueba para que ayude ya. La ficha empieza mínima (sin áreas ni bio); al
    // completar su perfil en /pro/onboarding se enriquece y entra en el matching.
    remoteAvailable: true,
    acceptingRequests: true,
    currentActiveRequests: 0,
    conductAcceptedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: nonClinicalHelper
      ? "professional_manual_approval_non_clinical"
      : "professional_manual_approval_certified",
    entityType: "professional",
    entityId: userId,
    createdAt: timestamp,
  });

  await notifyProfessionalApproved({
    professionalEmail: account.email,
    professionalName: account.name?.trim() || account.email,
    nonClinicalHelper,
  });

  revalidatePath("/admin");
}

export async function adminUpdateHelpRequestStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const requestId = String(formData.get("requestId") ?? "");
  const status = statusSchema.parse(formData.get("status"));
  const timestamp = nowIso();
  await db
    .update(helpRequests)
    .set({ status, updatedAt: timestamp })
    .where(eq(helpRequests.id, requestId));

  if (status === "closed") {
    // Cerrar libera la capacidad consumida del profesional asignado.
    await releaseAssignmentsForRequest(requestId);
    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: admin.email,
      action: "request_closure",
      entityType: "help_request",
      entityId: requestId,
      createdAt: timestamp,
    });
  }

  revalidatePath("/admin");
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

  revalidatePath("/admin");
}

export async function adminAnonymizeHelpRequest(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) redirect("/admin");

  // Anonimización end-to-end (solicitud + conversaciones + transcript del DO +
  // sesiones del seeker), compartida con el cron de retención.
  await anonymizeHelpRequest(requestId, admin.email);

  revalidatePath("/admin");
}
