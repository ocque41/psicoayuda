"use server";

import { createHash } from "node:crypto";
import { and, count, eq, gte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  helpRequests,
  professionals,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import {
  assignRequestToProfessional,
  releaseAssignmentsForRequest,
  releaseProfessionalAssignments,
} from "@/lib/assignment";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import {
  notifyAdminHelpRequest,
  notifyProfessionalAssignment,
} from "@/lib/notifications";
import {
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

  const timestamp = nowIso();
  const id = newId("req");
  await db.insert(helpRequests).values({
    id,
    email: parsed.data.email ?? "",
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
  redirect(`/ayuda/gracias?solicitud=${id}`);
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
    languages: formData.getAll("languages"),
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
    licenseNumber: parsed.data.licenseNumber,
    licenseCountry: parsed.data.licenseCountry,
    languages: JSON.stringify(parsed.data.languages),
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

  if (existing) {
    await db
      .update(professionals)
      .set({ ...values, status: "pending_verification" })
      .where(eq(professionals.id, existing.id));
  } else {
    await db.insert(professionals).values({
      ...values,
      id: newId("pro"),
      status: "pending_verification",
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
      ? { status, updatedAt: timestamp }
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
  const timestamp = nowIso();

  // Cierra y libera la capacidad de cualquier asignación activa antes de anonimizar.
  await releaseAssignmentsForRequest(requestId);

  // Retention default: close inactive requests after 30 days and anonymize
  // after 90 days unless safety or legal reasons require minimal records.
  await db
    .update(helpRequests)
    .set({
      // Token aleatorio: sin enlace residual al id de la solicitud original.
      email: `anon-${newId("anon")}@nido.local`,
      country: null,
      state: null,
      city: null,
      lat: null,
      lng: null,
      locationConsent: false,
      consentContact: false,
      requesterHash: null,
      status: "closed",
      anonymizedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(helpRequests.id, requestId));

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: "data_anonymization",
    entityType: "help_request",
    entityId: requestId,
    createdAt: timestamp,
  });

  revalidatePath("/admin");
}

export async function adminExportCsv() {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");
}
